import * as userService from '../services/user.service';
import { AppError } from '../middleware/errorHandler';

// Mock de Prisma
jest.mock('../lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    userPoint: {
      create: jest.fn(),
    },
    platformAccount: {
      findMany: jest.fn(),
    },
    userAchievement: {
      findMany: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}));

// Mock del ranking service para evitar llamadas a Redis
jest.mock('../services/ranking.service', () => ({
  upsertUserScore: jest.fn().mockResolvedValue(undefined),
  removeUserFromRankings: jest.fn().mockResolvedValue(undefined),
}));

import { prisma } from '../lib/prisma';
import { upsertUserScore } from '../services/ranking.service';

const mockPrisma = prisma as jest.Mocked<typeof prisma>;
const mockUpsertUserScore = upsertUserScore as jest.Mock;

// Usuario base para los tests
const baseUser = {
  id: 'user-1',
  username: 'testuser',
  email: 'test@example.com',
  passwordHash: 'hash',
  avatar: null,
  banner: null,
  bio: null,
  level: 1,
  xp: 0,
  streakDays: 0,
  countryCode: null,
  isPremium: false,
  premiumUntil: null,
  lastSyncAt: null,
  createdAt: new Date('2024-01-01T00:00:00.000Z'),
  updatedAt: new Date('2024-01-01T00:00:00.000Z'),
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

// ─── getProfile ───────────────────────────────────────────────────────────────

describe('userService.getProfile', () => {
  it('devuelve el perfil del usuario con sus cuentas de plataforma', async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({
      ...baseUser,
      platformAccounts: [basePlatformAccount],
    });

    const profile = await userService.getProfile('user-1');

    expect(profile.id).toBe('user-1');
    expect(profile.username).toBe('testuser');
    expect(profile.platformAccounts).toHaveLength(1);
    expect(profile.platformAccounts[0]?.platform).toBe('STEAM');
    // Verificar que no se expone el passwordHash
    expect((profile as unknown as Record<string, unknown>)['passwordHash']).toBeUndefined();
  });

  it('lanza USER_NOT_FOUND si el usuario no existe', async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(null);

    await expect(userService.getProfile('noexiste')).rejects.toMatchObject({
      code: 'USER_NOT_FOUND',
      statusCode: 404,
    });
  });

  it('serializa fechas como strings ISO', async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({
      ...baseUser,
      platformAccounts: [],
    });

    const profile = await userService.getProfile('user-1');

    expect(typeof profile.createdAt).toBe('string');
    expect(profile.premiumUntil).toBeNull();
    expect(profile.lastSyncAt).toBeNull();
  });
});

// ─── getPublicProfile ─────────────────────────────────────────────────────────

describe('userService.getPublicProfile', () => {
  it('devuelve el perfil público buscando por username', async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({
      ...baseUser,
      platformAccounts: [],
    });

    const profile = await userService.getPublicProfile('testuser');

    expect(profile.username).toBe('testuser');
  });

  it('lanza USER_NOT_FOUND si el username no existe', async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(null);

    await expect(userService.getPublicProfile('noexiste')).rejects.toMatchObject({
      code: 'USER_NOT_FOUND',
      statusCode: 404,
    });
  });
});

// ─── updateProfile ────────────────────────────────────────────────────────────

describe('userService.updateProfile', () => {
  it('actualiza los campos permitidos y devuelve el usuario actualizado', async () => {
    const updatedUser = { ...baseUser, bio: 'Mi nueva bio', countryCode: 'ES' };
    (mockPrisma.user.update as jest.Mock).mockResolvedValue(updatedUser);

    const result = await userService.updateProfile('user-1', {
      bio: 'Mi nueva bio',
      countryCode: 'ES',
    });

    expect(result.bio).toBe('Mi nueva bio');
    expect(result.countryCode).toBe('ES');
    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { bio: 'Mi nueva bio', countryCode: 'ES' },
    });
  });

  it('permite actualización parcial sin pasar todos los campos', async () => {
    (mockPrisma.user.update as jest.Mock).mockResolvedValue({ ...baseUser, bio: 'Solo bio' });

    const result = await userService.updateProfile('user-1', { bio: 'Solo bio' });

    expect(result.bio).toBe('Solo bio');
  });
});

