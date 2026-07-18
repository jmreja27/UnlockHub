jest.mock('../lib/redis', () => ({
  redis: {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn(),
    del: jest.fn(),
  },
  createWorkerConnection: jest.fn().mockReturnValue({}),
}));

jest.mock('../lib/prisma', () => ({
  prisma: {
    platformAccount: { findMany: jest.fn() },
  },
}));

jest.mock('../lib/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
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

// BullMQ instanciado en el módulo — mock mínimo
jest.mock('bullmq', () => ({
  Queue: jest.fn().mockImplementation(() => ({
    getRepeatableJobs: jest.fn().mockResolvedValue([]),
    removeRepeatableByKey: jest.fn().mockResolvedValue(undefined),
    add: jest.fn().mockResolvedValue(undefined),
  })),
  Worker: jest.fn().mockImplementation(() => ({ on: jest.fn(), close: jest.fn() })),
}));

import { redis } from '../lib/redis';
import { prisma } from '../lib/prisma';
import { syncQueue } from '../jobs/sync.queue';
import { runBackgroundSyncs, startBackgroundSyncWorker } from '../jobs/background-sync.scheduler';
import { Worker } from 'bullmq';

const mockRedis = redis as jest.Mocked<typeof redis>;
const mockPrisma = prisma as jest.Mocked<typeof prisma>;

const STEAM_DAILY_LIMIT = 100_000;
const STEAM_BACKGROUND_SYNC_THRESHOLD = 0.8;

beforeEach(() => {
  jest.clearAllMocks();
  // Por defecto: Steam dentro del límite (sin cuota)
  mockRedis.get.mockResolvedValue('0');
});

describe('runBackgroundSyncs — agrupación por usuario (un job por usuario)', () => {
  it('encola 1 job por usuario cuando hay 1 usuario con 2 plataformas', async () => {
    (mockPrisma.platformAccount.findMany as jest.Mock).mockResolvedValue([
      { id: 'acc-steam', userId: 'user-1', platform: 'STEAM' },
      { id: 'acc-ra', userId: 'user-1', platform: 'RA' },
    ]);

    await runBackgroundSyncs();

    expect((syncQueue.add as jest.Mock)).toHaveBeenCalledTimes(1);
  });

  it('encola 2 jobs cuando hay 2 usuarios distintos', async () => {
    (mockPrisma.platformAccount.findMany as jest.Mock).mockResolvedValue([
      { id: 'acc-a1', userId: 'user-1', platform: 'STEAM' },
      { id: 'acc-a2', userId: 'user-2', platform: 'RA' },
    ]);

    await runBackgroundSyncs();

    expect((syncQueue.add as jest.Mock)).toHaveBeenCalledTimes(2);
  });

  it('el job contiene el array de plataformas del usuario', async () => {
    (mockPrisma.platformAccount.findMany as jest.Mock).mockResolvedValue([
      { id: 'acc-steam', userId: 'user-1', platform: 'STEAM' },
      { id: 'acc-psn', userId: 'user-1', platform: 'PSN' },
    ]);

    await runBackgroundSyncs();

    expect((syncQueue.add as jest.Mock)).toHaveBeenCalledWith(
      'sync-bg-user-1',
      expect.objectContaining({
        userId: 'user-1',
        triggerType: 'auto',
        platforms: expect.arrayContaining([
          { platform: 'STEAM', platformAccountId: 'acc-steam' },
          { platform: 'PSN', platformAccountId: 'acc-psn' },
        ]),
      }),
      expect.objectContaining({ jobId: 'sync-bg-user-1' }),
    );
  });

  it('el jobId determinista sync-bg-{userId} garantiza deduplicación nativa', async () => {
    (mockPrisma.platformAccount.findMany as jest.Mock).mockResolvedValue([
      { id: 'acc-1', userId: 'user-1', platform: 'STEAM' },
    ]);

    await runBackgroundSyncs();

    const opts = (syncQueue.add as jest.Mock).mock.calls[0]?.[2];
    expect(opts).toMatchObject({ jobId: 'sync-bg-user-1' });
  });

  it('usa removeOnComplete:true y removeOnFail:{age:300} (regresión bug auto-bloqueo por jobId fijo)', async () => {
    (mockPrisma.platformAccount.findMany as jest.Mock).mockResolvedValue([
      { id: 'acc-1', userId: 'user-1', platform: 'STEAM' },
    ]);

    await runBackgroundSyncs();

    const opts = (syncQueue.add as jest.Mock).mock.calls[0]?.[2];
    expect(opts).toMatchObject({
      jobId: 'sync-bg-user-1',
      removeOnComplete: true,
      removeOnFail: { age: 300 },
    });
  });

  it('no encola nada cuando no hay cuentas activas', async () => {
    (mockPrisma.platformAccount.findMany as jest.Mock).mockResolvedValue([]);

    await runBackgroundSyncs();

    expect((syncQueue.add as jest.Mock)).not.toHaveBeenCalled();
  });
});

describe('runBackgroundSyncs — A41: Steam omitido del array si supera umbral del 80 %', () => {
  it('incluye Steam en el array cuando el contador está por debajo del umbral', async () => {
    // Contador en 79.999 (< 80 %)
    mockRedis.get.mockResolvedValue('79999');

    (mockPrisma.platformAccount.findMany as jest.Mock).mockResolvedValue([
      { id: 'acc-steam', userId: 'user-1', platform: 'STEAM' },
      { id: 'acc-ra', userId: 'user-1', platform: 'RA' },
    ]);

    await runBackgroundSyncs();

    const jobData = (syncQueue.add as jest.Mock).mock.calls[0]?.[1];
    expect(jobData.platforms).toEqual(
      expect.arrayContaining([expect.objectContaining({ platform: 'STEAM' })]),
    );
  });

  it('omite Steam del array de plataformas del usuario cuando el contador supera el 80 %', async () => {
    // Contador exactamente en el umbral del 80 %
    mockRedis.get.mockResolvedValue(String(Math.floor(STEAM_DAILY_LIMIT * STEAM_BACKGROUND_SYNC_THRESHOLD)));

    (mockPrisma.platformAccount.findMany as jest.Mock).mockResolvedValue([
      { id: 'acc-steam', userId: 'user-1', platform: 'STEAM' },
      { id: 'acc-ra', userId: 'user-1', platform: 'RA' },
    ]);

    await runBackgroundSyncs();

    // El job se encola para user-1, pero sin Steam
    expect((syncQueue.add as jest.Mock)).toHaveBeenCalledTimes(1);
    const jobData = (syncQueue.add as jest.Mock).mock.calls[0]?.[1];
    expect(jobData.platforms).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ platform: 'STEAM' })]),
    );
    expect(jobData.platforms).toEqual(
      expect.arrayContaining([expect.objectContaining({ platform: 'RA' })]),
    );
  });

  it('NO encola job cuando Steam supera umbral y es la única plataforma del usuario', async () => {
    mockRedis.get.mockResolvedValue('80000');

    (mockPrisma.platformAccount.findMany as jest.Mock).mockResolvedValue([
      { id: 'acc-steam', userId: 'user-1', platform: 'STEAM' },
    ]);

    await runBackgroundSyncs();

    // Sin plataformas elegibles para user-1 → no se encola
    expect((syncQueue.add as jest.Mock)).not.toHaveBeenCalled();
  });

  it('encola el usuario con otras plataformas aunque Steam sea omitido por cuota', async () => {
    mockRedis.get.mockResolvedValue('80000');

    (mockPrisma.platformAccount.findMany as jest.Mock).mockResolvedValue([
      { id: 'acc-steam', userId: 'user-1', platform: 'STEAM' },
      { id: 'acc-psn', userId: 'user-1', platform: 'PSN' },
    ]);

    await runBackgroundSyncs();

    expect((syncQueue.add as jest.Mock)).toHaveBeenCalledTimes(1);
    const jobData = (syncQueue.add as jest.Mock).mock.calls[0]?.[1];
    expect(jobData.platforms).toHaveLength(1);
    expect(jobData.platforms[0]).toMatchObject({ platform: 'PSN' });
  });
});

