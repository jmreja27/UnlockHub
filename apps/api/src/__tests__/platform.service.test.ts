import * as platformService from '../services/platform.service';
import { AppError } from '../middleware/errorHandler';

// Mock de Prisma
jest.mock('../lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    platformAccount: {
      findFirst: jest.fn(),
      upsert: jest.fn(),
      delete: jest.fn(),
      findMany: jest.fn(),
    },
    userAchievement: {
      findMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    $transaction: jest.fn(),
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
  upsertUserScore: jest.fn().mockResolvedValue(undefined),
}));

// Mock de user.service — solo la función exportada que usa platform.service
jest.mock('../services/user.service', () => ({
  calculateLevel: jest.fn((xp: number) => Math.min(Math.floor(xp / 1000) + 1, 100)),
}));

import { prisma } from '../lib/prisma';
import { encrypt } from '../lib/crypto';
import { scheduleAutoSync, cancelAutoSync } from '../jobs/sync.scheduler';
import { removeUserFromRankings, upsertUserScore } from '../services/ranking.service';

const mockPrisma = prisma as jest.Mocked<typeof prisma>;
const mockEncrypt = encrypt as jest.Mock;
const mockScheduleAutoSync = scheduleAutoSync as jest.Mock;
const mockCancelAutoSync = cancelAutoSync as jest.Mock;
const mockRemoveUserFromRankings = removeUserFromRankings as jest.Mock;
const mockUpsertUserScore = upsertUserScore as jest.Mock;