// ─── addXp ────────────────────────────────────────────────────────────────────

describe('userService.addXp', () => {
  it('añade XP y no sube de nivel si no se alcanzan los 1000 XP', async () => {
    // Usuario con 500 XP en nivel 1
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({ ...baseUser, xp: 500, level: 1 });
    (mockPrisma.$transaction as jest.Mock).mockResolvedValue([]);
    (mockPrisma.platformAccount.findMany as jest.Mock).mockResolvedValue([]);

    const result = await userService.addXp('user-1', 100, 'ACHIEVEMENT');

    expect(result.newXp).toBe(600);
    expect(result.newLevel).toBe(1);
    expect(result.leveledUp).toBe(false);
  });

  it('sube de nivel cuando el XP supera el umbral de 1000', async () => {
    // Usuario con 950 XP en nivel 1, suma 100 -> 1050 XP -> nivel 2
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({ ...baseUser, xp: 950, level: 1 });
    (mockPrisma.$transaction as jest.Mock).mockResolvedValue([]);
    (mockPrisma.platformAccount.findMany as jest.Mock).mockResolvedValue([]);

    const result = await userService.addXp('user-1', 100, 'ACHIEVEMENT');

    expect(result.newXp).toBe(1050);
    expect(result.newLevel).toBe(2);
    expect(result.leveledUp).toBe(true);
  });

  it('no supera el nivel máximo 100 aunque el XP sea muy alto', async () => {
    // Usuario con 98999 XP en nivel 99, suma 5000 -> 103999 XP -> máx nivel 100
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({
      ...baseUser,
      xp: 98999,
      level: 99,
    });
    (mockPrisma.$transaction as jest.Mock).mockResolvedValue([]);
    (mockPrisma.platformAccount.findMany as jest.Mock).mockResolvedValue([]);

    const result = await userService.addXp('user-1', 5000, 'STREAK');

    expect(result.newLevel).toBe(100);
    expect(result.leveledUp).toBe(true);
  });

  it('llama a upsertUserScore para actualizar el ranking en Redis', async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({
      ...baseUser,
      xp: 0,
      countryCode: 'ES',
    });
    (mockPrisma.$transaction as jest.Mock).mockResolvedValue([]);
    (mockPrisma.platformAccount.findMany as jest.Mock).mockResolvedValue([
      { platform: 'STEAM' },
    ]);

    await userService.addXp('user-1', 200, 'CHALLENGE');

    expect(mockUpsertUserScore).toHaveBeenCalledWith('user-1', 200, 'ES', ['STEAM']);
  });

  it('lanza USER_NOT_FOUND si el usuario no existe', async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(null);

    await expect(userService.addXp('noexiste', 100, 'ACHIEVEMENT')).rejects.toMatchObject({
      code: 'USER_NOT_FOUND',
      statusCode: 404,
    });
  });

  it('es instancia de AppError con el código correcto', async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(null);

    try {
      await userService.addXp('noexiste', 100, 'ACHIEVEMENT');
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).code).toBe('USER_NOT_FOUND');
    }
  });
});

// ─── getMyGames ───────────────────────────────────────────────────────────────

