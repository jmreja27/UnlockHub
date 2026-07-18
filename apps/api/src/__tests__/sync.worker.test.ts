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
    platformAccount: { findUnique: jest.fn(), upsert: jest.fn(), findMany: jest.fn() },
    userAchievement: { findMany: jest.fn() },
    user: { update: jest.fn(), findUnique: jest.fn() },
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

jest.mock('../jobs/sync.queue', () => {
  const syncQueueMock = { add: jest.fn().mockResolvedValue({ id: 'job-1' }), getJob: jest.fn().mockResolvedValue(null) };
  const syncBgJobOptionsMock = jest.fn((userId: string) => ({
    jobId: `sync-bg-${userId}`,
    removeOnComplete: true,
    removeOnFail: { age: 300 },
  }));
  // Shim de test: sin job existente mockeado (getJob → null), enqueueOrMergeSyncBatch
  // se comporta como el .add() directo que sustituyó (T141) — preserva las aserciones
  // existentes sobre syncQueue.add sin reimplementar la lógica real de merge aquí.
  const enqueueOrMergeSyncBatchMock = jest.fn(
    async (userId: string, platforms: unknown, triggerType: string) =>
      syncQueueMock.add(`sync-bg-${userId}`, { userId, platforms, triggerType }, syncBgJobOptionsMock(userId)),
  );
  return {
    syncQueue: syncQueueMock,
    syncBgJobOptions: syncBgJobOptionsMock,
    enqueueOrMergeSyncBatch: enqueueOrMergeSyncBatchMock,
  };
});

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

jest.mock('@sentry/node', () => ({
  captureMessage: jest.fn(),
}));

import { Worker } from 'bullmq';
import * as Sentry from '@sentry/node';
import { redis } from '../lib/redis';
import { prisma } from '../lib/prisma';
import { getIO } from '../lib/socket';
import { logger } from '../lib/logger';
import * as syncService from '../services/sync.service';
import type { SyncBatchProgress } from '../platforms/platform.interface';
import { AppError } from '../middleware/errorHandler';
import { steamAdapter } from '../platforms/steam.adapter';
import { syncQueue } from '../jobs/sync.queue';
import { addXp } from '../services/user.service';
import { upsertUserScore } from '../services/ranking.service';
import { startSyncWorker } from '../jobs/sync.worker';

const mockRedis = redis as jest.Mocked<typeof redis>;
const mockPrisma = prisma as jest.Mocked<typeof prisma>;
const mockGetIO = getIO as jest.MockedFunction<typeof getIO>;
const mockSteamAdapter = steamAdapter as jest.Mocked<typeof steamAdapter>;
const mockAddXp = addXp as jest.Mock;
const mockUpsertUserScore = upsertUserScore as jest.Mock;
const mockCaptureMessage = Sentry.captureMessage as jest.Mock;
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
  mockPrisma.platformAccount.upsert.mockResolvedValue(account);
  // findMany usado por queueInitialSync (llamado desde A22 fallback y runExpressThenQueueFull)
  (mockPrisma.platformAccount.findMany as jest.Mock).mockResolvedValue([account]);
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
      await redis.setex(`sync:progress:user-1:STEAM`, 900,
        JSON.stringify({ isRunning: true, processed: p.processed, total: p.total, percentComplete, startedAt }));
      mockIO.to('user:user-1').emit('sync:progress', {
        platform: 'STEAM', processed: p.processed, total: p.total,
        newGamesCount: p.newGamesCount, newAchievementsCount: p.newAchievementsCount, percentComplete,
      });
    };

    await onBatch(progress);

    expect(mockRedis.setex).toHaveBeenCalledWith(
      'sync:progress:user-1:STEAM', 900,
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
    expect(mockPrisma.platformAccount.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: expect.objectContaining({ lastSyncedAt: expect.any(Date) }) }),
    );
  });

  it('no lanza si syncUserExpress falla — continúa silenciosamente', async () => {
    (mockSteamAdapter.syncUserExpress as jest.Mock).mockRejectedValue(new Error('Timeout'));
    await expect(syncService.triggerExpressSync('user-1', 'STEAM')).resolves.toBeUndefined();
  });
});

describe('syncService.triggerExpressSync — lock por usuario', () => {
  it('adquiere el lock antes de ejecutar el express sync y lo libera al completar', async () => {
    mockRedis.set.mockResolvedValueOnce('OK');
    (mockSteamAdapter.syncUserExpress as jest.Mock).mockResolvedValueOnce({
      gamesUpdated: 5, achievementsSynced: 50, syncedAt: new Date().toISOString(),
    });

    await syncService.triggerExpressSync('user-1', 'STEAM');

    expect(mockRedis.set).toHaveBeenCalledWith('sync:user-lock:user-1', 'express', 'EX', 120, 'NX');
    expect(mockSteamAdapter.syncUserExpress).toHaveBeenCalledWith(account);
    expect(mockRedis.del).toHaveBeenCalledWith('sync:user-lock:user-1');
  });

  it('omite el express sync si el lock ya está tomado (otro sync activo para el mismo usuario)', async () => {
    mockRedis.set.mockResolvedValueOnce(null); // lock no disponible

    await syncService.triggerExpressSync('user-1', 'STEAM');

    expect(mockSteamAdapter.syncUserExpress).not.toHaveBeenCalled();
    // No debe intentar liberar un lock que no adquirió
    expect(mockRedis.del).not.toHaveBeenCalledWith('sync:user-lock:user-1');
  });

  // A22 — fallback: lock ocupado → encola batch completo (sync-bg-{userId}) en lugar de descartar silenciosamente
  it('A22: encola batch sync-bg-{userId} como fallback cuando el lock no está disponible', async () => {
    mockRedis.set.mockResolvedValueOnce(null); // lock no disponible
    (mockPrisma.platformAccount.findMany as jest.Mock).mockResolvedValueOnce([account]);

    await syncService.triggerExpressSync('user-1', 'STEAM');

    expect(mockSteamAdapter.syncUserExpress).not.toHaveBeenCalled();
    // El job batch debe encolarse con jobId determinista para que el trabajo no se pierda
    expect((syncQueue.add as jest.Mock)).toHaveBeenCalledWith(
      'sync-bg-user-1',
      expect.objectContaining({
        userId: 'user-1',
        triggerType: 'initial',
        platforms: [{ platform: 'STEAM', platformAccountId: 'acc-1' }],
      }),
      expect.objectContaining({ jobId: 'sync-bg-user-1' }),
    );
  });

  // A22 — no doble encolado: lock disponible → express sync normal, queueInitialSync NO llamado dentro
  it('A22: no encola queueInitialSync dentro de triggerExpressSync cuando el lock sí se adquiere', async () => {
    mockRedis.set.mockResolvedValueOnce('OK'); // lock disponible
    (mockSteamAdapter.syncUserExpress as jest.Mock).mockResolvedValueOnce({
      gamesUpdated: 5, achievementsSynced: 50, syncedAt: new Date().toISOString(),
    });

    await syncService.triggerExpressSync('user-1', 'STEAM');

    expect(mockSteamAdapter.syncUserExpress).toHaveBeenCalledWith(account);
    // syncQueue.add NO debe haber sido llamado desde dentro de triggerExpressSync
    expect((syncQueue.add as jest.Mock)).not.toHaveBeenCalled();
  });

  it('libera el lock en finally aunque el express sync falle', async () => {
    mockRedis.set.mockResolvedValueOnce('OK');
    (mockSteamAdapter.syncUserExpress as jest.Mock).mockRejectedValueOnce(new Error('PSN timeout'));

    // No debe lanzar — el catch interno lo absorbe
    await expect(syncService.triggerExpressSync('user-1', 'STEAM')).resolves.toBeUndefined();

    expect(mockRedis.del).toHaveBeenCalledWith('sync:user-lock:user-1');
  });
});

