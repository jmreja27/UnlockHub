import * as syncService from '../services/sync.service';
import { AppError } from '../middleware/errorHandler';

jest.mock('../lib/redis', () => ({
  redis: {
    ttl: jest.fn(),
    get: jest.fn(),
    set: jest.fn(),
  },
}));

jest.mock('../lib/prisma', () => ({ prisma: { platformAccount: { findUnique: jest.fn(), update: jest.fn() }, user: { update: jest.fn() } } }));

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
    mockRedis.get.mockResolvedValue(null);
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

  it('lanza DAILY_SYNC_LIMIT_EXCEEDED para free con 5 syncs ya realizados', async () => {
    mockRedis.ttl.mockResolvedValue(-1);
    mockRedis.get.mockResolvedValue('5');

    await expect(
      syncService.triggerManualSync('user-1', 'STEAM', false),
    ).rejects.toMatchObject({ code: 'DAILY_SYNC_LIMIT_EXCEEDED', statusCode: 429 });
  });

  it('premium no tiene límite diario', async () => {
    mockRedis.ttl.mockResolvedValue(-1);
    mockRedis.get.mockResolvedValue(null);
    mockRedis.set.mockResolvedValue('OK');
    (mockPrisma.platformAccount.findUnique as jest.Mock).mockResolvedValue(account);

    const result = await syncService.triggerManualSync('user-1', 'STEAM', true);

    expect(result.jobId).toBe('job-1');
    // No se llama a get con la clave de dailyCount para premium
    expect(mockRedis.get).not.toHaveBeenCalled();
  });

  it('lanza PLATFORM_NOT_LINKED si no hay cuenta vinculada', async () => {
    mockRedis.ttl.mockResolvedValue(-1);
    mockRedis.get.mockResolvedValue(null);
    (mockPrisma.platformAccount.findUnique as jest.Mock).mockResolvedValue(null);

    await expect(
      syncService.triggerManualSync('user-1', 'STEAM', false),
    ).rejects.toMatchObject({ code: 'PLATFORM_NOT_LINKED', statusCode: 404 });
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