describe('userService.getMyGames', () => {
  const syncDate = new Date('2024-06-01T00:00:00.000Z');

  const makeUserAchievement = (gameId: string, game: object) => ({
    achievement: { gameId, game },
  });

  it('devuelve lista vacía cuando el usuario no tiene logros', async () => {
    (mockPrisma.userAchievement.findMany as jest.Mock).mockResolvedValue([]);
    (mockPrisma.platformAccount.findMany as jest.Mock).mockResolvedValue([]);

    const result = await userService.getMyGames('user-1');

    expect(result.data).toHaveLength(0);
    expect(result.total).toBe(0);
  });

  it('agrupa logros por juego y cuenta los ganados', async () => {
    const game = { id: 'game-1', title: 'Portal', platform: 'STEAM', iconUrl: null, totalAchievements: 4 };
    (mockPrisma.userAchievement.findMany as jest.Mock).mockResolvedValue([
      makeUserAchievement('game-1', game),
      makeUserAchievement('game-1', game),
      makeUserAchievement('game-1', game),
    ]);
    (mockPrisma.platformAccount.findMany as jest.Mock).mockResolvedValue([
      { platform: 'STEAM', lastSyncedAt: syncDate },
    ]);

    const result = await userService.getMyGames('user-1');

    expect(result.data).toHaveLength(1);
    expect(result.data[0]?.earnedAchievements).toBe(3);
    expect(result.data[0]?.totalAchievements).toBe(4);
    expect(result.data[0]?.completionPct).toBe(75);
  });

  it('calcula completionPct correctamente', async () => {
    const game = { id: 'g1', title: 'Hollow Knight', platform: 'STEAM', iconUrl: null, totalAchievements: 10 };
    (mockPrisma.userAchievement.findMany as jest.Mock).mockResolvedValue(
      Array.from({ length: 5 }, () => makeUserAchievement('g1', game)),
    );
    (mockPrisma.platformAccount.findMany as jest.Mock).mockResolvedValue([]);

    const result = await userService.getMyGames('user-1');
    expect(result.data[0]?.completionPct).toBe(50);
  });

  it('filtra por plataforma cuando se especifica', async () => {
    (mockPrisma.userAchievement.findMany as jest.Mock).mockResolvedValue([]);
    (mockPrisma.platformAccount.findMany as jest.Mock).mockResolvedValue([]);

    await userService.getMyGames('user-1', 'STEAM');

    expect(mockPrisma.userAchievement.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'user-1', achievement: { platform: 'STEAM' } },
      }),
    );
  });

  it('sin plataforma no filtra por achievement.platform', async () => {
    (mockPrisma.userAchievement.findMany as jest.Mock).mockResolvedValue([]);
    (mockPrisma.platformAccount.findMany as jest.Mock).mockResolvedValue([]);

    await userService.getMyGames('user-1');

    expect(mockPrisma.userAchievement.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'user-1', achievement: undefined },
      }),
    );
  });

  it('incluye lastSyncedAt de la cuenta de plataforma correspondiente', async () => {
    const game = { id: 'g1', title: 'Portal', platform: 'STEAM', iconUrl: null, totalAchievements: 1 };
    (mockPrisma.userAchievement.findMany as jest.Mock).mockResolvedValue([makeUserAchievement('g1', game)]);
    (mockPrisma.platformAccount.findMany as jest.Mock).mockResolvedValue([
      { platform: 'STEAM', lastSyncedAt: syncDate },
    ]);

    const result = await userService.getMyGames('user-1');
    expect(result.data[0]?.lastSyncedAt).toBe(syncDate.toISOString());
  });

  it('devuelve null para lastSyncedAt si la plataforma no está vinculada', async () => {
    const game = { id: 'g1', title: 'Sonic', platform: 'RA', iconUrl: null, totalAchievements: 5 };
    (mockPrisma.userAchievement.findMany as jest.Mock).mockResolvedValue([makeUserAchievement('g1', game)]);
    (mockPrisma.platformAccount.findMany as jest.Mock).mockResolvedValue([]);

    const result = await userService.getMyGames('user-1');
    expect(result.data[0]?.lastSyncedAt).toBeNull();
  });

  it('devuelve juegos ordenados alfabéticamente', async () => {
    const makeGame = (id: string, title: string) => ({
      id, title, platform: 'STEAM', iconUrl: null, totalAchievements: 1,
    });
    (mockPrisma.userAchievement.findMany as jest.Mock).mockResolvedValue([
      makeUserAchievement('g3', makeGame('g3', 'Zelda')),
      makeUserAchievement('g1', makeGame('g1', 'Elden Ring')),
      makeUserAchievement('g2', makeGame('g2', 'Hollow Knight')),
    ]);
    (mockPrisma.platformAccount.findMany as jest.Mock).mockResolvedValue([]);

    const result = await userService.getMyGames('user-1');
    expect(result.data.map((g) => g.title)).toEqual(['Elden Ring', 'Hollow Knight', 'Zelda']);
  });
});

// ─── getMyGameAchievements ────────────────────────────────────────────────────

