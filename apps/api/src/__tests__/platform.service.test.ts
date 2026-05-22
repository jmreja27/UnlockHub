import * as platformService from '../services/platform.service';
import { AppError } from '../middleware/errorHandler';

// Mock de Prisma
jest.mock('../lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
    },
    platformAccount: {
      findFirst: jest.fn(),
      upsert: jest.fn(),
      delete: jest.fn(),
      findMany: jest.fn(),
    },
  },
}));

// Mock del módulo de cifrado — verificamos que se llama con el token en texto plano
jest.mock('../lib/crypto', () => ({
  encrypt: jest.fn((str: string) => `encrypted:${str}`),
  decrypt: jest.fn((str: string) => str.replace('encrypted:', '')),
}));

// Mock del scheduler de syncs
jest.mock('../jobs/sync.scheduler', () => ({
  scheduleAutoSync: jest.fn().mockResolvedValue(undefined),
  cancelAutoSync: jest.fn().mockResolvedValue(undefined),
}));

// Mock del ranking service para evitar llamadas a Redis
jest.mock('../services/ranking.service', () => ({
  removeUserFromRankings: jest.fn().mockResolvedValue(undefined),
}));

import { prisma } from '../lib/prisma';
import { encrypt } from '../lib/crypto';
import { scheduleAutoSync, cancelAutoSync } from '../jobs/sync.scheduler';
import { removeUserFromRankings } from '../services/ranking.service';

const mockPrisma = prisma as jest.Mocked<typeof prisma>;
const mockEncrypt = encrypt as jest.Mock;
const mockScheduleAutoSync = scheduleAutoSync as jest.Mock;
const mockCancelAutoSync = cancelAutoSync as jest.Mock;
const mockRemoveUserFromRankings = removeUserFromRankings as jest.Mock;

// Usuario base para los tests
const baseUser = {
  id: 'user-1',
  isPremium: false,
};

// Cuenta de plataforma base para los tests
const basePlatformAccount = {
  id: 'acc-1',
  userId: 'user-1',
  platform: 'STEAM' as const,
  externalId: '76561198000000000',
  username: 'steamuser',
  lastSyncedAt: null,
};

beforeEach(() => {
  jest.clearAllMocks();
});

// ─── linkPlatform ─────────────────────────────────────────────────────────────

describe('platformService.linkPlatform', () => {
  it('vincula una plataforma y cifra el token antes de persistir', async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(baseUser);
    (mockPrisma.platformAccount.findFirst as jest.Mock).mockResolvedValue(null);
    (mockPrisma.platformAccount.upsert as jest.Mock).mockResolvedValue(basePlatformAccount);

    const account = await platformService.linkPlatform(
      'user-1',
      'STEAM',
      '76561198000000000',
      'steamuser',
      'mi-api-key-secreta',
    );

    // Verificar que se cifró el token antes de persistir
    expect(mockEncrypt).toHaveBeenCalledWith('mi-api-key-secreta');

    // Verificar que el upsert contiene el token cifrado, no el original
    expect(mockPrisma.platformAccount.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          encryptedToken: 'encrypted:mi-api-key-secreta',
        }),
        update: expect.objectContaining({
          encryptedToken: 'encrypted:mi-api-key-secreta',
        }),
      }),
    );

    expect(account.platform).toBe('STEAM');
    expect(account.externalId).toBe('76561198000000000');
  });

  it('programa el auto-sync tras vincular la plataforma', async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(baseUser);
    (mockPrisma.platformAccount.findFirst as jest.Mock).mockResolvedValue(null);
    (mockPrisma.platformAccount.upsert as jest.Mock).mockResolvedValue(basePlatformAccount);

    await platformService.linkPlatform(
      'user-1',
      'STEAM',
      '76561198000000000',
      'steamuser',
      'api-key',
    );

    expect(mockScheduleAutoSync).toHaveBeenCalledWith('user-1', 'acc-1', 'STEAM', false);
  });

  it('usa el tier premium si el usuario es premium', async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({ ...baseUser, isPremium: true });
    (mockPrisma.platformAccount.findFirst as jest.Mock).mockResolvedValue(null);
    (mockPrisma.platformAccount.upsert as jest.Mock).mockResolvedValue(basePlatformAccount);

    await platformService.linkPlatform(
      'user-1',
      'STEAM',
      '76561198000000000',
      'steamuser',
      'api-key',
    );

    expect(mockScheduleAutoSync).toHaveBeenCalledWith('user-1', 'acc-1', 'STEAM', true);
  });

  it('lanza USER_NOT_FOUND si el usuario no existe', async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(null);

    await expect(
      platformService.linkPlatform('noexiste', 'STEAM', 'extId', 'user', 'key'),
    ).rejects.toMatchObject({
      code: 'USER_NOT_FOUND',
      statusCode: 404,
    });
  });

  it('lanza PLATFORM_ACCOUNT_ALREADY_LINKED si otro usuario ya tiene esa cuenta', async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(baseUser);
    // Simula que otro usuario ya tiene esta cuenta vinculada
    (mockPrisma.platformAccount.findFirst as jest.Mock).mockResolvedValue({
      ...basePlatformAccount,
      userId: 'otro-usuario',
    });

    await expect(
      platformService.linkPlatform(
        'user-1',
        'STEAM',
        '76561198000000000',
        'steamuser',
        'api-key',
      ),
    ).rejects.toMatchObject({
      code: 'PLATFORM_ACCOUNT_ALREADY_LINKED',
      statusCode: 409,
    });
  });

  it('permite al mismo usuario re-vincular su propia cuenta (upsert)', async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(baseUser);
    // findFirst devuelve null → no hay otra cuenta con el mismo externalId en otro usuario
    (mockPrisma.platformAccount.findFirst as jest.Mock).mockResolvedValue(null);
    (mockPrisma.platformAccount.upsert as jest.Mock).mockResolvedValue(basePlatformAccount);

    const account = await platformService.linkPlatform(
      'user-1',
      'STEAM',
      '76561198000000000',
      'steamuser',
      'api-key',
    );

    expect(account.platform).toBe('STEAM');
    expect(mockPrisma.platformAccount.upsert).toHaveBeenCalledTimes(1);
  });

  it('no expone el token en texto plano en el resultado', async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(baseUser);
    (mockPrisma.platformAccount.findFirst as jest.Mock).mockResolvedValue(null);
    (mockPrisma.platformAccount.upsert as jest.Mock).mockResolvedValue(basePlatformAccount);

    const account = await platformService.linkPlatform(
      'user-1',
      'STEAM',
      '76561198000000000',
      'steamuser',
      'mi-api-key-secreta',
    );

    // El resultado no debe incluir el token ni cifrado ni en texto plano
    expect((account as unknown as Record<string, unknown>)['encryptedToken']).toBeUndefined();
    expect((account as unknown as Record<string, unknown>)['rawToken']).toBeUndefined();
  });
});

