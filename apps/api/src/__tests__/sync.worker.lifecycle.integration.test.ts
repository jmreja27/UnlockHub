/**
 * Tests de integración del HANDLER REAL contra Redis real (T129/TESTS-2 #4 + aislamiento e2e de
 * TESTS-3) — desbloqueados por T140, que extrajo `processSyncJob` de `startSyncWorker` como
 * función exportada e importable sin instanciar un `Worker` de BullMQ.
 *
 * Mockeado (igual que el unit test `sync.worker.test.ts`): los 4 adapters de plataforma, Prisma,
 * los servicios auxiliares (`user.service`, `ranking.service`, `notification.service`,
 * `inapp-notification.service`) y `logger`. `lib/socket` NO se mockea — `getIOSafe()` ya captura
 * el throw de `getIO()` cuando no hay socket inicializado en el proceso de test y devuelve `null`,
 * así que dejarlo real es más simple y sigue siendo determinista.
 *
 * REAL (sin mockear, como TESTS-3): `lib/redis` y `jobs/sync.queue` — el objetivo es probar que
 * `processSyncJob` usa correctamente el lock (`sync:user-lock:{userId}`) y las claves de progreso
 * (`sync:progress:{userId}:{platform}`) de Redis de verdad, no una implementación de mock que
 * siempre resuelve lo que el test configura.
 *
 * El `job` que recibe `processSyncJob` se fabrica a mano en lugar de encolarlo en BullMQ real —
 * la rama batch solo lee `job.data`, `job.id` y usa `job.token` + `job.extendLock()`; no hace
 * falta un Worker ni una cola con jobs reales para ejercer esa lógica.
 */

jest.mock('../lib/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock('../services/user.service', () => ({
  addXp: jest.fn().mockResolvedValue({ newXp: 100, newLevel: 1, leveledUp: false }),
  invalidateUserPublicCache: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../services/ranking.service', () => ({
  upsertUserScore: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../lib/prisma', () => ({
  prisma: {
    platformAccount: { findUnique: jest.fn(), upsert: jest.fn(), findMany: jest.fn() },
    userAchievement: { findMany: jest.fn() },
    user: { update: jest.fn(), findUnique: jest.fn() },
  },
}));

jest.mock('../services/notification.service', () => ({
  sendPush: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../services/inapp-notification.service', () => ({
  createNotification: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../platforms/steam.adapter', () => ({
  steamAdapter: { platform: 'STEAM', syncUser: jest.fn(), syncUserBatched: undefined, syncUserExpress: jest.fn() },
}));
jest.mock('../platforms/retroachievements.adapter', () => ({
  retroAchievementsAdapter: { platform: 'RA', syncUser: jest.fn(), syncUserExpress: jest.fn() },
}));
jest.mock('../platforms/psn.adapter', () => ({
  psnAdapter: { platform: 'PSN', syncUser: jest.fn(), syncUserExpress: jest.fn() },
}));
jest.mock('../platforms/xbox.adapter', () => ({
  xboxAdapter: { platform: 'XBOX', syncUser: jest.fn() },
}));

import type { Job } from 'bullmq';
import { redis } from '../lib/redis';
import { syncQueue } from '../jobs/sync.queue';
import type { AnySyncJobData, SyncBatchJobData, SyncJobResult } from '../jobs/sync.queue';
import { prisma } from '../lib/prisma';
import { processSyncJob } from '../jobs/sync.worker';
import { steamAdapter } from '../platforms/steam.adapter';
import { retroAchievementsAdapter } from '../platforms/retroachievements.adapter';

const mockPrisma = prisma as jest.Mocked<typeof prisma>;
const mockSteamAdapter = steamAdapter as jest.Mocked<typeof steamAdapter>;
const mockRaAdapter = retroAchievementsAdapter as jest.Mocked<typeof retroAchievementsAdapter>;

