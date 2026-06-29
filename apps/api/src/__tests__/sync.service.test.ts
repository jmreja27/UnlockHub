import * as syncService from '../services/sync.service';
import { AppError } from '../middleware/errorHandler';

jest.mock('../lib/redis', () => ({
  redis: {
    ttl: jest.fn(),
    get: jest.fn(),
    set: jest.fn(),
    incr: jest.fn(),
    decr: jest.fn(),
    expire: jest.fn(),
    del: jest.fn(),
  },
}));

jest.mock('../lib/prisma', () => ({
  prisma: {
    platformAccount: { findUnique: jest.fn(), findMany: jest.fn(), upsert: jest.fn(), count: jest.fn() },
    user: { update: jest.fn() },
  },
}));

jest.mock('../config/features', () => ({
  FEATURES: { premium: false },
}));

jest.mock('../jobs/sync.queue', () => ({
  syncQueue: { add: jest.fn().mockResolvedValue({ id: 'job-1' }) },
}));

import { redis } from '../lib/redis';
import { prisma } from '../lib/prisma';
import { syncQueue } from '../jobs/sync.queue';
import { FEATURES } from '../config/features';

const mockRedis = redis as jest.Mocked<typeof redis>;
const mockPrisma = prisma as jest.Mocked<typeof prisma>;