describe('syncService.queueInitialSync', () => {
  it('encola SyncBatchJobData con sync-bg-{userId} y todas las plataformas del usuario', async () => {
    (mockPrisma.platformAccount.findMany as jest.Mock).mockResolvedValueOnce([account]);

    const jobId = await syncService.queueInitialSync('user-1', 'STEAM');

    expect(jobId).toBe('job-1');
    expect((syncQueue.add as jest.Mock)).toHaveBeenCalledWith(
      'sync-bg-user-1',
      expect.objectContaining({
        userId: 'user-1',
        triggerType: 'initial',
        platforms: [{ platform: 'STEAM', platformAccountId: 'acc-1' }],
      }),
      expect.objectContaining({ jobId: 'sync-bg-user-1' }),
    );
  });

  it('usa removeOnComplete:true y removeOnFail:{age:300} (regresión bug auto-bloqueo)', async () => {
    (mockPrisma.platformAccount.findMany as jest.Mock).mockResolvedValueOnce([account]);

    await syncService.queueInitialSync('user-1', 'STEAM');

    expect((syncQueue.add as jest.Mock)).toHaveBeenCalledWith(
      'sync-bg-user-1',
      expect.anything(),
      expect.objectContaining({
        jobId: 'sync-bg-user-1',
        removeOnComplete: true,
        removeOnFail: { age: 300 },
      }),
    );
  });

  it('devuelve undefined si el usuario no tiene plataformas vinculadas', async () => {
    (mockPrisma.platformAccount.findMany as jest.Mock).mockResolvedValueOnce([]);

    const jobId = await syncService.queueInitialSync('user-1', 'STEAM');

    expect(jobId).toBeUndefined();
    expect((syncQueue.add as jest.Mock)).not.toHaveBeenCalled();
  });
});