describe('startBackgroundSyncWorker', () => {
  it('instancia un Worker en la cola background-sync', () => {
    startBackgroundSyncWorker();
    expect(Worker).toHaveBeenCalledWith(
      'background-sync',
      expect.any(Function),
      expect.any(Object),
    );
  });

  it('retorna el worker con método close', () => {
    const worker = startBackgroundSyncWorker();
    expect(worker.close).toBeDefined();
  });
});

describe('runBackgroundSyncs — filtro por userId (force-sync)', () => {
  it('runBackgroundSyncs(userId) pasa where:{userId} a la query y omite el filtro lastSyncAt', async () => {
    (mockPrisma.platformAccount.findMany as jest.Mock).mockResolvedValue([
      { id: 'acc-steam', userId: 'user-x', platform: 'STEAM' },
      { id: 'acc-ra', userId: 'user-x', platform: 'RA' },
    ]);

    await runBackgroundSyncs('user-x');

    expect(mockPrisma.platformAccount.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'user-x' } }),
    );
    expect((syncQueue.add as jest.Mock)).toHaveBeenCalledTimes(1);
    expect((syncQueue.add as jest.Mock)).toHaveBeenCalledWith(
      'sync-bg-user-x',
      expect.objectContaining({ userId: 'user-x' }),
      expect.objectContaining({ jobId: 'sync-bg-user-x' }),
    );
  });

  it('runBackgroundSyncs() sin argumento usa el filtro lastSyncAt (lte 24h OR null) y encola todos los usuarios elegibles', async () => {
    (mockPrisma.platformAccount.findMany as jest.Mock).mockResolvedValue([
      { id: 'acc-a1', userId: 'user-1', platform: 'STEAM' },
      { id: 'acc-a2', userId: 'user-2', platform: 'RA' },
    ]);

    await runBackgroundSyncs();

    expect(mockPrisma.platformAccount.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          user: {
            OR: [{ lastSyncAt: null }, { lastSyncAt: { lte: expect.any(Date) } }],
          },
        },
      }),
    );
    expect((syncQueue.add as jest.Mock)).toHaveBeenCalledTimes(2);
  });
});

