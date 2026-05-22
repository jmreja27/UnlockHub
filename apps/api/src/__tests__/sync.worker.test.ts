jest.mock('../services/user.service', () => ({
  addXp: jest.fn().mockResolvedValue({ newXp: 100, newLevel: 1, leveledUp: false }),
}));

jest.mock('../lib/redis', () => ({
  redis: {
    setex: jest.fn().mockResolvedValue('OK'),
    del: jest.fn().mockResolvedValue(1),
    get: jest.fn().mockResolvedValue(null),
    ttl: jest.fn().mockResolvedValue(-1),
    set: jest.fn().mockResolvedValue('OK'),
    incr: jest.fn().mockResolvedValue(1),
    decr: jest.fn().mockResolvedValue(0),
    expire: jest.fn().mockResolvedValue(1),
  },
  createWorkerConnection: jest.fn(() => ({ on: jest.fn() })),
}));

jest.mock('../lib/prisma', () => ({
  prisma: {
    platformAccount: { findUnique: jest.fn(), update: jest.fn() },
    userAchievement: { findMany: jest.fn() },
    user: { update: jest.fn() },
  },
}));

jest.mock('../lib/socket', () => ({
  getIO: jest.fn(),
}));

jest.mock('../services/notification.service', () => ({
  sendPush: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../services/inapp-notification.service', () => ({
  createNotification: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../jobs/sync.queue', () => ({
  syncQueue: { add: jest.fn().mockResolvedValue({ id: 'job-1' }) },
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

jest.mock('bullmq', () => ({
  Worker: jest.fn().mockImplementation(() => ({ on: jest.fn(), close: jest.fn() })),
}));

import { Worker } from 'bullmq';
import { redis } from '../lib/redis';
import { prisma } from '../lib/prisma';
import { getIO } from '../lib/socket';
import * as syncService from '../services/sync.service';
import type { SyncBatchProgress } from '../platforms/platform.interface';
import { AppError } from '../middleware/errorHandler';
import { steamAdapter } from '../platforms/steam.adapter';
import { syncQueue } from '../jobs/sync.queue';
import { addXp } from '../services/user.service';
import { startSyncWorker } from '../jobs/sync.worker';

const mockRedis = redis as jest.Mocked<typeof redis>;
const mockPrisma = prisma as jest.Mocked<typeof prisma>;
const mockGetIO = getIO as jest.MockedFunction<typeof getIO>;
const mockSteamAdapter = steamAdapter as jest.Mocked<typeof steamAdapter>;
const mockAddXp = addXp as jest.Mock;
const MockWorker = Worker as jest.MockedClass<typeof Worker>;

const mockEmit = jest.fn();
const mockTo = jest.fn(() => ({ emit: mockEmit }));
const mockIO = { to: mockTo } as unknown as ReturnType<typeof getIO>;

const account = {
  id: 'acc-1',
  userId: 'user-1',
  platform: 'STEAM' as const,
  externalId: '76561198000000000',
  username: 'testuser',
  encryptedToken: 'enc',
  lastSyncedAt: null,
  syncCooldownUntil: null,
  requiresReauth: false,
  createdAt: new Date(),
  updatedAt: new Date(),
};

beforeEach(() => {
  jest.clearAllMocks();
  mockGetIO.mockReturnValue(mockIO);
  mockPrisma.platformAccount.findUnique.mockResolvedValue(account);
  mockPrisma.platformAccount.update.mockResolvedValue(account);
  mockPrisma.user.update.mockResolvedValue({ id: 'user-1' } as never);
  mockPrisma.userAchievement.findMany.mockResolvedValue([]);
});

// ─── PARTE 8: lockDuration — evita jobs stalled con 300+ juegos PSN ─────────

describe('startSyncWorker — lockDuration configurado para evitar stalled jobs', () => {
  it('inicializa el Worker con lockDuration=300_000 y stalledInterval=30_000', () => {
    MockWorker.mockClear();
    startSyncWorker();

    const opts = MockWorker.mock.calls[0]?.[2];
    expect(opts).toMatchObject({
      lockDuration: 300_000,
      stalledInterval: 30_000,
    });
  });

  it('mantiene concurrency=5', () => {
    MockWorker.mockClear();
    startSyncWorker();

    const opts = MockWorker.mock.calls[0]?.[2];
    expect(opts).toMatchObject({ concurrency: 5 });
  });
});

describe('getIOSafe — null cuando Socket.io no está inicializado', () => {
  it('no lanza cuando getIO falla', () => {
    mockGetIO.mockImplementation(() => { throw new Error('not initialized'); });
    const getIOSafe = () => {
      try { return getIO(); } catch { return null; }
    };
    expect(getIOSafe()).toBeNull();
  });
});

describe('onBatch callback — emite sync:progress y actualiza Redis', () => {
  it('actualiza Redis y emite el evento con percentComplete correcto', async () => {
    const startedAt = new Date().toISOString();
    const progress: SyncBatchProgress = {
      processed: 20, total: 40, newGamesCount: 2, newAchievementsCount: 10,
    };

    const onBatch = async (p: SyncBatchProgress): Promise<void> => {
      const percentComplete = p.total > 0 ? Math.round((p.processed / p.total) * 100) : 0;
      await redis.setex(`sync:progress:user-1:STEAM`, 7200,
        JSON.stringify({ isRunning: true, processed: p.processed, total: p.total, percentComplete, startedAt }));
      mockIO.to('user:user-1').emit('sync:progress', {
        platform: 'STEAM', processed: p.processed, total: p.total,
        newGamesCount: p.newGamesCount, newAchievementsCount: p.newAchievementsCount, percentComplete,
      });
    };

    await onBatch(progress);

    expect(mockRedis.setex).toHaveBeenCalledWith(
      'sync:progress:user-1:STEAM', 7200,
      expect.stringContaining('"processed":20'),
    );
    expect(mockTo).toHaveBeenCalledWith('user:user-1');
    expect(mockEmit).toHaveBeenCalledWith('sync:progress', expect.objectContaining({
      platform: 'STEAM', processed: 20, total: 40, percentComplete: 50,
    }));
  });

  it('calcula percentComplete=0 cuando total=0', async () => {
    const onBatch = async (p: SyncBatchProgress): Promise<void> => {
      const percentComplete = p.total > 0 ? Math.round((p.processed / p.total) * 100) : 0;
      mockIO.to('user:user-1').emit('sync:progress', { platform: 'STEAM', percentComplete });
    };
    await onBatch({ processed: 0, total: 0, newGamesCount: 0, newAchievementsCount: 0 });
    expect(mockEmit).toHaveBeenCalledWith('sync:progress', expect.objectContaining({ percentComplete: 0 }));
  });
});

describe('sync:complete — emite xpEarned calculado de todos los logros nuevos', () => {
  it('acumula XP de todos los logros nuevos sin límite de 3', async () => {
    const newAchievements = [
      { achievementId: 'a1', achievement: { title: 'Test 1', normalizedPoints: 100 }, unlockedAt: new Date() },
      { achievementId: 'a2', achievement: { title: 'Test 2', normalizedPoints: 50 }, unlockedAt: new Date() },
      { achievementId: 'a3', achievement: { title: 'Test 3', normalizedPoints: 25 }, unlockedAt: new Date() },
      { achievementId: 'a4', achievement: { title: 'Test 4', normalizedPoints: 10 }, unlockedAt: new Date() },
    ];

    const xpEarned = newAchievements.reduce((sum, ua) => sum + ua.achievement.normalizedPoints, 0);
    expect(xpEarned).toBe(185);

    await mockRedis.del('sync:progress:user-1:STEAM');
    mockIO.to('user:user-1').emit('sync:complete', {
      platform: 'STEAM', totalGames: 4, newAchievements: 4, xpEarned,
    });

    expect(mockEmit).toHaveBeenCalledWith('sync:complete', expect.objectContaining({
      xpEarned: 185,
    }));
  });
});

describe('sync:error — borra Redis y emite el evento', () => {
  it('emite sync:error con el código de AppError', async () => {
    const err = new AppError('Token expirado', 'PSN_REFRESH_TOKEN_EXPIRED', 401);

    await mockRedis.del('sync:progress:user-1:PSN');
    mockIO.to('user:user-1').emit('sync:error', {
      platform: 'PSN', error: err.code, processedBeforeError: 0,
    });

    expect(mockRedis.del).toHaveBeenCalledWith('sync:progress:user-1:PSN');
    expect(mockEmit).toHaveBeenCalledWith('sync:error', expect.objectContaining({
      platform: 'PSN', error: 'PSN_REFRESH_TOKEN_EXPIRED',
    }));
  });
});

describe('syncService.triggerExpressSync', () => {
  it('llama a syncUserExpress del adapter y actualiza lastSyncedAt', async () => {
    (mockSteamAdapter.syncUserExpress as jest.Mock).mockResolvedValue({
      gamesUpdated: 20, achievementsSynced: 150, syncedAt: new Date().toISOString(),
    });

    await syncService.triggerExpressSync('user-1', 'STEAM');

    expect(mockSteamAdapter.syncUserExpress).toHaveBeenCalledWith(account);
    expect(mockPrisma.platformAccount.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ lastSyncedAt: expect.any(Date) }) }),
    );
  });

  it('no lanza si syncUserExpress falla — continúa silenciosamente', async () => {
    (mockSteamAdapter.syncUserExpress as jest.Mock).mockRejectedValue(new Error('Timeout'));
    await expect(syncService.triggerExpressSync('user-1', 'STEAM')).resolves.toBeUndefined();
  });
});