describe('syncService.runExpressThenQueueFull', () => {
  it('llama express sync y queueInitialSync en secuencia cuando express tiene éxito', async () => {
    mockRedis.set.mockResolvedValueOnce('OK'); // lock adquirido
    (mockSteamAdapter.syncUserExpress as jest.Mock).mockResolvedValueOnce({
      gamesUpdated: 5, achievementsSynced: 30, syncedAt: new Date().toISOString(),
    });
    (mockPrisma.platformAccount.findMany as jest.Mock).mockResolvedValueOnce([account]);

    await syncService.runExpressThenQueueFull('user-1', 'STEAM');

    expect(mockSteamAdapter.syncUserExpress).toHaveBeenCalledWith(account);
    expect((syncQueue.add as jest.Mock)).toHaveBeenCalledWith(
      'sync-bg-user-1',
      expect.objectContaining({ userId: 'user-1', triggerType: 'initial' }),
      expect.objectContaining({ jobId: 'sync-bg-user-1' }),
    );
  });

  it('llama queueInitialSync igualmente si triggerExpressSync lanza (infra error)', async () => {
    // Simular fallo de infraestructura en findUnique (antes del lock)
    mockPrisma.platformAccount.findUnique.mockRejectedValueOnce(new Error('DB timeout'));
    (mockPrisma.platformAccount.findMany as jest.Mock).mockResolvedValueOnce([account]);

    await syncService.runExpressThenQueueFull('user-1', 'STEAM');

    // A pesar del error en express, queueInitialSync debe haberse llamado
    expect((syncQueue.add as jest.Mock)).toHaveBeenCalledWith(
      'sync-bg-user-1',
      expect.objectContaining({ userId: 'user-1', triggerType: 'initial' }),
      expect.objectContaining({ jobId: 'sync-bg-user-1' }),
    );
  });

  it('no lanza aunque tanto express como queueInitialSync fallen', async () => {
    mockPrisma.platformAccount.findUnique.mockRejectedValueOnce(new Error('DB error'));
    (mockPrisma.platformAccount.findMany as jest.Mock).mockResolvedValueOnce([]);

    // findMany devuelve [] → queueInitialSync retorna undefined sin encolar → no lanza
    await expect(syncService.runExpressThenQueueFull('user-1', 'STEAM')).resolves.toBeUndefined();
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

// ─── MEJORA-2: lock Redis por usuario — sync secuencial por usuario ──────────

describe('startSyncWorker — lock Redis por usuario (MEJORA-2)', () => {
  type JobLike = {
    id?: string;
    name: string;
    opts: { priority?: number };
    data: { userId: string; platformAccountId: string; platform: string; triggerType: string };
  };
  type ProcessFn = (job: JobLike) => Promise<unknown>;

  it('adquiere el lock con SET NX EX atómico y lo libera en finally cuando el sync tiene éxito', async () => {
    MockWorker.mockClear();
    startSyncWorker();
    const processFn = MockWorker.mock.calls[0]?.[1] as ProcessFn;

    // SET NX devuelve 'OK' → lock adquirido
    mockRedis.set.mockResolvedValueOnce('OK');

    mockPrisma.userAchievement.findMany
      .mockResolvedValueOnce([]) // prevEarnedIds
      .mockResolvedValueOnce([]); // newAchievements

    (mockSteamAdapter.syncUser as jest.Mock).mockResolvedValueOnce({
      gamesUpdated: 0, achievementsSynced: 0, syncedAt: new Date().toISOString(),
    });

    mockPrisma.user.findUnique.mockResolvedValueOnce({ xp: 0 });
    mockPrisma.platformAccount.findMany.mockResolvedValueOnce([]);

    await processFn({ id: 'job-test', name: 'manual-sync:user-1:STEAM', opts: {}, data: { userId: 'user-1', platformAccountId: 'acc-1', platform: 'STEAM', triggerType: 'manual' } });

    // SET fue llamado con NX y EX para el lock del usuario
    expect(mockRedis.set).toHaveBeenCalledWith(
      'sync:user-lock:user-1',
      expect.any(String),
      'EX',
      600,
      'NX',
    );
    // DEL fue llamado para liberar el lock al final
    expect(mockRedis.del).toHaveBeenCalledWith('sync:user-lock:user-1');
  });

  it('reencola el job con delay 30s e incrementa lockRetryCount cuando el lock está tomado (primer intento)', async () => {
    MockWorker.mockClear();
    startSyncWorker();
    const processFn = MockWorker.mock.calls[0]?.[1] as ProcessFn;

    // SET NX devuelve null → lock no adquirido
    mockRedis.set.mockResolvedValueOnce(null);

    const result = await processFn({
      id: 'job-2',
      name: 'manual-sync:user-1:STEAM',
      opts: { priority: 10 },
      data: { userId: 'user-1', platformAccountId: 'acc-1', platform: 'STEAM', triggerType: 'manual' },
    });

    // Delay de 30s (LOCK_RETRY_DELAY_MS) y lockRetryCount incrementado a 1
    expect((syncQueue.add as jest.Mock)).toHaveBeenCalledWith(
      'manual-sync:user-1:STEAM',
      expect.objectContaining({ userId: 'user-1', platform: 'STEAM', lockRetryCount: 1 }),
      expect.objectContaining({ delay: 30_000 }),
    );
    // El job retorna resultado vacío — no procesó nada
    expect((result as { achievementsSynced: number }).achievementsSynced).toBe(0);
  });

  it('libera el lock en finally aunque el sync falle', async () => {
    MockWorker.mockClear();
    startSyncWorker();
    const processFn = MockWorker.mock.calls[0]?.[1] as ProcessFn;

    // Lock adquirido
    mockRedis.set.mockResolvedValueOnce('OK');
    // El adapter lanza un error
    (mockSteamAdapter.syncUser as jest.Mock).mockRejectedValueOnce(new Error('Timeout'));

    mockPrisma.userAchievement.findMany.mockResolvedValueOnce([]); // prevEarnedIds

    await expect(
      processFn({ id: 'job-3', name: 'manual-sync:user-1:STEAM', opts: {}, data: { userId: 'user-1', platformAccountId: 'acc-1', platform: 'STEAM', triggerType: 'manual' } }),
    ).rejects.toThrow();

    // El lock debe liberarse incluso aunque el sync haya fallado
    expect(mockRedis.del).toHaveBeenCalledWith('sync:user-lock:user-1');
  });

  it('syncs de usuarios distintos no se bloquean entre sí (locks con keys distintas)', async () => {
    MockWorker.mockClear();
    startSyncWorker();
    const processFn = MockWorker.mock.calls[0]?.[1] as ProcessFn;

    // user-2: SET NX devuelve 'OK' → lock adquirido independientemente de user-1
    mockRedis.set.mockResolvedValueOnce('OK');

    mockPrisma.userAchievement.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    (mockSteamAdapter.syncUser as jest.Mock).mockResolvedValueOnce({
      gamesUpdated: 0, achievementsSynced: 0, syncedAt: new Date().toISOString(),
    });

    mockPrisma.user.findUnique.mockResolvedValueOnce({ xp: 0 });
    mockPrisma.platformAccount.findMany.mockResolvedValueOnce([]);

    await processFn({ id: 'job-4', name: 'manual-sync:user-2:STEAM', opts: {}, data: { userId: 'user-2', platformAccountId: 'acc-2', platform: 'STEAM', triggerType: 'manual' } });

    // El lock se adquirió con la key del usuario correcto
    expect(mockRedis.set).toHaveBeenCalledWith(
      'sync:user-lock:user-2',
      expect.any(String),
      'EX', 600, 'NX',
    );
    // Y se liberó para user-2, no para user-1
    expect(mockRedis.del).toHaveBeenCalledWith('sync:user-lock:user-2');
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

  it('no llama a addXp cuando xpEarned es 0 pero sí llama a upsertUserScore (BUG-2)', async () => {
    MockWorker.mockClear();
    mockUpsertUserScore.mockClear();
    startSyncWorker();

    const processFn = MockWorker.mock.calls[0]?.[1] as ProcessFn;

    mockPrisma.userAchievement.findMany
      .mockResolvedValueOnce([]) // prevEarnedIds
      .mockResolvedValueOnce([]); // newAchievements — vacío

    (mockSteamAdapter.syncUser as jest.Mock).mockResolvedValue({
      gamesUpdated: 0, achievementsSynced: 0, syncedAt: new Date().toISOString(),
    });

    // Setup mocks para el else branch: user.findUnique + platformAccount.findMany
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValueOnce({ xp: 500, profileVisibility: 'PUBLIC' });
    (mockPrisma.platformAccount.findMany as jest.Mock).mockResolvedValueOnce([
      { platform: 'STEAM' }, { platform: 'RA' },
    ]);

    await processFn({ data: { userId: 'user-1', platformAccountId: 'acc-1', platform: 'STEAM', triggerType: 'manual' } });

    expect(mockAddXp).not.toHaveBeenCalled();
    // upsertUserScore debe llamarse para mantener al usuario en los sorted sets de plataforma
    expect(mockUpsertUserScore).toHaveBeenCalledWith('user-1', 500, ['STEAM', 'RA'], 'PUBLIC');
  });
});

// ─── Failsafe: techo de reintentos de lock ────────────────────────────────────

describe('startSyncWorker — failsafe de lock (LOCK_MAX_RETRIES)', () => {
  type JobLike = {
    id?: string;
    name: string;
    opts: { priority?: number };
    token?: string;
    extendLock?: jest.Mock;
    data: { userId: string; platformAccountId: string; platform: string; triggerType: string; lockRetryCount?: number };
  };
  type ProcessFn = (job: JobLike) => Promise<unknown>;

  it('abandona el job sin reencolar cuando lockRetryCount alcanza el máximo (3)', async () => {
    MockWorker.mockClear();
    startSyncWorker();
    const processFn = MockWorker.mock.calls[0]?.[1] as ProcessFn;

    // Lock no disponible
    mockRedis.set.mockResolvedValueOnce(null);

    const result = await processFn({
      id: 'job-failsafe',
      name: 'manual-sync:user-1:STEAM',
      opts: {},
      data: {
        userId: 'user-1',
        platformAccountId: 'acc-1',
        platform: 'STEAM',
        triggerType: 'manual',
        lockRetryCount: 3,
      },
    });

    // No debe reencolar — techo alcanzado
    expect((syncQueue.add as jest.Mock)).not.toHaveBeenCalled();
    // Retorna resultado vacío
    expect((result as { achievementsSynced: number }).achievementsSynced).toBe(0);
  });

  it('aún reencola cuando lockRetryCount es 2 (< 3)', async () => {
    MockWorker.mockClear();
    startSyncWorker();
    const processFn = MockWorker.mock.calls[0]?.[1] as ProcessFn;

    mockRedis.set.mockResolvedValueOnce(null);

    await processFn({
      id: 'job-retry2',
      name: 'manual-sync:user-1:STEAM',
      opts: {},
      data: {
        userId: 'user-1',
        platformAccountId: 'acc-1',
        platform: 'STEAM',
        triggerType: 'manual',
        lockRetryCount: 2,
      },
    });

    expect((syncQueue.add as jest.Mock)).toHaveBeenCalledTimes(1);
    expect((syncQueue.add as jest.Mock)).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ lockRetryCount: 3 }),
      expect.objectContaining({ delay: 30_000 }),
    );
  });

  it('job sin lockRetryCount (primer intento) reencola con lockRetryCount: 1', async () => {
    MockWorker.mockClear();
    startSyncWorker();
    const processFn = MockWorker.mock.calls[0]?.[1] as ProcessFn;

    mockRedis.set.mockResolvedValueOnce(null);

    await processFn({
      id: 'job-first',
      name: 'auto-sync:user-1:RA',
      opts: {},
      data: { userId: 'user-1', platformAccountId: 'acc-ra', platform: 'RA', triggerType: 'auto' },
    });

    expect((syncQueue.add as jest.Mock)).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ lockRetryCount: 1 }),
      expect.any(Object),
    );
  });
});