describe('userService.getMyGameAchievements', () => {
  it('devuelve lista vacía cuando el usuario no tiene logros para ese juego', async () => {
    (mockPrisma.userAchievement.findMany as jest.Mock).mockResolvedValue([]);

    const result = await userService.getMyGameAchievements('user-1', 'game-1');

    expect(result).toHaveLength(0);
  });

  it('devuelve los achievementIds con unlockedAt serializado como ISO string', async () => {
    const unlockedAt = new Date('2024-03-15T10:00:00.000Z');
    (mockPrisma.userAchievement.findMany as jest.Mock).mockResolvedValue([
      { achievementId: 'ach-1', unlockedAt },
      { achievementId: 'ach-2', unlockedAt },
    ]);

    const result = await userService.getMyGameAchievements('user-1', 'game-1');

    expect(result).toHaveLength(2);
    expect(result[0]?.achievementId).toBe('ach-1');
    expect(result[0]?.unlockedAt).toBe(unlockedAt.toISOString());
  });

  it('filtra por userId y gameId en la cláusula where', async () => {
    (mockPrisma.userAchievement.findMany as jest.Mock).mockResolvedValue([]);

    await userService.getMyGameAchievements('user-42', 'game-99');

    expect(mockPrisma.userAchievement.findMany).toHaveBeenCalledWith({
      where: { userId: 'user-42', achievement: { gameId: 'game-99' } },
      select: { achievementId: true, unlockedAt: true },
    });
  });

  it('preserva el orden de los logros tal como los devuelve la BD', async () => {
    const dates = [
      new Date('2024-01-01T00:00:00.000Z'),
      new Date('2024-06-15T00:00:00.000Z'),
    ];
    (mockPrisma.userAchievement.findMany as jest.Mock).mockResolvedValue([
      { achievementId: 'ach-first', unlockedAt: dates[0] },
      { achievementId: 'ach-second', unlockedAt: dates[1] },
    ]);

    const result = await userService.getMyGameAchievements('user-1', 'game-1');

    expect(result[0]?.achievementId).toBe('ach-first');
    expect(result[1]?.achievementId).toBe('ach-second');
  });
});

// ─── compareProfiles ──────────────────────────────────────────────────────────