const account = {
  id: 'acc-1',
  userId: 'user-1',
  platform: 'STEAM' as const,
  externalId: '76561198000000000',
  username: 'testuser',
  encryptedToken: 'encrypted',
  lastSyncedAt: null,
  syncCooldownUntil: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

beforeEach(() => jest.clearAllMocks());

describe('syncService.triggerManualSync', () => {
  it('encola job batch (sync-bg-{userId}) con todas las plataformas cuando no hay cooldown', async () => {
    mockRedis.ttl.mockResolvedValue(-1);
    mockRedis.incr.mockResolvedValue(1);
    mockRedis.expire.mockResolvedValue(1);
    mockRedis.set.mockResolvedValue('OK');
    (mockPrisma.platformAccount.findUnique as jest.Mock).mockResolvedValue(account);
    (mockPrisma.platformAccount.findMany as jest.Mock).mockResolvedValue([account]);

    const result = await syncService.triggerManualSync('user-1', 'STEAM', false);

    expect(result.jobId).toBe('job-1');
    expect(result.platform).toBe('STEAM');
    // Verifica convergencia en batch con jobId determinista
    expect((syncQueue.add as jest.Mock)).toHaveBeenCalledWith(
      'sync-bg-user-1',
      expect.objectContaining({
        userId: 'user-1',
        triggerType: 'manual',
        platforms: [{ platform: 'STEAM', platformAccountId: 'acc-1' }],
      }),
      expect.objectContaining({ jobId: 'sync-bg-user-1' }),
    );
  });

  it('lanza SYNC_COOLDOWN si el cooldown de Redis estÃ¡ activo', async () => {
    // SET NX devuelve null cuando la clave ya existe (cooldown activo)
    mockRedis.set.mockResolvedValue(null);
    mockRedis.ttl.mockResolvedValue(120);

    await expect(
      syncService.triggerManualSync('user-1', 'STEAM', false),
    ).rejects.toMatchObject({ code: 'SYNC_COOLDOWN', statusCode: 429 });
  });

  it('lanza DAILY_SYNC_LIMIT_EXCEEDED para free con 5 syncs ya realizados (INCR devuelve 6)', async () => {
    // SET NX devuelve 'OK' â†' cooldown adquirido correctamente, no hay bloqueo por cooldown
    mockRedis.set.mockResolvedValue('OK');
    mockRedis.ttl.mockResolvedValue(-1);
    // INCR devuelve 6 â†' supera el lÃ­mite de 5
    mockRedis.incr.mockResolvedValue(6);
    mockRedis.decr.mockResolvedValue(5);

    await expect(
      syncService.triggerManualSync('user-1', 'STEAM', false),
    ).rejects.toMatchObject({ code: 'DAILY_SYNC_LIMIT_EXCEEDED', statusCode: 429 });

    // Verifica que se revierte el contador
    expect(mockRedis.decr).toHaveBeenCalled();
  });

  // Con FEATURES.premium = false todos los usuarios siguen el tier free (incluidos isPremium=true)
  it('isPremium=true aplica límite diario mientras premium está desactivado por feature flag', async () => {
    mockRedis.ttl.mockResolvedValue(-1);
    mockRedis.incr.mockResolvedValue(1);
    mockRedis.expire.mockResolvedValue(1);
    mockRedis.set.mockResolvedValue('OK');
    (mockPrisma.platformAccount.findUnique as jest.Mock).mockResolvedValue(account);
    (mockPrisma.platformAccount.findMany as jest.Mock).mockResolvedValue([account]);

    const result = await syncService.triggerManualSync('user-1', 'STEAM', true);

    expect(result.jobId).toBe('job-1');
    expect(mockRedis.incr).toHaveBeenCalled();
  });

  it('lanza PLATFORM_NOT_LINKED si no hay cuenta vinculada', async () => {
    mockRedis.ttl.mockResolvedValue(-1);
    mockRedis.incr.mockResolvedValue(1);
    mockRedis.expire.mockResolvedValue(1);
    (mockPrisma.platformAccount.findUnique as jest.Mock).mockResolvedValue(null);

    await expect(
      syncService.triggerManualSync('user-1', 'STEAM', false),
    ).rejects.toMatchObject({ code: 'PLATFORM_NOT_LINKED', statusCode: 404 });
  });

  it('fija el TTL con expire solo en el primer sync del día (INCR = 1)', async () => {
    mockRedis.ttl.mockResolvedValue(-1);
    mockRedis.incr.mockResolvedValue(1);
    mockRedis.expire.mockResolvedValue(1);
    mockRedis.set.mockResolvedValue('OK');
    (mockPrisma.platformAccount.findUnique as jest.Mock).mockResolvedValue(account);
    (mockPrisma.platformAccount.findMany as jest.Mock).mockResolvedValue([account]);

    await syncService.triggerManualSync('user-1', 'STEAM', false);

    expect(mockRedis.expire).toHaveBeenCalledTimes(1);
  });

  it('no llama a expire si el contador ya existía (INCR > 1)', async () => {
    mockRedis.ttl.mockResolvedValue(-1);
    mockRedis.incr.mockResolvedValue(3);
    mockRedis.set.mockResolvedValue('OK');
    (mockPrisma.platformAccount.findUnique as jest.Mock).mockResolvedValue(account);
    (mockPrisma.platformAccount.findMany as jest.Mock).mockResolvedValue([account]);

    await syncService.triggerManualSync('user-1', 'STEAM', false);

    expect(mockRedis.expire).not.toHaveBeenCalled();
  });
});

describe('syncService.getSyncStatus', () => {
  it('devuelve estado de sync con cooldown restante', async () => {
    (mockPrisma.platformAccount.findUnique as jest.Mock).mockResolvedValue({
      lastSyncedAt: new Date('2024-01-01'),
      syncCooldownUntil: null,
    });
    mockRedis.ttl.mockResolvedValue(300);
    mockRedis.get.mockResolvedValue('2');

    const status = await syncService.getSyncStatus('user-1', 'STEAM');

    expect(status.cooldownRemainingSeconds).toBe(300);
    expect(status.dailySyncsUsed).toBe(2);
    expect(status.linked).toBe(true);
  });

  it('linked es false si no hay cuenta vinculada', async () => {
    (mockPrisma.platformAccount.findUnique as jest.Mock).mockResolvedValue(null);
    mockRedis.ttl.mockResolvedValue(-1);
    mockRedis.get.mockResolvedValue(null);

    const status = await syncService.getSyncStatus('user-1', 'RA');

    expect(status.linked).toBe(false);
    expect(status.lastSyncedAt).toBeNull();
  });
});

describe('syncService.triggerManualSync — lock activo (in_progress)', () => {
  it('devuelve status:in_progress sin encolar cuando el lock Redis está activo', async () => {
    // Primera llamada redis.get: lock key existe (sync activo)
    mockRedis.get.mockResolvedValueOnce('some-job-id');

    const result = await syncService.triggerManualSync('user-1', 'STEAM', false);

    expect(result).toMatchObject({ status: 'in_progress', platform: 'STEAM' });
    // No debe encolar ni consumir cooldown/cuota
    expect((syncQueue.add as jest.Mock)).not.toHaveBeenCalled();
    expect(mockRedis.set).not.toHaveBeenCalled();
    expect(mockRedis.incr).not.toHaveBeenCalled();
  });

  it('procede normalmente cuando el lock no está activo (get devuelve null)', async () => {
    // Primera llamada redis.get: lock no existe
    mockRedis.get.mockResolvedValueOnce(null);
    mockRedis.set.mockResolvedValue('OK');
    mockRedis.incr.mockResolvedValue(1);
    mockRedis.expire.mockResolvedValue(1);
    (mockPrisma.platformAccount.findUnique as jest.Mock).mockResolvedValue(account);
    (mockPrisma.platformAccount.findMany as jest.Mock).mockResolvedValue([account]);

    const result = await syncService.triggerManualSync('user-1', 'STEAM', false);

    expect(result.jobId).toBe('job-1');
  });
});

describe('syncService.triggerManualSync — cuota Steam 90 % (A41)', () => {
  it('encola Steam normalmente cuando el contador está por debajo del 90 %', async () => {
    // Primera get: lock check (null = sin sync activo)
    mockRedis.get.mockResolvedValueOnce(null);
    mockRedis.set.mockResolvedValue('OK');
    mockRedis.incr.mockResolvedValue(1);
    mockRedis.expire.mockResolvedValue(1);
    // Segunda get: contador Steam en 89.999 (89,999 % < 90 %)
    mockRedis.get.mockResolvedValueOnce('89999');
    (mockPrisma.platformAccount.findUnique as jest.Mock).mockResolvedValue(account);
    (mockPrisma.platformAccount.findMany as jest.Mock).mockResolvedValue([account]);

    const result = await syncService.triggerManualSync('user-1', 'STEAM', false);

    expect(result.jobId).toBe('job-1');
    expect(result.skippedByQuota).toBeUndefined();
  });

  it('devuelve skippedByQuota: true y libera cooldown cuando contador ≥ 90 % y usuario tiene otras plataformas', async () => {
    // Primera get: lock check (null)
    mockRedis.get.mockResolvedValueOnce(null);
    mockRedis.set.mockResolvedValue('OK');
    // Segunda get: contador en 90.000 (exactamente el umbral del 90 %)
    mockRedis.get.mockResolvedValueOnce('90000');
    mockRedis.del.mockResolvedValue(1);
    // Usuario tiene RA vinculada además de STEAM
    (mockPrisma.platformAccount.count as jest.Mock).mockResolvedValue(1);

    const result = await syncService.triggerManualSync('user-1', 'STEAM', false);

    expect(result.skippedByQuota).toBe(true);
    expect(result.jobId).toBeUndefined();
    // El cooldown debe liberarse para no penalizar al usuario
    expect(mockRedis.del).toHaveBeenCalledWith('sync:cooldown:user-1:STEAM');
  });

  it('lanza STEAM_QUOTA_EXCEEDED 429 cuando contador ≥ 90 % y Steam es la única plataforma', async () => {
    // Primera get: lock check (null)
    mockRedis.get.mockResolvedValueOnce(null);
    mockRedis.set.mockResolvedValue('OK');
    // Segunda get: contador en 95.000 (por encima del umbral del 90 %)
    mockRedis.get.mockResolvedValueOnce('95000');
    mockRedis.del.mockResolvedValue(1);
    // Sin otras plataformas vinculadas
    (mockPrisma.platformAccount.count as jest.Mock).mockResolvedValue(0);

    await expect(
      syncService.triggerManualSync('user-1', 'STEAM', false),
    ).rejects.toMatchObject({ code: 'STEAM_QUOTA_EXCEEDED', statusCode: 429 });

    expect(mockRedis.del).toHaveBeenCalledWith('sync:cooldown:user-1:STEAM');
  });
});

describe('AppError details', () => {
  it('incluye remainingSeconds en SYNC_COOLDOWN', async () => {
    // SET NX devuelve null cuando la clave ya existe (cooldown activo)
    mockRedis.set.mockResolvedValue(null);
    mockRedis.ttl.mockResolvedValue(60);

    try {
      await syncService.triggerManualSync('user-1', 'STEAM', false);
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).details).toEqual({ remainingSeconds: 60 });
    }
  });
});

