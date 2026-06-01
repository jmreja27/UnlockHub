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

// Calcula el XP total acumulado por un usuario en una plataforma específica
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

export async function upsertUserScore(
  userId: string,
  totalXp: number,
  platforms: string[],
) {
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

export async function removeUserFromRankings(userId: string, platforms: string[]) {
  const pipeline = redis.pipeline();
  pipeline.zrem(KEYS.global, userId);
  for (const platform of platforms) pipeline.zrem(KEYS.platform(platform), userId);
  await pipeline.exec();
}

// ─── Lectura ──────────────────────────────────────────────────────────────────

export async function getGlobalRanking(
  page: number,
  limit: number,
): Promise<PaginatedResponse<RankingEntry>> {
  return getRankingFromKey(KEYS.global, page, limit);
}

export async function getPlatformRanking(
  platform: string,
  page: number,
  limit: number,
): Promise<PaginatedResponse<RankingEntry>> {
  return getRankingFromKey(KEYS.platform(platform), page, limit);
}

export async function getUserRank(userId: string): Promise<{
  rank: number | null;
  xp: number;
}> {
  const [rankRaw, scoreRaw] = await Promise.all([
    redis.zrevrank(KEYS.global, userId),
    redis.zscore(KEYS.global, userId),
  ]);

  return {
    rank: rankRaw !== null ? rankRaw + 1 : null,
    xp: scoreRaw !== null ? Math.round(parseFloat(scoreRaw)) : 0,
  };
}

// ─── Snapshot diario a PostgreSQL ─────────────────────────────────────────────

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

// Reconstruye Redis desde la BD en caso de pérdida de datos (reinicio, flush)
export async function seedRankingsFromDb() {
  const users = await prisma.user.findMany({
    select: { id: true, xp: true, platformAccounts: { select: { platform: true } } },
  });

  for (const user of users) {
    const platforms = user.platformAccounts.map((a) => a.platform);
    await upsertUserScore(user.id, user.xp, platforms);
  }

  logger.info({ count: users.length }, 'Rankings reconstruidos desde BD');
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

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