// Usuario base para los tests
const baseUser = {
  id: 'user-1',
  isPremium: false,
  xp: 0,
  countryCode: null,
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
    (mockPrisma.platformAccount.findMany as jest.Mock).mockResolvedValue([{ platform: 'STEAM' }]);

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
    (mockPrisma.platformAccount.findMany as jest.Mock).mockResolvedValue([{ platform: 'STEAM' }]);

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
    (mockPrisma.platformAccount.findMany as jest.Mock).mockResolvedValue([{ platform: 'STEAM' }]);

    await platformService.linkPlatform(
      'user-1',
      'STEAM',
      '76561198000000000',
      'steamuser',
      'api-key',
    );

    expect(mockScheduleAutoSync).toHaveBeenCalledWith('user-1', 'acc-1', 'STEAM', true);
  });

  it('llama a upsertUserScore con todas las plataformas vinculadas tras vincular', async () => {
    const userWithXp = { ...baseUser, xp: 500, countryCode: 'ES' };
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(userWithXp);
    (mockPrisma.platformAccount.findFirst as jest.Mock).mockResolvedValue(null);
    (mockPrisma.platformAccount.upsert as jest.Mock).mockResolvedValue(basePlatformAccount);
    // Simula que el usuario ya tiene PSN vinculada y acaba de vincular Steam
    (mockPrisma.platformAccount.findMany as jest.Mock).mockResolvedValue([
      { platform: 'STEAM' },
      { platform: 'PSN' },
    ]);

    await platformService.linkPlatform(
      'user-1',
      'STEAM',
      '76561198000000000',
      'steamuser',
      'api-key',
    );

    expect(mockUpsertUserScore).toHaveBeenCalledWith(
      'user-1',
      500,
      expect.arrayContaining(['STEAM', 'PSN']),
    );
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
    (mockPrisma.platformAccount.findMany as jest.Mock).mockResolvedValue([{ platform: 'STEAM' }]);

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
    (mockPrisma.platformAccount.findMany as jest.Mock).mockResolvedValue([{ platform: 'STEAM' }]);

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

// Helper: configura $transaction para ejecutar el callback con un tx que delega en mockPrisma
function setupTransactionMock() {
  (mockPrisma.$transaction as jest.Mock).mockImplementation(
    async (callback: (tx: typeof mockPrisma) => Promise<unknown>) => callback(mockPrisma),
  );
}

describe('platformService.unlinkPlatform', () => {
  const baseUserWithXp = { xp: 500, countryCode: 'ES' };
  const steamAchievements = [
    { achievement: { normalizedPoints: 100 } },
    { achievement: { normalizedPoints: 50 } },
  ];

  beforeEach(() => {
    setupTransactionMock();
    (mockPrisma.platformAccount.findMany as jest.Mock).mockResolvedValue([]);
  });

  it('borra los UserAchievements de la plataforma en la transacción', async () => {
    (mockPrisma.platformAccount.findFirst as jest.Mock).mockResolvedValue(basePlatformAccount);
    (mockPrisma.userAchievement.findMany as jest.Mock).mockResolvedValue(steamAchievements);
    (mockPrisma.userAchievement.deleteMany as jest.Mock).mockResolvedValue({ count: 2 });
    (mockPrisma.platformAccount.delete as jest.Mock).mockResolvedValue(basePlatformAccount);
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(baseUserWithXp);
    (mockPrisma.user.update as jest.Mock).mockResolvedValue({});

    await platformService.unlinkPlatform('user-1', 'STEAM');

    expect(mockPrisma.userAchievement.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', achievement: { platform: 'STEAM' } },
    });
  });

  it('devuelve el conteo de logros borrados', async () => {
    (mockPrisma.platformAccount.findFirst as jest.Mock).mockResolvedValue(basePlatformAccount);
    (mockPrisma.userAchievement.findMany as jest.Mock).mockResolvedValue(steamAchievements);
    (mockPrisma.userAchievement.deleteMany as jest.Mock).mockResolvedValue({ count: 2 });
    (mockPrisma.platformAccount.delete as jest.Mock).mockResolvedValue(basePlatformAccount);
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(baseUserWithXp);
    (mockPrisma.user.update as jest.Mock).mockResolvedValue({});

    const result = await platformService.unlinkPlatform('user-1', 'STEAM');

    expect(result.deletedAchievements).toBe(2);
  });

  it('descuenta el XP de los logros borrados y actualiza el nivel', async () => {
    (mockPrisma.platformAccount.findFirst as jest.Mock).mockResolvedValue(basePlatformAccount);
    // 150 XP de logros Steam (100 + 50)
    (mockPrisma.userAchievement.findMany as jest.Mock).mockResolvedValue(steamAchievements);
    (mockPrisma.userAchievement.deleteMany as jest.Mock).mockResolvedValue({ count: 2 });
    (mockPrisma.platformAccount.delete as jest.Mock).mockResolvedValue(basePlatformAccount);
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({ xp: 500, countryCode: 'ES' });
    (mockPrisma.user.update as jest.Mock).mockResolvedValue({});

    await platformService.unlinkPlatform('user-1', 'STEAM');

    // 500 - 150 = 350 XP → nivel 1
    expect(mockPrisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'user-1' },
        data: { xp: 350, level: 1 },
      }),
    );
  });

  it('no deja XP negativo si los logros superan el XP actual', async () => {
    (mockPrisma.platformAccount.findFirst as jest.Mock).mockResolvedValue(basePlatformAccount);
    (mockPrisma.userAchievement.findMany as jest.Mock).mockResolvedValue([
      { achievement: { normalizedPoints: 1000 } },
    ]);
    (mockPrisma.userAchievement.deleteMany as jest.Mock).mockResolvedValue({ count: 1 });
    (mockPrisma.platformAccount.delete as jest.Mock).mockResolvedValue(basePlatformAccount);
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({ xp: 100, countryCode: 'ES' });
    (mockPrisma.user.update as jest.Mock).mockResolvedValue({});

    await platformService.unlinkPlatform('user-1', 'STEAM');

    // Math.max(0, 100 - 1000) = 0
    expect(mockPrisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { xp: 0, level: 1 } }),
    );
  });

  it('no falla si el usuario no tiene logros en esa plataforma', async () => {
    (mockPrisma.platformAccount.findFirst as jest.Mock).mockResolvedValue(basePlatformAccount);
    (mockPrisma.userAchievement.findMany as jest.Mock).mockResolvedValue([]);
    (mockPrisma.userAchievement.deleteMany as jest.Mock).mockResolvedValue({ count: 0 });
    (mockPrisma.platformAccount.delete as jest.Mock).mockResolvedValue(basePlatformAccount);
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(baseUserWithXp);
    (mockPrisma.user.update as jest.Mock).mockResolvedValue({});

    const result = await platformService.unlinkPlatform('user-1', 'STEAM');

    expect(result.deletedAchievements).toBe(0);
    // Sin logros que restar, XP queda igual
    expect(mockPrisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { xp: 500, level: 1 } }),
    );
  });

  it('cancela el auto-sync y elimina al usuario del ranking de la plataforma', async () => {
    (mockPrisma.platformAccount.findFirst as jest.Mock).mockResolvedValue(basePlatformAccount);
    (mockPrisma.userAchievement.findMany as jest.Mock).mockResolvedValue([]);
    (mockPrisma.userAchievement.deleteMany as jest.Mock).mockResolvedValue({ count: 0 });
    (mockPrisma.platformAccount.delete as jest.Mock).mockResolvedValue(basePlatformAccount);
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(baseUserWithXp);
    (mockPrisma.user.update as jest.Mock).mockResolvedValue({});

    await platformService.unlinkPlatform('user-1', 'STEAM');

    expect(mockCancelAutoSync).toHaveBeenCalledWith('user-1', 'STEAM');
    expect(mockRemoveUserFromRankings).toHaveBeenCalledWith('user-1', ['STEAM']);
  });

  it('actualiza el ranking global con el XP restante tras desvincular', async () => {
    (mockPrisma.platformAccount.findFirst as jest.Mock).mockResolvedValue(basePlatformAccount);
    (mockPrisma.userAchievement.findMany as jest.Mock).mockResolvedValue(steamAchievements);
    (mockPrisma.userAchievement.deleteMany as jest.Mock).mockResolvedValue({ count: 2 });
    (mockPrisma.platformAccount.delete as jest.Mock).mockResolvedValue(basePlatformAccount);
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(baseUserWithXp);
    (mockPrisma.user.update as jest.Mock).mockResolvedValue({});
    // Plataformas restantes tras desvincular Steam
    (mockPrisma.platformAccount.findMany as jest.Mock).mockResolvedValue([
      { platform: 'RA' },
    ]);

    await platformService.unlinkPlatform('user-1', 'STEAM');

    expect(mockUpsertUserScore).toHaveBeenCalledWith('user-1', 350, ['RA']);
  });

  it('lanza PLATFORM_NOT_LINKED si la plataforma no está vinculada', async () => {
    (mockPrisma.platformAccount.findFirst as jest.Mock).mockResolvedValue(null);

    await expect(platformService.unlinkPlatform('user-1', 'STEAM')).rejects.toMatchObject({
      code: 'PLATFORM_NOT_LINKED',
      statusCode: 404,
    });
  });

  it('es instancia de AppError cuando la plataforma no está vinculada', async () => {
    (mockPrisma.platformAccount.findFirst as jest.Mock).mockResolvedValue(null);

    await expect(platformService.unlinkPlatform('user-1', 'RA')).rejects.toBeInstanceOf(AppError);
  });

  it('la transacción es atómica: si $transaction lanza, PlatformAccount no se borra fuera', async () => {
    (mockPrisma.platformAccount.findFirst as jest.Mock).mockResolvedValue(basePlatformAccount);
    (mockPrisma.$transaction as jest.Mock).mockRejectedValue(new Error('db error'));

    await expect(platformService.unlinkPlatform('user-1', 'STEAM')).rejects.toThrow('db error');
    // La operación exterior (cancelAutoSync) no debe haberse llamado
    expect(mockCancelAutoSync).not.toHaveBeenCalled();
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