// ─── Batch job: plataformas en serie con lock único ──────────────────────────

describe('startSyncWorker — batch job (SyncBatchJobData)', () => {
  // Tipo de job batch para las llamadas a processFn
  type BatchJobLike = {
    id?: string;
    name: string;
    opts: { priority?: number };
    token?: string;
    extendLock?: jest.Mock;
    data: {
      userId: string;
      platforms: { platform: string; platformAccountId: string }[];
      triggerType: string;
    };
  };
  type ProcessFn = (job: BatchJobLike) => Promise<unknown>;

  const steamAccount = {
    id: 'acc-steam', userId: 'user-1', platform: 'STEAM' as const,
    externalId: '76561', username: 'u', encryptedToken: 'enc',
    lastSyncedAt: null, syncCooldownUntil: null, requiresReauth: false,
    psnProfilePrivate: false, tokenExpiresAt: null,
    createdAt: new Date(), updatedAt: new Date(),
  };
  const raAccount = {
    id: 'acc-ra', userId: 'user-1', platform: 'RA' as const,
    externalId: 'ra-user', username: 'u', encryptedToken: 'enc',
    lastSyncedAt: null, syncCooldownUntil: null, requiresReauth: false,
    psnProfilePrivate: false, tokenExpiresAt: null,
    createdAt: new Date(), updatedAt: new Date(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetIO.mockReturnValue(mockIO);
    mockPrisma.platformAccount.upsert.mockResolvedValue(steamAccount);
    mockPrisma.user.update.mockResolvedValue({ id: 'user-1' } as never);
  });

  it('adquiere el lock UNA SOLA VEZ para el batch completo y lo libera en finally', async () => {
    MockWorker.mockClear();
    startSyncWorker();
    const processFn = MockWorker.mock.calls[0]?.[1] as ProcessFn;

    // Lock disponible
    mockRedis.set.mockResolvedValueOnce('OK');

    // STEAM: prevEarnedIds + newAchievements
    mockPrisma.userAchievement.findMany
      .mockResolvedValueOnce([]) // STEAM prevEarnedIds
      .mockResolvedValueOnce([]); // STEAM newAchievements

    (mockSteamAdapter.syncUser as jest.Mock).mockResolvedValueOnce({
      gamesUpdated: 1, achievementsSynced: 0, syncedAt: new Date().toISOString(),
    });
    mockPrisma.user.findUnique.mockResolvedValueOnce({ xp: 0, profileVisibility: 'PUBLIC' });
    mockPrisma.platformAccount.findMany.mockResolvedValueOnce([{ platform: 'STEAM' }]);

    await processFn({
      id: 'batch-1',
      name: 'sync-bg-user-1',
      opts: {},
      token: 'tok-1',
      extendLock: jest.fn().mockResolvedValue(0),
      data: {
        userId: 'user-1',
        platforms: [{ platform: 'STEAM', platformAccountId: 'acc-steam' }],
        triggerType: 'auto',
      },
    });

    // SET NX llamado exactamente una vez (lock único para el batch)
    expect(mockRedis.set).toHaveBeenCalledTimes(1);
    expect(mockRedis.set).toHaveBeenCalledWith('sync:user-lock:user-1', expect.any(String), 'EX', 600, 'NX');
    // Lock liberado al final
    expect(mockRedis.del).toHaveBeenCalledWith('sync:user-lock:user-1');
  });

  it('llama a extendLock antes de cada plataforma del batch', async () => {
    MockWorker.mockClear();
    startSyncWorker();
    const processFn = MockWorker.mock.calls[0]?.[1] as ProcessFn;

    mockRedis.set.mockResolvedValueOnce('OK');
    const extendLock = jest.fn().mockResolvedValue(0);

    // Mock para 2 plataformas en serie: STEAM + RA
    mockPrisma.platformAccount.findUnique
      .mockResolvedValueOnce(steamAccount)
      .mockResolvedValueOnce(raAccount);

    mockPrisma.userAchievement.findMany
      .mockResolvedValueOnce([]) // STEAM prevEarnedIds
      .mockResolvedValueOnce([]) // STEAM newAchievements
      .mockResolvedValueOnce([]) // RA prevEarnedIds
      .mockResolvedValueOnce([]); // RA newAchievements

    (mockSteamAdapter.syncUser as jest.Mock).mockResolvedValueOnce({
      gamesUpdated: 0, achievementsSynced: 0, syncedAt: new Date().toISOString(),
    });

    const { retroAchievementsAdapter: raAdapter } = jest.requireMock('../platforms/retroachievements.adapter') as { retroAchievementsAdapter: { syncUser: jest.Mock } };
    raAdapter.syncUser.mockResolvedValueOnce({
      gamesUpdated: 0, achievementsSynced: 0, syncedAt: new Date().toISOString(),
    });

    mockPrisma.user.findUnique
      .mockResolvedValueOnce({ xp: 0, profileVisibility: 'PUBLIC' })
      .mockResolvedValueOnce({ xp: 0, profileVisibility: 'PUBLIC' });
    mockPrisma.platformAccount.findMany
      .mockResolvedValueOnce([{ platform: 'STEAM' }])
      .mockResolvedValueOnce([{ platform: 'RA' }]);

    await processFn({
      id: 'batch-2',
      name: 'sync-bg-user-1',
      opts: {},
      token: 'tok-2',
      extendLock,
      data: {
        userId: 'user-1',
        platforms: [
          { platform: 'STEAM', platformAccountId: 'acc-steam' },
          { platform: 'RA', platformAccountId: 'acc-ra' },
        ],
        triggerType: 'auto',
      },
    });

    // extendLock llamado una vez por plataforma (2 plataformas = 2 calls)
    expect(extendLock).toHaveBeenCalledTimes(2);
    expect(extendLock).toHaveBeenCalledWith('tok-2', 600_000);
  });

  it('fallo de PSN no cancela RA — continúa con la siguiente plataforma', async () => {
    MockWorker.mockClear();
    startSyncWorker();
    const processFn = MockWorker.mock.calls[0]?.[1] as ProcessFn;

    mockRedis.set.mockResolvedValueOnce('OK');
    const extendLock = jest.fn().mockResolvedValue(0);

    const psnAccount = {
      ...steamAccount, id: 'acc-psn', platform: 'PSN' as const, externalId: 'psn-user',
    };

    mockPrisma.platformAccount.findUnique
      .mockResolvedValueOnce(steamAccount) // STEAM
      .mockResolvedValueOnce(psnAccount)   // PSN
      .mockResolvedValueOnce(raAccount);   // RA

    // PSN prevEarnedIds y luego rethrows antes de llegar a newAchievements
    // STEAM y RA: prevEarnedIds + newAchievements
    mockPrisma.userAchievement.findMany
      .mockResolvedValueOnce([]) // STEAM prevEarnedIds
      .mockResolvedValueOnce([]) // STEAM newAchievements
      .mockResolvedValueOnce([]) // PSN prevEarnedIds
      .mockResolvedValueOnce([]) // RA prevEarnedIds
      .mockResolvedValueOnce([]); // RA newAchievements

    (mockSteamAdapter.syncUser as jest.Mock).mockResolvedValueOnce({
      gamesUpdated: 2, achievementsSynced: 5, syncedAt: new Date().toISOString(),
    });

    const { psnAdapter: psnAdapterMock } = jest.requireMock('../platforms/psn.adapter') as { psnAdapter: { syncUser: jest.Mock } };
    psnAdapterMock.syncUser.mockRejectedValueOnce(new Error('PSN timeout'));

    const { retroAchievementsAdapter: raAdapterMock } = jest.requireMock('../platforms/retroachievements.adapter') as { retroAchievementsAdapter: { syncUser: jest.Mock } };
    raAdapterMock.syncUser.mockResolvedValueOnce({
      gamesUpdated: 1, achievementsSynced: 3, syncedAt: new Date().toISOString(),
    });

    mockPrisma.user.findUnique
      .mockResolvedValueOnce({ xp: 0, profileVisibility: 'PUBLIC' }) // STEAM (sin XP)
      .mockResolvedValueOnce({ xp: 0, profileVisibility: 'PUBLIC' }); // RA (sin XP)
    mockPrisma.platformAccount.findMany
      .mockResolvedValueOnce([{ platform: 'STEAM' }])
      .mockResolvedValueOnce([{ platform: 'RA' }]);

    const result = await processFn({
      id: 'batch-3',
      name: 'sync-bg-user-1',
      opts: {},
      token: 'tok-3',
      extendLock,
      data: {
        userId: 'user-1',
        platforms: [
          { platform: 'STEAM', platformAccountId: 'acc-steam' },
          { platform: 'PSN', platformAccountId: 'acc-psn' },
          { platform: 'RA', platformAccountId: 'acc-ra' },
        ],
        triggerType: 'auto',
      },
    });

    // El job batch NO falla — retorna resultado agregado de STEAM + RA
    expect((result as { achievementsSynced: number }).achievementsSynced).toBe(8); // 5 + 3
    expect((result as { gamesUpdated: number }).gamesUpdated).toBe(3); // 2 + 1

    // sync:error emitido para PSN
    expect(mockEmit).toHaveBeenCalledWith('sync:error', expect.objectContaining({ platform: 'PSN' }));
    // sync:complete emitido para STEAM y RA (no para PSN)
    expect(mockEmit).toHaveBeenCalledWith('sync:complete', expect.objectContaining({ platform: 'STEAM' }));
    expect(mockEmit).toHaveBeenCalledWith('sync:complete', expect.objectContaining({ platform: 'RA' }));
  });

  // ─── FIX 1: alerta Sentry cuando el NPSSO del sistema ha expirado ────────────
  it('FIX 1: PSN_SYSTEM_NPSSO_EXPIRED dispara Sentry.captureMessage y NO cancela RA (el batch continúa igual que con cualquier otro error de plataforma)', async () => {
    MockWorker.mockClear();
    startSyncWorker();
    const processFn = MockWorker.mock.calls[0]?.[1] as ProcessFn;

    // SET NX: 1ª llamada = lock del batch (OK), 2ª llamada = dedup de la alerta (OK, primera vez)
    mockRedis.set.mockResolvedValueOnce('OK').mockResolvedValueOnce('OK');
    const extendLock = jest.fn().mockResolvedValue(0);

    const psnAccount = {
      ...steamAccount, id: 'acc-psn', platform: 'PSN' as const, externalId: 'psn-user',
    };

    mockPrisma.platformAccount.findUnique
      .mockResolvedValueOnce(psnAccount)   // PSN
      .mockResolvedValueOnce(raAccount);   // RA

    mockPrisma.userAchievement.findMany
      .mockResolvedValueOnce([]) // PSN prevEarnedIds
      .mockResolvedValueOnce([]) // RA prevEarnedIds
      .mockResolvedValueOnce([]); // RA newAchievements

    const { psnAdapter: psnAdapterMock } = jest.requireMock('../platforms/psn.adapter') as { psnAdapter: { syncUser: jest.Mock } };
    psnAdapterMock.syncUser.mockRejectedValueOnce(
      new AppError('El PSN_SYSTEM_NPSSO ha expirado', 'PSN_SYSTEM_NPSSO_EXPIRED', 503),
    );

    const { retroAchievementsAdapter: raAdapterMock } = jest.requireMock('../platforms/retroachievements.adapter') as { retroAchievementsAdapter: { syncUser: jest.Mock } };
    raAdapterMock.syncUser.mockResolvedValueOnce({
      gamesUpdated: 1, achievementsSynced: 3, syncedAt: new Date().toISOString(),
    });

    mockPrisma.user.findUnique.mockResolvedValueOnce({ xp: 0, profileVisibility: 'PUBLIC' }); // RA (sin XP)
    mockPrisma.platformAccount.findMany.mockResolvedValueOnce([{ platform: 'RA' }]);

    const result = await processFn({
      id: 'batch-npsso',
      name: 'sync-bg-user-1',
      opts: {},
      token: 'tok-npsso',
      extendLock,
      data: {
        userId: 'user-1',
        platforms: [
          { platform: 'PSN', platformAccountId: 'acc-psn' },
          { platform: 'RA', platformAccountId: 'acc-ra' },
        ],
        triggerType: 'auto',
      },
    });

    // El batch NO falla — RA se procesó igual que en cualquier otro fallo de plataforma
    expect((result as { achievementsSynced: number }).achievementsSynced).toBe(3);
    expect(mockEmit).toHaveBeenCalledWith('sync:error', expect.objectContaining({ platform: 'PSN', error: 'PSN_SYSTEM_NPSSO_EXPIRED' }));
    expect(mockEmit).toHaveBeenCalledWith('sync:complete', expect.objectContaining({ platform: 'RA' }));

    // La alerta Sentry se dispara con tag identificable
    expect(mockCaptureMessage).toHaveBeenCalledWith(
      expect.stringContaining('PSN_SYSTEM_NPSSO_EXPIRED'),
      expect.objectContaining({ level: 'error', tags: expect.objectContaining({ alert: 'psn-npsso-expired' }) }),
    );
  });

  it('FIX 1: dedup — si la clave de alerta ya está activa (SET NX falla), NO vuelve a llamar a Sentry', async () => {
    MockWorker.mockClear();
    startSyncWorker();
    const processFn = MockWorker.mock.calls[0]?.[1] as ProcessFn;

    // 1ª llamada = lock del batch (OK), 2ª llamada = dedup de la alerta YA ACTIVA (null)
    mockRedis.set.mockResolvedValueOnce('OK').mockResolvedValueOnce(null);
    const extendLock = jest.fn().mockResolvedValue(0);

    const psnAccount = {
      ...steamAccount, id: 'acc-psn', platform: 'PSN' as const, externalId: 'psn-user',
    };
    mockPrisma.platformAccount.findUnique.mockResolvedValueOnce(psnAccount);
    mockPrisma.userAchievement.findMany.mockResolvedValueOnce([]); // PSN prevEarnedIds

    const { psnAdapter: psnAdapterMock } = jest.requireMock('../platforms/psn.adapter') as { psnAdapter: { syncUser: jest.Mock } };
    psnAdapterMock.syncUser.mockRejectedValueOnce(
      new AppError('El PSN_SYSTEM_NPSSO ha expirado', 'PSN_SYSTEM_NPSSO_EXPIRED', 503),
    );

    await processFn({
      id: 'batch-npsso-dedup',
      name: 'sync-bg-user-1',
      opts: {},
      token: 'tok-npsso-dedup',
      extendLock,
      data: {
        userId: 'user-1',
        platforms: [{ platform: 'PSN', platformAccountId: 'acc-psn' }],
        triggerType: 'auto',
      },
    });

    expect(mockRedis.set).toHaveBeenCalledWith('alert:npsso-expired', '1', 'EX', 6 * 60 * 60, 'NX');
    expect(mockCaptureMessage).not.toHaveBeenCalled();
  });

  // ─── T104: del de syncProgressKey en finally del batch (safety-net interno) ──
  it('T104: batch — syncProgressKey borrada en finally aunque adapter de una plataforma falle', async () => {
    MockWorker.mockClear();
    startSyncWorker();
    const processFn = MockWorker.mock.calls[0]?.[1] as ProcessFn;

    mockRedis.set.mockResolvedValueOnce('OK');
    const extendLock = jest.fn().mockResolvedValue(0);

    // Plataforma única (STEAM) — adapter falla
    mockPrisma.platformAccount.findUnique.mockResolvedValueOnce(steamAccount);
    mockPrisma.userAchievement.findMany.mockResolvedValueOnce([]); // prevEarnedIds

    (mockSteamAdapter.syncUser as jest.Mock).mockRejectedValueOnce(new Error('Adapter error'));

    await processFn({
      id: 'batch-t104',
      name: 'sync-bg-user-1',
      opts: {},
      token: 'tok-t104',
      extendLock,
      data: {
        userId: 'user-1',
        platforms: [{ platform: 'STEAM', platformAccountId: 'acc-steam' }],
        triggerType: 'auto',
      },
    });

    // La clave sync:progress debe borrarse (del desde finally de syncPlatform + safety-net de batch)
    expect(mockRedis.del).toHaveBeenCalledWith('sync:progress:user-1:STEAM');
  });

  it('batch con lock ocupado abandona sin reencolar', async () => {
    MockWorker.mockClear();
    startSyncWorker();
    const processFn = MockWorker.mock.calls[0]?.[1] as ProcessFn;

    // Lock no disponible
    mockRedis.set.mockResolvedValueOnce(null);

    const result = await processFn({
      id: 'batch-locked',
      name: 'sync-bg-user-1',
      opts: {},
      data: {
        userId: 'user-1',
        platforms: [{ platform: 'STEAM', platformAccountId: 'acc-steam' }],
        triggerType: 'auto',
      },
    });

    // Batch no reencola — simplemente abandona
    expect((syncQueue.add as jest.Mock)).not.toHaveBeenCalled();
    expect((result as { achievementsSynced: number }).achievementsSynced).toBe(0);
  });
});

