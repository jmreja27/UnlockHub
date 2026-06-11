import type { Platform } from '@prisma/client';
import type { RankingEntry, PaginatedResponse } from '@unlockhub/types';

import { redis } from '../lib/redis';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';

// Claves de Redis Sorted Sets (score = XP, mayor score = mayor rango)
const KEYS = {
  global: 'ranking:global',
  platform: (p: string) => `ranking:platform:${p.toLowerCase()}`,
};

// ─── Helpers internos ─────────────────────────────────────────────────────────

/**
 * Calcula el XP total acumulado por un usuario en una plataforma específica.
 * Suma normalizedPoints de todos los UserAchievement del usuario para esa plataforma.
 */
async function getPlatformXp(userId: string, platform: string): Promise<number> {
  const achievements = await prisma.userAchievement.findMany({
    where: {
      userId,
      achievement: { platform: platform as Platform },
    },
    select: {
      achievement: { select: { normalizedPoints: true } },
    },
  });
  return achievements.reduce((sum, ua) => sum + ua.achievement.normalizedPoints, 0);
}

// ─── Escritura ────────────────────────────────────────────────────────────────

/**
 * Actualiza la puntuación del usuario en todos los sorted sets de Redis.
 * - ranking:global → totalXp del usuario
 * - ranking:platform:{p} → XP acumulado SOLO en esa plataforma (calculado con getPlatformXp)
 * Si profileVisibility no es PUBLIC, se omite el upsert (el usuario no aparece en rankings).
 * Las queries de XP por plataforma se ejecutan en paralelo para minimizar latencia.
 */
export async function upsertUserScore(
  userId: string,
  totalXp: number,
  platforms: string[],
  profileVisibility?: string,
) {
  // Perfiles no públicos no aparecen en rankings
  if (profileVisibility === 'FRIENDS_ONLY' || profileVisibility === 'PRIVATE') {
    return;
  }

  // Global: score = XP total del usuario
  await redis.zadd(KEYS.global, totalXp, userId);

  // Plataformas: score = XP ganado SOLO en esa plataforma — queries en paralelo
  if (platforms.length > 0) {
    const platformXps = await Promise.all(platforms.map((p) => getPlatformXp(userId, p)));
    await Promise.all(
      platforms.map((p, i) => redis.zadd(KEYS.platform(p), platformXps[i] ?? 0, userId)),
    );
  }
}

/**
 * Elimina al usuario de todos los sorted sets de ranking en Redis.
 * Se llama al desvincular una plataforma o al borrar la cuenta (GDPR).
 * Usa pipeline para ejecutar todos los ZREM en una sola round-trip a Redis.
 */
export async function removeUserFromRankings(userId: string, platforms: string[]) {
  const pipeline = redis.pipeline();
  pipeline.zrem(KEYS.global, userId);
  for (const platform of platforms) pipeline.zrem(KEYS.platform(platform), userId);
  await pipeline.exec();
}

// ─── Lectura ──────────────────────────────────────────────────────────────────

/** Devuelve la página solicitada del ranking global desde Redis. */
export async function getGlobalRanking(
  page: number,
  limit: number,
): Promise<PaginatedResponse<RankingEntry>> {
  return getRankingFromKey(KEYS.global, page, limit);
}

/** Devuelve la página solicitada del ranking de una plataforma desde Redis. */
export async function getPlatformRanking(
  platform: string,
  page: number,
  limit: number,
): Promise<PaginatedResponse<RankingEntry>> {
  return getRankingFromKey(KEYS.platform(platform), page, limit);
}

/**
 * Devuelve el rango y XP de un usuario en el ranking global o de plataforma.
 * @param userId - ID del usuario en Redis (cuid de Prisma)
 * @param platform - Si se proporciona, consulta el sorted set de plataforma; si no, el global.
 * @returns rank (posición 1-based) o null si el usuario no está en el ranking; xp en puntos.
 */