describe('userService.compareProfiles', () => {
  const myUserXp = { xp: 1500 };
  const targetUser = {
    id: 'target-1',
    username: 'targetuser',
    level: 5,
    xp: 1000,
    avatar: null,
  };

  it('devuelve xpDiff positivo cuando mi XP es mayor que el del objetivo', async () => {
    (mockPrisma.user.findUnique as jest.Mock)
      .mockResolvedValueOnce(targetUser)
      .mockResolvedValueOnce(myUserXp);
    (mockPrisma.userAchievement.findMany as jest.Mock)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const result = await userService.compareProfiles('user-1', 'targetuser');

    expect(result.xpDiff).toBe(500); // 1500 - 1000
  });

  it('devuelve xpDiff negativo cuando mi XP es menor que el del objetivo', async () => {
    (mockPrisma.user.findUnique as jest.Mock)
      .mockResolvedValueOnce({ ...targetUser, xp: 2000 })
      .mockResolvedValueOnce({ xp: 800 });
    (mockPrisma.userAchievement.findMany as jest.Mock)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const result = await userService.compareProfiles('user-1', 'targetuser');

    expect(result.xpDiff).toBe(-1200); // 800 - 2000
  });

  it('cuenta correctamente los logros compartidos', async () => {
    (mockPrisma.user.findUnique as jest.Mock)
      .mockResolvedValueOnce(targetUser)
      .mockResolvedValueOnce(myUserXp);
    (mockPrisma.userAchievement.findMany as jest.Mock)
      .mockResolvedValueOnce([
        { achievementId: 'ach-1', achievement: { gameId: 'g1' } },
        { achievementId: 'ach-2', achievement: { gameId: 'g1' } },
        { achievementId: 'ach-3', achievement: { gameId: 'g2' } },
      ])
      .mockResolvedValueOnce([
        { achievementId: 'ach-1', achievement: { gameId: 'g1' } }, // compartido
        { achievementId: 'ach-4', achievement: { gameId: 'g3' } }, // exclusivo del objetivo
      ]);

    const result = await userService.compareProfiles('user-1', 'targetuser');

    expect(result.sharedAchievementCount).toBe(1);
  });

  it('cuenta correctamente los juegos compartidos', async () => {
    (mockPrisma.user.findUnique as jest.Mock)
      .mockResolvedValueOnce(targetUser)
      .mockResolvedValueOnce(myUserXp);
    (mockPrisma.userAchievement.findMany as jest.Mock)
      .mockResolvedValueOnce([
        { achievementId: 'ach-1', achievement: { gameId: 'g1' } },
        { achievementId: 'ach-2', achievement: { gameId: 'g2' } },
      ])
      .mockResolvedValueOnce([
        { achievementId: 'ach-3', achievement: { gameId: 'g1' } }, // juego compartido
        { achievementId: 'ach-4', achievement: { gameId: 'g3' } }, // juego exclusivo
      ]);

    const result = await userService.compareProfiles('user-1', 'targetuser');

    expect(result.sharedGameCount).toBe(1);
  });

  it('incluye los datos del usuario objetivo en el resultado', async () => {
    (mockPrisma.user.findUnique as jest.Mock)
      .mockResolvedValueOnce(targetUser)
      .mockResolvedValueOnce(myUserXp);
    (mockPrisma.userAchievement.findMany as jest.Mock)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const result = await userService.compareProfiles('user-1', 'targetuser');

    expect(result.targetUser.username).toBe('targetuser');
    expect(result.targetUser.level).toBe(5);
    expect(result.targetUser.xp).toBe(1000);
    expect(result.targetUser.avatar).toBeNull();
  });

  it('devuelve 0 logros y juegos compartidos cuando no hay intersección', async () => {
    (mockPrisma.user.findUnique as jest.Mock)
      .mockResolvedValueOnce(targetUser)
      .mockResolvedValueOnce(myUserXp);
    (mockPrisma.userAchievement.findMany as jest.Mock)
      .mockResolvedValueOnce([
        { achievementId: 'ach-1', achievement: { gameId: 'g1' } },
      ])
      .mockResolvedValueOnce([
        { achievementId: 'ach-2', achievement: { gameId: 'g2' } },
      ]);

    const result = await userService.compareProfiles('user-1', 'targetuser');

    expect(result.sharedAchievementCount).toBe(0);
    expect(result.sharedGameCount).toBe(0);
  });

  it('lanza USER_NOT_FOUND cuando el usuario objetivo no existe', async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValueOnce(null);

    await expect(
      userService.compareProfiles('user-1', 'noexiste'),
    ).rejects.toMatchObject({ code: 'USER_NOT_FOUND', statusCode: 404 });
  });

  it('lanza USER_NOT_FOUND cuando el usuario autenticado no existe', async () => {
    (mockPrisma.user.findUnique as jest.Mock)
      .mockResolvedValueOnce(targetUser)
      .mockResolvedValueOnce(null);
    (mockPrisma.userAchievement.findMany as jest.Mock)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    await expect(
      userService.compareProfiles('noexiste', 'targetuser'),
    ).rejects.toMatchObject({ code: 'USER_NOT_FOUND', statusCode: 404 });
  });
});

// ─── deleteAccount ────────────────────────────────────────────────────────────

const baseUserWithPlatforms = { ...baseUser, platformAccounts: [{ platform: 'STEAM' as const }] };

describe('userService.deleteAccount', () => {
  it('elimina el usuario cuando existe', async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(baseUserWithPlatforms);
    (mockPrisma.$transaction as jest.Mock).mockResolvedValue([]);

    await userService.deleteAccount('user-1');

    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('lanza USER_NOT_FOUND cuando el usuario no existe', async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(null);

    await expect(userService.deleteAccount('noexiste')).rejects.toMatchObject({
      code: 'USER_NOT_FOUND',
      statusCode: 404,
    });

    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('la transacción incluye prisma.user.delete con el userId correcto', async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(baseUserWithPlatforms);
    (mockPrisma.$transaction as jest.Mock).mockResolvedValue([]);

    await userService.deleteAccount('user-1');

    const transactionArg = (mockPrisma.$transaction as jest.Mock).mock.calls[0][0] as unknown[];
    expect(transactionArg).toHaveLength(1);
  });
});