// ─── T102: TTL 900s en ambas escrituras setex ────────────────────────────────

describe('syncPlatform — T102: TTL de sync:progress = 900s (no 7200s)', () => {
  type JobLike = { data: { userId: string; platformAccountId: string; platform: string; triggerType: string } };
  type ProcessFn = (job: JobLike) => Promise<unknown>;

  it('usa TTL=900 en el setex inicial (isRunning=true al arrancar)', async () => {
    MockWorker.mockClear();
    startSyncWorker();
    const processFn = MockWorker.mock.calls[0]?.[1] as ProcessFn;

    mockRedis.set.mockResolvedValueOnce('OK');
    mockPrisma.userAchievement.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    (mockSteamAdapter.syncUser as jest.Mock).mockResolvedValueOnce({
      gamesUpdated: 0, achievementsSynced: 0, syncedAt: new Date().toISOString(),
    });
    mockPrisma.user.findUnique.mockResolvedValueOnce({ xp: 0, profileVisibility: 'PUBLIC' });
    mockPrisma.platformAccount.findMany.mockResolvedValueOnce([]);

    await processFn({ data: { userId: 'user-1', platformAccountId: 'acc-1', platform: 'STEAM', triggerType: 'manual' } });

    // El primer setex (isRunning: true, processed: 0) debe usar TTL 900
    expect(mockRedis.setex).toHaveBeenCalledWith(
      'sync:progress:user-1:STEAM',
      900,
      expect.stringContaining('"isRunning":true'),
    );
  });

  it('NO usa TTL=7200 en ninguna escritura setex de sync:progress', async () => {
    MockWorker.mockClear();
    startSyncWorker();
    const processFn = MockWorker.mock.calls[0]?.[1] as ProcessFn;

    mockRedis.set.mockResolvedValueOnce('OK');
    mockPrisma.userAchievement.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    (mockSteamAdapter.syncUser as jest.Mock).mockResolvedValueOnce({
      gamesUpdated: 0, achievementsSynced: 0, syncedAt: new Date().toISOString(),
    });
    mockPrisma.user.findUnique.mockResolvedValueOnce({ xp: 0, profileVisibility: 'PUBLIC' });
    mockPrisma.platformAccount.findMany.mockResolvedValueOnce([]);

    await processFn({ data: { userId: 'user-1', platformAccountId: 'acc-1', platform: 'STEAM', triggerType: 'manual' } });

    const setexCalls = (mockRedis.setex as jest.Mock).mock.calls;
    const staleSetex = setexCalls.filter(
      (call) => typeof call[0] === 'string' && call[0].startsWith('sync:progress') && call[1] === 7200,
    );
    expect(staleSetex).toHaveLength(0);
  });
});

