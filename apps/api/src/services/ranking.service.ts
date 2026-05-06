import { redis } from '../lib/redis';
import { prisma } from '../lib/prisma';
import type { RankingEntry, PaginatedResponse } from '@unlockhub/types';

// Claves de Redis Sorted Sets (score = XP, mayor score = mayor rango)
const KEYS = {
  global: 'ranking:global',
  country: (code: string) => `ranking:global:${code.toLowerCase()}`,
  platform: (p: string) => `ranking:platform:${p.toLowerCase()}`,
};

// ─── Escritura ────────────────────────────────────────────────────────────────

export async function upsertUserScore(
  userId: string,
  xp: number,
  countryCode: string | null,
  platforms: string[],
) {
  const pipeline = redis.pipeline();

  pipeline.zadd(KEYS.global, xp, userId);

  if (countryCode) {
    pipeline.zadd(KEYS.country(countryCode), xp, userId);
  }

  for (const platform of platforms) {
    pipeline.zadd(KEYS.platform(platform), xp, userId);
  }

  await pipeline.exec();
}

export async function removeUserFromRankings(userId: string, countryCode: string | null, platforms: string[]) {
  const pipeline = redis.pipeline();
  pipeline.zrem(KEYS.global, userId);
  if (countryCode) pipeline.zrem(KEYS.country(countryCode), userId);
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

export async function getCountryRanking(
  countryCode: string,
  page: number,
  limit: number,
): Promise<PaginatedResponse<RankingEntry>> {
  return getRankingFromKey(KEYS.country(countryCode), page, limit);
}

export async function getPlatformRanking(
  platform: string,
  page: number,
  limit: number,
): Promise<PaginatedResponse<RankingEntry>> {
  return getRankingFromKey(KEYS.platform(platform), page, limit);
}

export async function getUserRank(userId: string): Promise<{
  global: number | null;
  globalTotal: number;
}> {
  const [rankRaw, total] = await Promise.all([
    redis.zrevrank(KEYS.global, userId),
    redis.zcard(KEYS.global),
  ]);

  return {
    global: rankRaw !== null ? rankRaw + 1 : null,
    globalTotal: total,
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
    select: { id: true, xp: true, countryCode: true, platformAccounts: { select: { platform: true } } },
  });

  for (const user of users) {
    const platforms = user.platformAccounts.map((a) => a.platform);
    await upsertUserScore(user.id, user.xp, user.countryCode, platforms);
  }

  console.warn(`Rankings reconstruidos desde BD: ${users.length} usuarios`);
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
    userIds.push(uid);
    scores[uid] = parseInt(entries[i + 1] as string, 10);
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