describe('syncService.getAggregateSyncStatus', () => {
  const steamLastSync = new Date('2024-06-01T10:00:00.000Z');
  const raLastSync = new Date('2024-06-01T09:00:00.000Z');

  beforeEach(() => {
    // Por defecto: dos plataformas vinculadas, sin cooldown, 2 syncs usados
    (mockPrisma.platformAccount.findMany as jest.Mock).mockResolvedValue([
      { platform: 'STEAM', lastSyncedAt: steamLastSync },
      { platform: 'RA', lastSyncedAt: raLastSync },
    ]);
    mockRedis.ttl.mockResolvedValue(-1); // sin cooldown
    mockRedis.get.mockResolvedValue('2'); // 2 syncs usados
  });

  it('devuelve anyPlatformLinked: false cuando no hay plataformas vinculadas', async () => {
    (mockPrisma.platformAccount.findMany as jest.Mock).mockResolvedValue([]);

    const result = await syncService.getAggregateSyncStatus('user-1', false);

    expect(result.anyPlatformLinked).toBe(false);
    expect(result.canSyncNow).toBe(false);
    expect(result.lastSyncAt).toBeNull();
  });

  it('devuelve lastSyncAt del sync mÃ¡s reciente entre plataformas', async () => {
    const result = await syncService.getAggregateSyncStatus('user-1', false);

    expect(result.lastSyncAt).toBe(steamLastSync.toISOString());
  });

  it('calcula nextAutoSyncAt: lastSyncAt + 60 min para free', async () => {
    const result = await syncService.getAggregateSyncStatus('user-1', false);

    const expected = new Date(steamLastSync.getTime() + 60 * 60 * 1000).toISOString();
    expect(result.nextAutoSyncAt).toBe(expected);
  });

  it('calcula nextAutoSyncAt: +60 min (FEATURES.premium=false aplica tier free a todos)', async () => {
    const result = await syncService.getAggregateSyncStatus('user-1', true);

    const expected = new Date(steamLastSync.getTime() + 60 * 60 * 1000).toISOString();
    expect(result.nextAutoSyncAt).toBe(expected);
  });

  it('canSyncNow: false cuando todas las plataformas tienen cooldown activo', async () => {
    mockRedis.ttl.mockResolvedValue(300); // cooldown de 5 min en todas

    const result = await syncService.getAggregateSyncStatus('user-1', false);

    expect(result.canSyncNow).toBe(false);
    expect(result.cooldownRemainingSeconds).toBe(300);
    expect(result.cooldownUntil).not.toBeNull();
  });

  it('canSyncNow: true cuando al menos una plataforma no tiene cooldown', async () => {
    // STEAM sin cooldown (TTL = -1), RA con cooldown (TTL = 300)
    mockRedis.ttl
      .mockResolvedValueOnce(-1)  // STEAM: sin cooldown
      .mockResolvedValueOnce(300); // RA: con cooldown

    const result = await syncService.getAggregateSyncStatus('user-1', false);

    expect(result.canSyncNow).toBe(true);
  });

  it('dailySyncsLimit: 5 siempre mientras FEATURES.premium=false (aplica config free a todos)', async () => {
    const freeResult = await syncService.getAggregateSyncStatus('user-1', false);
    const premiumResult = await syncService.getAggregateSyncStatus('user-1', true);

    expect(freeResult.dailySyncsLimit).toBe(5);
    expect(premiumResult.dailySyncsLimit).toBe(5);
  });

  it('manualSyncsUsedToday es el mÃ¡ximo de todos los contadores por plataforma', async () => {
    // STEAM: 3 syncs, RA: 1 sync
    mockRedis.get
      .mockResolvedValueOnce('3')
      .mockResolvedValueOnce('1');

    const result = await syncService.getAggregateSyncStatus('user-1', false);

    expect(result.manualSyncsUsedToday).toBe(3);
  });

  it('canSyncNow: false cuando free ha agotado el lÃ­mite diario en todas las plataformas', async () => {
    // Ambas plataformas sin cooldown pero con 5 syncs (lÃ­mite agotado)
    mockRedis.ttl.mockResolvedValue(-1);
    mockRedis.get.mockResolvedValue('5');

    const result = await syncService.getAggregateSyncStatus('user-1', false);

    expect(result.canSyncNow).toBe(false);
  });
});

