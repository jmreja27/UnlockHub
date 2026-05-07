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
  },
}));

jest.mock('../lib/prisma', () => ({
  prisma: {
    platformAccount: { findUnique: jest.fn(), update: jest.fn() },
    user: { update: jest.fn() },
  },
}));

jest.mock('../jobs/sync.queue', () => ({
  syncQueue: { add: jest.fn().mockResolvedValue({ id: 'job-1' }) },
}));

import { redis } from '../lib/redis';
import { prisma } from '../lib/prisma';

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
  it('encola el job y devuelve jobId cuando no hay cooldown', async () => {
    mockRedis.ttl.mockResolvedValue(-1);
    // INCR devuelve 1 (primer sync del día) → dentro del límite
    mockRedis.incr.mockResolvedValue(1);
    mockRedis.expire.mockResolvedValue(1);
    mockRedis.set.mockResolvedValue('OK');
    (mockPrisma.platformAccount.findUnique as jest.Mock).mockResolvedValue(account);

    const result = await syncService.triggerManualSync('user-1', 'STEAM', false);

    expect(result.jobId).toBe('job-1');
    expect(result.platform).toBe('STEAM');
  });

  it('lanza SYNC_COOLDOWN si el cooldown de Redis está activo', async () => {
    mockRedis.ttl.mockResolvedValue(120);

    await expect(
      syncService.triggerManualSync('user-1', 'STEAM', false),
    ).rejects.toMatchObject({ code: 'SYNC_COOLDOWN', statusCode: 429 });
  });

  it('lanza DAILY_SYNC_LIMIT_EXCEEDED para free con 5 syncs ya realizados (INCR devuelve 6)', async () => {
    mockRedis.ttl.mockResolvedValue(-1);
    // INCR devuelve 6 → supera el límite de 5
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

    await syncService.triggerManualSync('user-1', 'STEAM', false);

    expect(mockRedis.expire).toHaveBeenCalledTimes(1);
  });

  it('no llama a expire si el contador ya existía (INCR > 1)', async () => {
    mockRedis.ttl.mockResolvedValue(-1);
    mockRedis.incr.mockResolvedValue(3);
    mockRedis.set.mockResolvedValue('OK');
    (mockPrisma.platformAccount.findUnique as jest.Mock).mockResolvedValue(account);

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

describe('AppError details', () => {
  it('incluye remainingSeconds en SYNC_COOLDOWN', async () => {
    mockRedis.ttl.mockResolvedValue(60);

    try {
      await syncService.triggerManualSync('user-1', 'STEAM', false);
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).details).toEqual({ remainingSeconds: 60 });
    }
  });
});