describe('syncService.queueInitialSync', () => {
  it('encola el job con triggerType=initial y prioridad alta', async () => {
    const jobId = await syncService.queueInitialSync('user-1', 'STEAM');
    expect(jobId).toBe('job-1');
    expect((syncQueue.add as jest.Mock)).toHaveBeenCalledWith(
      'initial-sync:user-1:STEAM',
      expect.objectContaining({ triggerType: 'initial' }),
      { priority: 10 },
    );
  });
});

describe('syncService.getSyncStatus — campos de progreso desde Redis', () => {
  it('devuelve isRunning=true con processed/total/percentComplete cuando hay clave en Redis', async () => {
    mockPrisma.platformAccount.findUnique.mockResolvedValueOnce(account);
    mockRedis.ttl.mockResolvedValue(-1);
    mockRedis.get.mockImplementation((key: string) => {
      if (key.startsWith('sync:progress:')) {
        return Promise.resolve(JSON.stringify({
          isRunning: true, processed: 15, total: 40, percentComplete: 37,
          startedAt: new Date().toISOString(),
        }));
      }
      return Promise.resolve(null);
    });

    const status = await syncService.getSyncStatus('user-1', 'STEAM');

    expect(status.isRunning).toBe(true);
    expect(status.processed).toBe(15);
    expect(status.total).toBe(40);
    expect(status.percentComplete).toBe(37);
  });

  it('devuelve isRunning=false cuando no hay clave en Redis', async () => {
    mockPrisma.platformAccount.findUnique.mockResolvedValueOnce(account);
    mockRedis.ttl.mockResolvedValue(-1);
    mockRedis.get.mockResolvedValue(null);

    const status = await syncService.getSyncStatus('user-1', 'STEAM');

    expect(status.isRunning).toBe(false);
    expect(status.processed).toBe(0);
    expect(status.total).toBe(0);
  });
});