describe('runBackgroundSyncs — FIX 3: incluye usuarios con lastSyncAt null (nunca sincronizados)', () => {
  it('encola el job de un usuario cuyo lastSyncAt es null y tiene al menos una plataforma vinculada', async () => {
    // El mock de Prisma simula el resultado real de la query: solo devuelve filas de
    // PlatformAccount, así que un usuario sin ninguna cuenta vinculada nunca puede aparecer aquí
    // (la tabla platformAccount es la que se consulta, no User) — no hace falta guardarlo aparte.
    (mockPrisma.platformAccount.findMany as jest.Mock).mockResolvedValue([
      { id: 'acc-null-user', userId: 'user-never-synced', platform: 'RA' },
    ]);

    await runBackgroundSyncs();

    expect((syncQueue.add as jest.Mock)).toHaveBeenCalledTimes(1);
    expect((syncQueue.add as jest.Mock)).toHaveBeenCalledWith(
      'sync-bg-user-never-synced',
      expect.objectContaining({ userId: 'user-never-synced' }),
      expect.objectContaining({ jobId: 'sync-bg-user-never-synced' }),
    );
  });

  it('sigue incluyendo usuarios con lastSyncAt > 24h (caso previo, sin regresión)', async () => {
    (mockPrisma.platformAccount.findMany as jest.Mock).mockResolvedValue([
      { id: 'acc-stale', userId: 'user-stale', platform: 'STEAM' },
    ]);

    await runBackgroundSyncs();

    expect((syncQueue.add as jest.Mock)).toHaveBeenCalledTimes(1);
    expect((syncQueue.add as jest.Mock)).toHaveBeenCalledWith(
      'sync-bg-user-stale',
      expect.objectContaining({ userId: 'user-stale' }),
      expect.objectContaining({ jobId: 'sync-bg-user-stale' }),
    );
  });
});