describe('syncService.triggerAppOpenSync', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (FEATURES as { premium: boolean }).premium = false;
    (syncQueue.add as jest.Mock).mockResolvedValue({ id: 'job-1' });
  });

  afterEach(() => {
    (FEATURES as { premium: boolean }).premium = false;
  });

  it('TTL del cooldown es 3600s (60 min) para tier free (autoSyncIntervalMinutes=60)', async () => {
    mockRedis.set.mockResolvedValue('OK');
    (mockPrisma.platformAccount.findMany as jest.Mock).mockResolvedValue([account]);

    await syncService.triggerAppOpenSync('user-1', false);

    expect(mockRedis.set).toHaveBeenCalledWith('sync:appopen:user-1', '1', 'EX', 3600, 'NX');
  });

  it('TTL del cooldown es 900s (15 min) para tier premium con FEATURES.premium=true', async () => {
    (FEATURES as { premium: boolean }).premium = true;
    mockRedis.set.mockResolvedValue('OK');
    (mockPrisma.platformAccount.findMany as jest.Mock).mockResolvedValue([account]);

    await syncService.triggerAppOpenSync('user-1', true);

    expect(mockRedis.set).toHaveBeenCalledWith('sync:appopen:user-1', '1', 'EX', 900, 'NX');
  });

  it('TTL es 3600s (free) aunque isPremium=true cuando FEATURES.premium=false', async () => {
    mockRedis.set.mockResolvedValue('OK');
    (mockPrisma.platformAccount.findMany as jest.Mock).mockResolvedValue([account]);

    await syncService.triggerAppOpenSync('user-1', true);

    expect(mockRedis.set).toHaveBeenCalledWith('sync:appopen:user-1', '1', 'EX', 3600, 'NX');
  });

  it('devuelve {queued:false} si el cooldown Redis ya está activo (SET NX retorna null)', async () => {
    mockRedis.set.mockResolvedValue(null);

    const result = await syncService.triggerAppOpenSync('user-1', false);

    expect(result).toEqual({ queued: false });
    expect(syncQueue.add as jest.Mock).not.toHaveBeenCalled();
  });

  it('devuelve {queued:true} y encola sync-bg-{userId} cuando adquiere el cooldown', async () => {
    mockRedis.set.mockResolvedValue('OK');
    (mockPrisma.platformAccount.findMany as jest.Mock).mockResolvedValue([account]);

    const result = await syncService.triggerAppOpenSync('user-1', false);

    expect(result).toEqual({ queued: true });
    expect(syncQueue.add as jest.Mock).toHaveBeenCalledWith(
      'sync-bg-user-1',
      expect.objectContaining({ userId: 'user-1', triggerType: 'auto' }),
      expect.objectContaining({ jobId: 'sync-bg-user-1' }),
    );
  });

  it('devuelve {queued:false} si el usuario no tiene plataformas vinculadas', async () => {
    mockRedis.set.mockResolvedValue('OK');
    (mockPrisma.platformAccount.findMany as jest.Mock).mockResolvedValue([]);

    const result = await syncService.triggerAppOpenSync('user-1', false);

    expect(result).toEqual({ queued: false });
    expect(syncQueue.add as jest.Mock).not.toHaveBeenCalled();
  });
});