// ─── unlinkPlatform ───────────────────────────────────────────────────────────

describe('platformService.unlinkPlatform', () => {
  it('desvincula la plataforma y cancela el auto-sync', async () => {
    (mockPrisma.platformAccount.findFirst as jest.Mock).mockResolvedValue(basePlatformAccount);
    (mockPrisma.platformAccount.delete as jest.Mock).mockResolvedValue(basePlatformAccount);
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({
      xp: 500,
      countryCode: 'ES',
    });

    await platformService.unlinkPlatform('user-1', 'STEAM');

    expect(mockPrisma.platformAccount.delete).toHaveBeenCalledWith({
      where: { id: 'acc-1' },
    });
    expect(mockCancelAutoSync).toHaveBeenCalledWith('user-1', 'STEAM');
  });

  it('elimina al usuario del ranking de la plataforma en Redis', async () => {
    (mockPrisma.platformAccount.findFirst as jest.Mock).mockResolvedValue(basePlatformAccount);
    (mockPrisma.platformAccount.delete as jest.Mock).mockResolvedValue(basePlatformAccount);
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({
      xp: 500,
      countryCode: 'ES',
    });

    await platformService.unlinkPlatform('user-1', 'STEAM');

    expect(mockRemoveUserFromRankings).toHaveBeenCalledWith('user-1', 'ES', ['STEAM']);
  });

  it('lanza PLATFORM_NOT_LINKED si la plataforma no está vinculada', async () => {
    (mockPrisma.platformAccount.findFirst as jest.Mock).mockResolvedValue(null);

    await expect(platformService.unlinkPlatform('user-1', 'STEAM')).rejects.toMatchObject({
      code: 'PLATFORM_NOT_LINKED',
      statusCode: 404,
    });
  });

  it('es instancia de AppError', async () => {
    (mockPrisma.platformAccount.findFirst as jest.Mock).mockResolvedValue(null);

    try {
      await platformService.unlinkPlatform('user-1', 'RA');
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
    }
  });
});

// ─── getLinkedPlatforms ───────────────────────────────────────────────────────

describe('platformService.getLinkedPlatforms', () => {
  it('devuelve la lista de plataformas vinculadas sin tokens cifrados', async () => {
    (mockPrisma.platformAccount.findMany as jest.Mock).mockResolvedValue([
      basePlatformAccount,
      { ...basePlatformAccount, id: 'acc-2', platform: 'RA', externalId: 'rauser' },
    ]);

    const platforms = await platformService.getLinkedPlatforms('user-1');

    expect(platforms).toHaveLength(2);
    expect(platforms[0]?.platform).toBe('STEAM');
    expect(platforms[1]?.platform).toBe('RA');
    // Verificar que no se expone el token cifrado
    platforms.forEach((p) => {
      expect((p as unknown as Record<string, unknown>)['encryptedToken']).toBeUndefined();
    });
  });

  it('devuelve lista vacía si el usuario no tiene plataformas vinculadas', async () => {
    (mockPrisma.platformAccount.findMany as jest.Mock).mockResolvedValue([]);

    const platforms = await platformService.getLinkedPlatforms('user-1');

    expect(platforms).toHaveLength(0);
  });
});