function makeAccount(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'acc-1',
    userId: 'lifecycle-user',
    platform: 'STEAM' as const,
    externalId: '76561198000000000',
    username: 'testuser',
    encryptedToken: 'enc',
    lastSyncedAt: null,
    syncCooldownUntil: null,
    requiresReauth: false,
    psnProfilePrivate: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeBatchJob(
  userId: string,
  platforms: SyncBatchJobData['platforms'],
  id = 'test-job-1',
): Job<AnySyncJobData, SyncJobResult> {
  const data: SyncBatchJobData = { userId, platforms, triggerType: 'auto' };
  return {
    id,
    data,
    token: 'test-token',
    extendLock: jest.fn().mockResolvedValue(undefined),
  } as unknown as Job<AnySyncJobData, SyncJobResult>;
}

async function cleanupUserKeys(userId: string, platforms: string[]) {
  const keys = [
    `sync:user-lock:${userId}`,
    ...platforms.map((p) => `sync:progress:${userId}:${p}`),
  ];
  await redis.del(...keys);
}

describe('processSyncJob — lifecycle del handler real contra Redis real (T129/TESTS-2 #4, TESTS-3 e2e)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.platformAccount.upsert.mockResolvedValue(makeAccount() as never);
    (mockPrisma.platformAccount.findMany as jest.Mock).mockResolvedValue([makeAccount()]);
    mockPrisma.user.update.mockResolvedValue({ id: 'lifecycle-user' } as never);
    mockPrisma.userAchievement.findMany.mockResolvedValue([]);
  });

  afterAll(async () => {
    await syncQueue.close();
    await redis.quit();
  });

  describe('TEST 1 — repetibilidad: 2ª ejecución tras la 1ª (caza T124/T128)', () => {
    const userId = 'tests2-repeat-user';
    const lockKey = `sync:user-lock:${userId}`;
    const progressKey = `sync:progress:${userId}:STEAM`;

    afterEach(async () => {
      await cleanupUserKeys(userId, ['STEAM']);
    });

    it('libera lock y progress tras completar, y vuelve a adquirirlos limpio en la 2ª ejecución', async () => {
      mockPrisma.platformAccount.findUnique.mockResolvedValue(
        makeAccount({ userId }) as never,
      );
      mockSteamAdapter.syncUser.mockResolvedValue({
        platform: 'STEAM',
        achievementsSynced: 3,
        gamesUpdated: 1,
        syncedAt: new Date().toISOString(),
      });

      const job1 = makeBatchJob(userId, [{ platform: 'STEAM', platformAccountId: 'acc-1' }]);
      const result1 = await processSyncJob(job1);

      expect(result1).toMatchObject({ achievementsSynced: 3, gamesUpdated: 1 });
      expect(await redis.exists(lockKey)).toBe(0);
      expect(await redis.exists(progressKey)).toBe(0);

      const job2 = makeBatchJob(
        userId,
        [{ platform: 'STEAM', platformAccountId: 'acc-1' }],
        'test-job-2',
      );
      const result2 = await processSyncJob(job2);

      expect(result2).toMatchObject({ achievementsSynced: 3, gamesUpdated: 1 });
      expect(await redis.exists(lockKey)).toBe(0);
      expect(await redis.exists(progressKey)).toBe(0);

      expect(mockSteamAdapter.syncUser).toHaveBeenCalledTimes(2);
    });
  });

  describe('TEST 2 — contención de lock: 2º job abandona sin tocar el lock del 1º', () => {
    const userId = 'tests2-contention-user';
    const lockKey = `sync:user-lock:${userId}`;

    afterEach(async () => {
      await cleanupUserKeys(userId, ['STEAM']);
    });

    it('abandona limpio con lock ocupado, sin invocar adapters ni pisar el lock preexistente', async () => {
      const acquired = await redis.set(lockKey, 'other-job-in-progress', 'EX', 600, 'NX');
      expect(acquired).toBe('OK');

      const job = makeBatchJob(userId, [{ platform: 'STEAM', platformAccountId: 'acc-1' }]);
      const result = await processSyncJob(job);

      expect(result).toEqual({
        achievementsSynced: 0,
        gamesUpdated: 0,
        syncedAt: expect.any(String),
      });
      expect(mockSteamAdapter.syncUser).not.toHaveBeenCalled();

      // El lock sigue siendo el del "1er job" — processSyncJob nunca lo adquirió, así que no
      // debe borrarlo ni sobreescribirlo.
      expect(await redis.get(lockKey)).toBe('other-job-in-progress');
    });
  });

  describe('TEST 3 — aislamiento por plataforma e2e: una falla, otra completa (hueco de TESTS-3)', () => {
    const userId = 'tests3-isolation-user';
    const lockKey = `sync:user-lock:${userId}`;
    const steamProgressKey = `sync:progress:${userId}:STEAM`;
    const raProgressKey = `sync:progress:${userId}:RA`;

    afterEach(async () => {
      await cleanupUserKeys(userId, ['STEAM', 'RA']);
    });

    it('completa el batch pese al fallo de una plataforma, con resultado parcial y claves limpias', async () => {
      mockPrisma.platformAccount.findUnique.mockImplementation(({ where }: never) => {
        const id = (where as { id: string }).id;
        if (id === 'acc-steam') {
          return Promise.resolve(makeAccount({ id: 'acc-steam', userId, platform: 'STEAM' }) as never);
        }
        return Promise.resolve(makeAccount({ id: 'acc-ra', userId, platform: 'RA' }) as never);
      });

      mockSteamAdapter.syncUser.mockRejectedValue(new Error('Steam API caída'));
      mockRaAdapter.syncUser.mockResolvedValue({
        platform: 'RA',
        achievementsSynced: 5,
        gamesUpdated: 2,
        syncedAt: new Date().toISOString(),
      });

      const job = makeBatchJob(userId, [
        { platform: 'STEAM', platformAccountId: 'acc-steam' },
        { platform: 'RA', platformAccountId: 'acc-ra' },
      ]);
      const result = await processSyncJob(job);

      // Solo el resultado de RA (la plataforma exitosa) se refleja en el agregado.
      expect(result).toMatchObject({ achievementsSynced: 5, gamesUpdated: 2 });

      expect(await redis.exists(lockKey)).toBe(0);
      expect(await redis.exists(steamProgressKey)).toBe(0);
      expect(await redis.exists(raProgressKey)).toBe(0);
    });
  });
});