export async function getUserRank(
  userId: string,
  platform?: string,
): Promise<{
  rank: number | null;
  xp: number;
}> {
  // Sin filtro → sorted set global; con filtro → sorted set de plataforma
  const key = platform ? KEYS.platform(platform) : KEYS.global;

  const [rankRaw, scoreRaw] = await Promise.all([
    redis.zrevrank(key, userId),
    redis.zscore(key, userId),
  ]);

  return {
    rank: rankRaw !== null ? rankRaw + 1 : null,
    xp: scoreRaw !== null ? Math.round(parseFloat(scoreRaw)) : 0,
  };
}

// ─── Snapshot diario a PostgreSQL ─────────────────────────────────────────────

/**
 * Guarda un snapshot del ranking global actual en PostgreSQL para histórico.
 * Se ejecuta diariamente desde el ranking scheduler.
 * Procesa los usuarios en lotes de 500 para no sobrecargar Prisma.
 */
export async function takeRankingSnapshot() {
  const total = await redis.zcard(KEYS.global);
  if (total === 0) return;

  // Obtener todo el ranking global (puede ser grande, se procesa en lotes)
  const BATCH = 500;
  const now = new Date();

  for (let offset = 0; offset < total; offset += BATCH) {
    const entries = await redis.zrevrange(KEYS.global, offset, offset + BATCH - 1, 'WITHSCORES');

    const snapshots = [];
    for (let i = 0; i < entries.length; i += 2) {
      const userId = entries[i] as string;
      const xp = parseInt(entries[i + 1] as string, 10);
      if (!userId || Number.isNaN(xp)) continue;
      const rank = offset + i / 2 + 1;
      snapshots.push({ userId, rank, xp, snapshotAt: now });
    }

    await prisma.rankingSnapshot.createMany({ data: snapshots, skipDuplicates: true });
  }
}

// ─── Inicialización desde PostgreSQL ──────────────────────────────────────────

/**
 * Reconstruye los sorted sets de Redis desde la BD en caso de pérdida de datos
 * (reinicio de Redis, flush accidental, pérdida de persistencia AOF).
 * Ejecutar manualmente si Redis queda vacío y los rankings no se muestran.
 */
export async function seedRankingsFromDb() {
  const users = await prisma.user.findMany({
    where: { profileVisibility: 'PUBLIC', deletedAt: null },
    select: { id: true, xp: true, platformAccounts: { select: { platform: true } } },
  });

  for (const user of users) {
    const platforms = user.platformAccounts.map((a) => a.platform);
    await upsertUserScore(user.id, user.xp, platforms);
  }

  logger.info({ count: users.length }, 'Rankings reconstruidos desde BD');
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Lee un ranking paginado desde un sorted set de Redis y enriquece con datos de usuario de BD.
 * Usa ZREVRANGE (mayor XP primero). O(log n + k) en Redis.
 */
async function getRankingFromKey(
  key: string,
  page: number,
  limit: number,
): Promise<PaginatedResponse<RankingEntry>> {
  const offset = (page - 1) * limit;
  const total = await redis.zcard(key);

  if (total === 0) {
    return { data: [], total: 0, page, limit };
  }

  const entries = await redis.zrevrange(key, offset, offset + limit - 1, 'WITHSCORES');

  const userIds: string[] = [];
  const scores: Record<string, number> = {};

  for (let i = 0; i < entries.length; i += 2) {
    const uid = entries[i] as string;
    const xp = parseInt(entries[i + 1] as string, 10);
    if (!uid || Number.isNaN(xp)) continue;
    userIds.push(uid);
    scores[uid] = xp;
  }

  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, username: true, avatar: true, countryCode: true },
  });

  const userMap = Object.fromEntries(users.map((u) => [u.id, u]));

  const data: RankingEntry[] = userIds
    .filter((uid) => userMap[uid])
    .map((uid, idx) => ({
      userId: uid,
      username: userMap[uid]!.username,
      avatar: userMap[uid]!.avatar,
      countryCode: userMap[uid]!.countryCode,
      xp: scores[uid] ?? 0,
      rank: offset + idx + 1,
    }));

  return { data, total, page, limit };
}