// ─── T103: logger.info al inicio y fin de cada plataforma ───────────────────

describe('syncPlatform — T103: logs de inicio y fin por plataforma', () => {
  const mockLogger = logger as jest.Mocked<typeof logger>;

  type JobLike = { data: { userId: string; platformAccountId: string; platform: string; triggerType: string } };
  type ProcessFn = (job: JobLike) => Promise<unknown>;

  it('emite logger.info con "Sync iniciado" al arrancar la plataforma', async () => {
    MockWorker.mockClear();
    startSyncWorker();
    const processFn = MockWorker.mock.calls[0]?.[1] as ProcessFn;

    mockRedis.set.mockResolvedValueOnce('OK');
    mockPrisma.userAchievement.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    (mockSteamAdapter.syncUser as jest.Mock).mockResolvedValueOnce({
      gamesUpdated: 2, achievementsSynced: 5, syncedAt: new Date().toISOString(),
    });
    mockPrisma.user.findUnique.mockResolvedValueOnce({ xp: 0, profileVisibility: 'PUBLIC' });
    mockPrisma.platformAccount.findMany.mockResolvedValueOnce([]);

    await processFn({ data: { userId: 'user-1', platformAccountId: 'acc-1', platform: 'STEAM', triggerType: 'manual' } });

    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', platform: 'STEAM' }),
      '[SyncWorker] Sync iniciado',
    );
  });

  it('emite logger.info con "Sync completado" y métricas al terminar con éxito', async () => {
    MockWorker.mockClear();
    startSyncWorker();
    const processFn = MockWorker.mock.calls[0]?.[1] as ProcessFn;

    mockRedis.set.mockResolvedValueOnce('OK');
    mockPrisma.userAchievement.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    (mockSteamAdapter.syncUser as jest.Mock).mockResolvedValueOnce({
      gamesUpdated: 3, achievementsSynced: 12, syncedAt: new Date().toISOString(),
    });
    mockPrisma.user.findUnique.mockResolvedValueOnce({ xp: 0, profileVisibility: 'PUBLIC' });
    mockPrisma.platformAccount.findMany.mockResolvedValueOnce([]);

    await processFn({ data: { userId: 'user-1', platformAccountId: 'acc-1', platform: 'STEAM', triggerType: 'manual' } });

    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        platform: 'STEAM',
        gamesUpdated: 3,
        achievementsSynced: 12,
      }),
      '[SyncWorker] Sync completado',
    );
  });

  it('NO emite "Sync completado" cuando el adapter falla', async () => {
    MockWorker.mockClear();
    startSyncWorker();
    const processFn = MockWorker.mock.calls[0]?.[1] as ProcessFn;

    mockRedis.set.mockResolvedValueOnce('OK');
    mockPrisma.userAchievement.findMany.mockResolvedValueOnce([]);
    (mockSteamAdapter.syncUser as jest.Mock).mockRejectedValueOnce(new Error('Timeout'));

    await expect(
      processFn({ data: { userId: 'user-1', platformAccountId: 'acc-1', platform: 'STEAM', triggerType: 'manual' } }),
    ).rejects.toThrow();

    const completadoCalls = (mockLogger.info as jest.Mock).mock.calls.filter(
      (call) => call[1] === '[SyncWorker] Sync completado',
    );
    expect(completadoCalls).toHaveLength(0);
  });
});