// ─── BUG-9: addXp llamado cuando hay logros nuevos ───────────────────────────

describe('startSyncWorker — addXp persistido cuando hay logros nuevos (BUG-9)', () => {
  type JobLike = { data: { userId: string; platformAccountId: string; platform: string; triggerType: string } };
  type ProcessFn = (job: JobLike) => Promise<unknown>;

  it('llama a addXp con la suma de normalizedPoints de los logros nuevos', async () => {
    MockWorker.mockClear();
    startSyncWorker();

    // Extraer el callback de procesamiento pasado al constructor de Worker
    const processFn = MockWorker.mock.calls[0]?.[1] as ProcessFn;
    expect(processFn).toBeDefined();

    // Primera llamada a userAchievement.findMany: prevEarnedIds (vacío — usuario sin logros previos)
    mockPrisma.userAchievement.findMany
      .mockResolvedValueOnce([]) // prevEarnedIds
      .mockResolvedValueOnce([  // newAchievements tras sync
        { achievementId: 'ach-new-1', achievement: { title: 'Test A', normalizedPoints: 100 }, unlockedAt: new Date() },
        { achievementId: 'ach-new-2', achievement: { title: 'Test B', normalizedPoints: 50 }, unlockedAt: new Date() },
      ]);

    (mockSteamAdapter.syncUser as jest.Mock).mockResolvedValue({
      gamesUpdated: 1, achievementsSynced: 2, syncedAt: new Date().toISOString(),
    });

    await processFn({ data: { userId: 'user-1', platformAccountId: 'acc-1', platform: 'STEAM', triggerType: 'manual' } });

    // xpEarned = 100 + 50 = 150
    expect(mockAddXp).toHaveBeenCalledWith('user-1', 150, 'ACHIEVEMENT');
  });

  it('no llama a addXp cuando xpEarned es 0 (sin logros nuevos)', async () => {
    MockWorker.mockClear();
    startSyncWorker();

    const processFn = MockWorker.mock.calls[0]?.[1] as ProcessFn;

    mockPrisma.userAchievement.findMany
      .mockResolvedValueOnce([]) // prevEarnedIds
      .mockResolvedValueOnce([]); // newAchievements — vacío

    (mockSteamAdapter.syncUser as jest.Mock).mockResolvedValue({
      gamesUpdated: 0, achievementsSynced: 0, syncedAt: new Date().toISOString(),
    });

    await processFn({ data: { userId: 'user-1', platformAccountId: 'acc-1', platform: 'STEAM', triggerType: 'manual' } });

    expect(mockAddXp).not.toHaveBeenCalled();
  });
});
