import { prisma } from '../lib/prisma';
import { redis } from '../lib/redis';
import { syncQueue } from '../jobs/sync.queue';

interface AdminMetrics {
  users: {
    total: number;
    registeredToday: number;
    registeredThisWeek: number;
    premiumActive: number;
  };
  syncs: {
    completedLast24h: number;
    failedLast24h: number;
    queueDepth: number;
  };
  errors: {
    serverErrors5xxLast24h: number;
  };
  steam: {
    apiCallsToday: number;
    apiCallsLimitPercent: number;
  };
  ugc: {
    guidesReportedPending: number;
  };
}

const STEAM_DAILY_LIMIT = 100_000;

export async function getAdminMetrics(): Promise<AdminMetrics> {
  const now = new Date();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - 7);
  const [
    totalUsers,
    registeredToday,
    registeredThisWeek,
    premiumActive,
    guidesReportedPending,
    queueCounts,
  ] = await Promise.all([
    prisma.user.count({ where: { deletedAt: null } }),
    prisma.user.count({ where: { createdAt: { gte: startOfToday }, deletedAt: null } }),
    prisma.user.count({ where: { createdAt: { gte: startOfWeek }, deletedAt: null } }),
    prisma.user.count({ where: { isPremium: true, deletedAt: null } }),
    prisma.achievementGuide.count({ where: { reported: true } }),
    syncQueue.getJobCounts('waiting', 'active', 'delayed'),
  ]);

  // Syncs completados y fallidos en las últimas 24h desde Redis (contadores incrementales)
  const syncCompletedKey = `metrics:sync:completed:${startOfToday.toISOString().slice(0, 10)}`;
  const syncFailedKey = `metrics:sync:failed:${startOfToday.toISOString().slice(0, 10)}`;
  const errorsKey = `metrics:errors:5xx:${startOfToday.toISOString().slice(0, 10)}`;
  const steamApiKey = `steam:api:calls:${startOfToday.toISOString().slice(0, 10)}`;

  const [syncCompleted, syncFailed, errors5xx, steamCalls] = await Promise.all([
    redis.get(syncCompletedKey),
    redis.get(syncFailedKey),
    redis.get(errorsKey),
    redis.get(steamApiKey),
  ]);

  const steamCallsNum = parseInt(steamCalls ?? '0', 10);

  return {
    users: {
      total: totalUsers,
      registeredToday,
      registeredThisWeek,
      premiumActive,
    },
    syncs: {
      completedLast24h: parseInt(syncCompleted ?? '0', 10),
      failedLast24h: parseInt(syncFailed ?? '0', 10),
      queueDepth: (queueCounts.waiting ?? 0) + (queueCounts.active ?? 0) + (queueCounts.delayed ?? 0),
    },
    errors: {
      serverErrors5xxLast24h: parseInt(errors5xx ?? '0', 10),
    },
    steam: {
      apiCallsToday: steamCallsNum,
      apiCallsLimitPercent: Math.round((steamCallsNum / STEAM_DAILY_LIMIT) * 100),
    },
    ugc: {
      guidesReportedPending,
    },
  };
}