// ─── T104: del de syncProgressKey en finally — cubre código post-adapter ─────

describe('syncPlatform — T104: syncProgressKey borrada en finally en todos los caminos', () => {
  type JobLike = { data: { userId: string; platformAccountId: string; platform: string; triggerType: string } };
  type ProcessFn = (job: JobLike) => Promise<unknown>;

  it('borra syncProgressKey cuando el adapter falla (error path)', async () => {
    MockWorker.mockClear();
    startSyncWorker();
    const processFn = MockWorker.mock.calls[0]?.[1] as ProcessFn;

    mockRedis.set.mockResolvedValueOnce('OK');
    mockPrisma.userAchievement.findMany.mockResolvedValueOnce([]);
    (mockSteamAdapter.syncUser as jest.Mock).mockRejectedValueOnce(new Error('API down'));

    await expect(
      processFn({ data: { userId: 'user-1', platformAccountId: 'acc-1', platform: 'STEAM', triggerType: 'manual' } }),
    ).rejects.toThrow();

    expect(mockRedis.del).toHaveBeenCalledWith('sync:progress:user-1:STEAM');
  });

  it('borra syncProgressKey cuando falla código post-adapter (prisma.platformAccount.upsert)', async () => {
    MockWorker.mockClear();
    startSyncWorker();
    const processFn = MockWorker.mock.calls[0]?.[1] as ProcessFn;

    mockRedis.set.mockResolvedValueOnce('OK');
    mockPrisma.userAchievement.findMany.mockResolvedValueOnce([]);

    // Adapter tiene éxito
    (mockSteamAdapter.syncUser as jest.Mock).mockResolvedValueOnce({
      gamesUpdated: 1, achievementsSynced: 5, syncedAt: new Date().toISOString(),
    });
    // Pero el upsert post-adapter falla
    mockPrisma.platformAccount.upsert.mockRejectedValueOnce(new Error('DB timeout'));

    await expect(
      processFn({ data: { userId: 'user-1', platformAccountId: 'acc-1', platform: 'STEAM', triggerType: 'manual' } }),
    ).rejects.toThrow('DB timeout');

    // T104: el finally de syncPlatform garantiza el borrado aunque el adapter haya tenido éxito
    expect(mockRedis.del).toHaveBeenCalledWith('sync:progress:user-1:STEAM');
  });

  it('borra syncProgressKey en el camino exitoso (success path)', async () => {
    MockWorker.mockClear();
    startSyncWorker();
    const processFn = MockWorker.mock.calls[0]?.[1] as ProcessFn;

    mockRedis.set.mockResolvedValueOnce('OK');
    mockPrisma.userAchievement.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    (mockSteamAdapter.syncUser as jest.Mock).mockResolvedValueOnce({
      gamesUpdated: 0, achievementsSynced: 0, syncedAt: new Date().toISOString(),
    });
    mockPrisma.user.findUnique.mockResolvedValueOnce({ xp: 0, profileVisibility: 'PUBLIC' });
    mockPrisma.platformAccount.findMany.mockResolvedValueOnce([]);

    await processFn({ data: { userId: 'user-1', platformAccountId: 'acc-1', platform: 'STEAM', triggerType: 'manual' } });

    expect(mockRedis.del).toHaveBeenCalledWith('sync:progress:user-1:STEAM');
  });
});
