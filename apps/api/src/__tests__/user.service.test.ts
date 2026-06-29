import * as userService from '../services/user.service';
import { AppError } from '../middleware/errorHandler';

// Mock de Cloudinary
jest.mock('../lib/cloudinary', () => ({
  cloudinary: {
    uploader: {
      upload: jest.fn(),
    },
  },
}));

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
      deleteMany: jest.fn(),
    },
    userAchievement: {
      findMany: jest.fn(),
    },
    achievement: {
      findMany: jest.fn(),
    },
    activityEvent: {
      updateMany: jest.fn(),
    },
    passwordResetToken: {
      deleteMany: jest.fn(),
    },
    refreshToken: {
      updateMany: jest.fn(),
    },
    friendship: {
      findFirst: jest.fn(),
    },
    game: {
      findUnique: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}));

// Mock del ranking service para evitar llamadas a Redis
jest.mock('../services/ranking.service', () => ({
  upsertUserScore: jest.fn().mockResolvedValue(undefined),
  removeUserFromRankings: jest.fn().mockResolvedValue(undefined),
}));

// Mock del scheduler de syncs — evita que sync.queue cree una conexión BullMQ real
jest.mock('../jobs/sync.scheduler', () => ({
  cancelAutoSync: jest.fn().mockResolvedValue(undefined),
}));

// Mock de Redis — getUserGames/getUserGameAchievements/invalidateUserPublicCache usan caché
jest.mock('../lib/redis', () => ({
  redis: {
    get: jest.fn().mockResolvedValue(null),   // siempre cache miss en tests
    set: jest.fn().mockResolvedValue('OK'),
    sadd: jest.fn().mockResolvedValue(1),
    expire: jest.fn().mockResolvedValue(1),
    smembers: jest.fn().mockResolvedValue([]),
    del: jest.fn().mockResolvedValue(1),
  },
}));


import { prisma } from '../lib/prisma';
import { cloudinary } from '../lib/cloudinary';
import { upsertUserScore, removeUserFromRankings } from '../services/ranking.service';
import { cancelAutoSync } from '../jobs/sync.scheduler';

const mockPrisma = prisma as jest.Mocked<typeof prisma>;
const mockUpsertUserScore = upsertUserScore as jest.Mock;
const mockRemoveUserFromRankings = removeUserFromRankings as jest.Mock;
const mockCancelAutoSync = cancelAutoSync as jest.Mock;

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
  profileVisibility: 'PUBLIC' as const,
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

  // BUG-CRÍTICO-1: el perfil público no debe exponer campos privados
  it('BUG-CRÍTICO-1: no incluye email en el perfil público', async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({
      ...baseUser,
      platformAccounts: [],
    });

    const profile = await userService.getPublicProfile('testuser');

    expect((profile as unknown as Record<string, unknown>)['email']).toBeUndefined();
  });

  it('BUG-CRÍTICO-1: no incluye passwordHash en el perfil público', async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({
      ...baseUser,
      platformAccounts: [],
    });

    const profile = await userService.getPublicProfile('testuser');

    expect((profile as unknown as Record<string, unknown>)['passwordHash']).toBeUndefined();
  });

  it('BUG-MEDIO-4: devuelve NOT_FOUND para usuarios con deletedAt !== null', async () => {
    // Simula el filtro where: { username, deletedAt: null } — la BD no devuelve el usuario
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(null);

    await expect(userService.getPublicProfile('usuarioeliminado')).rejects.toMatchObject({
      code: 'USER_NOT_FOUND',
      statusCode: 404,
    });
  });

  it('filtra por deletedAt: null en la query (pasa el where correcto)', async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({
      ...baseUser,
      platformAccounts: [],
    });

    await userService.getPublicProfile('testuser');

    expect(mockPrisma.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ deletedAt: null }),
      }),
    );
  });

  // F29: privacidad de perfil
  it('F29: perfil PRIVATE devuelve USER_NOT_FOUND 404', async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({
      ...baseUser,
      profileVisibility: 'PRIVATE',
      platformAccounts: [],
    });

    await expect(userService.getPublicProfile('testuser')).rejects.toMatchObject({
      code: 'USER_NOT_FOUND',
      statusCode: 404,
    });
  });

  it('F29: perfil FRIENDS_ONLY sin requestingUserId devuelve PROFILE_FRIENDS_ONLY 403', async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({
      ...baseUser,
      profileVisibility: 'FRIENDS_ONLY',
      platformAccounts: [],
    });

    await expect(userService.getPublicProfile('testuser', undefined)).rejects.toMatchObject({
      code: 'PROFILE_FRIENDS_ONLY',
      statusCode: 403,
    });
  });

  it('F29: perfil FRIENDS_ONLY sin amistad aceptada devuelve PROFILE_FRIENDS_ONLY 403', async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({
      ...baseUser,
      id: 'user-target',
      profileVisibility: 'FRIENDS_ONLY',
      platformAccounts: [],
    });
    (mockPrisma.friendship.findFirst as jest.Mock).mockResolvedValue(null);

    await expect(userService.getPublicProfile('testuser', 'user-requester')).rejects.toMatchObject({
      code: 'PROFILE_FRIENDS_ONLY',
      statusCode: 403,
    });
  });

  it('F29: perfil FRIENDS_ONLY con amistad ACCEPTED devuelve el perfil', async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({
      ...baseUser,
      id: 'user-target',
      profileVisibility: 'FRIENDS_ONLY',
      platformAccounts: [],
    });
    (mockPrisma.friendship.findFirst as jest.Mock).mockResolvedValue({ id: 'fs-1' });

    const profile = await userService.getPublicProfile('testuser', 'user-requester');

    expect(profile.username).toBe('testuser');
    expect(profile.profileVisibility).toBe('FRIENDS_ONLY');
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

  it('F29: cambiar a PRIVATE llama a removeUserFromRankings', async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({ xp: 500, profileVisibility: 'PUBLIC' });
    (mockPrisma.user.update as jest.Mock).mockResolvedValue({ ...baseUser, profileVisibility: 'PRIVATE' });
    (mockPrisma.platformAccount.findMany as jest.Mock).mockResolvedValue([{ platform: 'STEAM' }]);

    await userService.updateProfile('user-1', { profileVisibility: 'PRIVATE' });

    expect(mockRemoveUserFromRankings).toHaveBeenCalledWith('user-1', ['STEAM']);
    expect(mockUpsertUserScore).not.toHaveBeenCalled();
  });

  it('F29: cambiar a PUBLIC llama a upsertUserScore', async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({ xp: 500, profileVisibility: 'PRIVATE' });
    (mockPrisma.user.update as jest.Mock).mockResolvedValue({ ...baseUser, xp: 500, profileVisibility: 'PUBLIC' });
    (mockPrisma.platformAccount.findMany as jest.Mock).mockResolvedValue([{ platform: 'STEAM' }]);

    await userService.updateProfile('user-1', { profileVisibility: 'PUBLIC' });

    expect(mockUpsertUserScore).toHaveBeenCalledWith('user-1', 500, ['STEAM'], 'PUBLIC');
    expect(mockRemoveUserFromRankings).not.toHaveBeenCalled();
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

    expect(mockUpsertUserScore).toHaveBeenCalledWith('user-1', 200, ['STEAM'], 'PUBLIC');
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

  // Helper actualizado: incluye achievementId, platform y normalizedPoints para soportar
  // la lógica de platino PSN y el mapeo completo del select de Prisma
  const makeUserAchievement = (
    gameId: string,
    game: object,
    overrides: { platform?: string; normalizedPoints?: number; achievementId?: string } = {},
  ) => ({
    achievementId: overrides.achievementId ?? `ach-${gameId}-${Math.random()}`,
    achievement: {
      gameId,
      platform: overrides.platform ?? 'STEAM',
      normalizedPoints: overrides.normalizedPoints ?? 10,
      game,
    },
  });

  it('devuelve lista vacía cuando el usuario no tiene logros', async () => {
    (mockPrisma.userAchievement.findMany as jest.Mock).mockResolvedValue([]);
    (mockPrisma.platformAccount.findMany as jest.Mock).mockResolvedValue([]);
    (mockPrisma.achievement.findMany as jest.Mock).mockResolvedValue([]);

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
    (mockPrisma.achievement.findMany as jest.Mock).mockResolvedValue([]);

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
    (mockPrisma.achievement.findMany as jest.Mock).mockResolvedValue([]);

    const result = await userService.getMyGames('user-1');
    expect(result.data[0]?.completionPct).toBe(50);
  });

  it('filtra por plataforma cuando se especifica', async () => {
    (mockPrisma.userAchievement.findMany as jest.Mock).mockResolvedValue([]);
    (mockPrisma.platformAccount.findMany as jest.Mock).mockResolvedValue([]);
    (mockPrisma.achievement.findMany as jest.Mock).mockResolvedValue([]);

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
    (mockPrisma.achievement.findMany as jest.Mock).mockResolvedValue([]);

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
    (mockPrisma.achievement.findMany as jest.Mock).mockResolvedValue([]);

    const result = await userService.getMyGames('user-1');
    expect(result.data[0]?.lastSyncedAt).toBe(syncDate.toISOString());
  });

  it('devuelve null para lastSyncedAt si la plataforma no está vinculada', async () => {
    const game = { id: 'g1', title: 'Sonic', platform: 'RA', iconUrl: null, totalAchievements: 5 };
    (mockPrisma.userAchievement.findMany as jest.Mock).mockResolvedValue([makeUserAchievement('g1', game, { platform: 'RA' })]);
    (mockPrisma.platformAccount.findMany as jest.Mock).mockResolvedValue([]);
    (mockPrisma.achievement.findMany as jest.Mock).mockResolvedValue([]);

    const result = await userService.getMyGames('user-1');
    expect(result.data[0]?.lastSyncedAt).toBeNull();
  });

  it('devuelve juegos ordenados por lastActivityAt DESC (BUG-D)', async () => {
    const makeGame = (id: string, title: string) => ({
      id, title, platform: 'STEAM', iconUrl: null, totalAchievements: 1,
    });
    // Hollow Knight: logro más reciente (2024-06-03), Elden Ring: 2024-06-02, Zelda: 2024-06-01
    (mockPrisma.userAchievement.findMany as jest.Mock).mockResolvedValue([
      { ...makeUserAchievement('g3', makeGame('g3', 'Zelda')), unlockedAt: new Date('2024-06-01') },
      { ...makeUserAchievement('g1', makeGame('g1', 'Elden Ring')), unlockedAt: new Date('2024-06-02') },
      { ...makeUserAchievement('g2', makeGame('g2', 'Hollow Knight')), unlockedAt: new Date('2024-06-03') },
    ]);
    (mockPrisma.platformAccount.findMany as jest.Mock).mockResolvedValue([]);
    (mockPrisma.achievement.findMany as jest.Mock).mockResolvedValue([]);

    const result = await userService.getMyGames('user-1');
    // Más reciente primero
    expect(result.data.map((g) => g.title)).toEqual(['Hollow Knight', 'Elden Ring', 'Zelda']);
  });

  // ─── BUG-10: aggregate stats ─────────────────────────────────────────────────

  it('BUG-10: totalEarnedAchievements suma todos los logros ganados de todos los juegos', async () => {
    const gameA = { id: 'g1', title: 'A', platform: 'STEAM', iconUrl: null, totalAchievements: 10 };
    const gameB = { id: 'g2', title: 'B', platform: 'RA', iconUrl: null, totalAchievements: 20 };
    (mockPrisma.userAchievement.findMany as jest.Mock).mockResolvedValue([
      // 3 logros en juego A
      makeUserAchievement('g1', gameA),
      makeUserAchievement('g1', gameA),
      makeUserAchievement('g1', gameA),
      // 5 logros en juego B
      makeUserAchievement('g2', gameB, { platform: 'RA' }),
      makeUserAchievement('g2', gameB, { platform: 'RA' }),
      makeUserAchievement('g2', gameB, { platform: 'RA' }),
      makeUserAchievement('g2', gameB, { platform: 'RA' }),
      makeUserAchievement('g2', gameB, { platform: 'RA' }),
    ]);
    (mockPrisma.platformAccount.findMany as jest.Mock).mockResolvedValue([]);
    (mockPrisma.achievement.findMany as jest.Mock).mockResolvedValue([]);

    const result = await userService.getMyGames('user-1');

    expect(result.totalEarnedAchievements).toBe(8);
    expect(result.totalAvailableAchievements).toBe(30); // 10 + 20
  });

  it('BUG-10: los aggregate stats se calculan antes de la paginación', async () => {
    // 25 logros en 25 juegos distintos — limit 20 debería devolver solo 20 pero stats de los 25
    const userAchievements = Array.from({ length: 25 }, (_, i) => {
      const game = { id: `g${i}`, title: `Game ${i}`, platform: 'STEAM', iconUrl: null, totalAchievements: 2 };
      return makeUserAchievement(`g${i}`, game);
    });
    (mockPrisma.userAchievement.findMany as jest.Mock).mockResolvedValue(userAchievements);
    (mockPrisma.platformAccount.findMany as jest.Mock).mockResolvedValue([]);
    (mockPrisma.achievement.findMany as jest.Mock).mockResolvedValue([]);

    const result = await userService.getMyGames('user-1', undefined, 1, 20);

    expect(result.data).toHaveLength(20); // primera página: 20 juegos
    expect(result.total).toBe(25); // total de juegos sin paginar
    expect(result.totalEarnedAchievements).toBe(25); // 1 logro por juego × 25 juegos
    expect(result.totalAvailableAchievements).toBe(50); // 2 por juego × 25 juegos
  });

  // ─── Estados PSN: hasPlatinum, platinumEarned, isCompleted ───────────────────

  it('PSN: hasPlatinum=true cuando hay un achievement con normalizedPoints=300 en el juego', async () => {
    const psnGame = { id: 'psn-1', title: 'God of War', platform: 'PSN', iconUrl: null, totalAchievements: 52 };
    (mockPrisma.userAchievement.findMany as jest.Mock).mockResolvedValue([
      makeUserAchievement('psn-1', psnGame, { platform: 'PSN', normalizedPoints: 30 }),
    ]);
    (mockPrisma.platformAccount.findMany as jest.Mock).mockResolvedValue([]);
    // prisma.achievement.findMany devuelve todos los achievements del juego PSN, incluyendo el platino
    (mockPrisma.achievement.findMany as jest.Mock).mockResolvedValue([
      { gameId: 'psn-1', normalizedPoints: 30 },
      { gameId: 'psn-1', normalizedPoints: 300 }, // platino disponible
    ]);

    const result = await userService.getMyGames('user-1');

    expect(result.data[0]?.hasPlatinum).toBe(true);
    expect(result.data[0]?.platinumEarned).toBe(false);
  });

  it('PSN: platinumEarned=true cuando el usuario ha ganado el achievement con 300 pts', async () => {
    const psnGame = { id: 'psn-1', title: 'God of War', platform: 'PSN', iconUrl: null, totalAchievements: 2 };
    (mockPrisma.userAchievement.findMany as jest.Mock).mockResolvedValue([
      makeUserAchievement('psn-1', psnGame, { platform: 'PSN', normalizedPoints: 30, achievementId: 'ach-bronze' }),
      makeUserAchievement('psn-1', psnGame, { platform: 'PSN', normalizedPoints: 300, achievementId: 'ach-platinum' }),
    ]);
    (mockPrisma.platformAccount.findMany as jest.Mock).mockResolvedValue([]);
    (mockPrisma.achievement.findMany as jest.Mock).mockResolvedValue([
      { gameId: 'psn-1', normalizedPoints: 30 },
      { gameId: 'psn-1', normalizedPoints: 300 },
    ]);

    const result = await userService.getMyGames('user-1');

    expect(result.data[0]?.platinumEarned).toBe(true);
    expect(result.data[0]?.hasPlatinum).toBe(true);
  });

  it('PSN: isCompleted=true cuando earnedAchievements === totalAchievements', async () => {
    const psnGame = { id: 'psn-1', title: 'God of War', platform: 'PSN', iconUrl: null, totalAchievements: 2 };
    (mockPrisma.userAchievement.findMany as jest.Mock).mockResolvedValue([
      makeUserAchievement('psn-1', psnGame, { platform: 'PSN', normalizedPoints: 30 }),
      makeUserAchievement('psn-1', psnGame, { platform: 'PSN', normalizedPoints: 300 }),
    ]);
    (mockPrisma.platformAccount.findMany as jest.Mock).mockResolvedValue([]);
    (mockPrisma.achievement.findMany as jest.Mock).mockResolvedValue([
      { gameId: 'psn-1', normalizedPoints: 30 },
      { gameId: 'psn-1', normalizedPoints: 300 },
    ]);

    const result = await userService.getMyGames('user-1');

    expect(result.data[0]?.isCompleted).toBe(true);
  });

  it('PSN: hasPlatinum=false cuando ningún achievement del juego tiene 300 pts', async () => {
    const psnGame = { id: 'psn-1', title: 'Some Game', platform: 'PSN', iconUrl: null, totalAchievements: 10 };
    (mockPrisma.userAchievement.findMany as jest.Mock).mockResolvedValue([
      makeUserAchievement('psn-1', psnGame, { platform: 'PSN', normalizedPoints: 30 }),
    ]);
    (mockPrisma.platformAccount.findMany as jest.Mock).mockResolvedValue([]);
    // Sin achievement de 300 pts — no hay platino en este juego
    (mockPrisma.achievement.findMany as jest.Mock).mockResolvedValue([
      { gameId: 'psn-1', normalizedPoints: 30 },
      { gameId: 'psn-1', normalizedPoints: 90 },
    ]);

    const result = await userService.getMyGames('user-1');

    expect(result.data[0]?.hasPlatinum).toBe(false);
    expect(result.data[0]?.platinumEarned).toBe(false);
  });

  it('Steam: hasPlatinum=false y platinumEarned=false siempre (no es PSN)', async () => {
    const steamGame = { id: 'steam-1', title: 'Portal', platform: 'STEAM', iconUrl: null, totalAchievements: 10 };
    (mockPrisma.userAchievement.findMany as jest.Mock).mockResolvedValue([
      makeUserAchievement('steam-1', steamGame, { platform: 'STEAM', normalizedPoints: 100 }),
    ]);
    (mockPrisma.platformAccount.findMany as jest.Mock).mockResolvedValue([]);
    (mockPrisma.achievement.findMany as jest.Mock).mockResolvedValue([]);

    const result = await userService.getMyGames('user-1');

    expect(result.data[0]?.hasPlatinum).toBe(false);
    expect(result.data[0]?.platinumEarned).toBe(false);
  });

  it('isCompleted=true para juegos no-PSN cuando se han ganado todos los logros', async () => {
    const steamGame = { id: 'steam-1', title: 'Portal', platform: 'STEAM', iconUrl: null, totalAchievements: 3 };
    (mockPrisma.userAchievement.findMany as jest.Mock).mockResolvedValue([
      makeUserAchievement('steam-1', steamGame),
      makeUserAchievement('steam-1', steamGame),
      makeUserAchievement('steam-1', steamGame),
    ]);
    (mockPrisma.platformAccount.findMany as jest.Mock).mockResolvedValue([]);
    (mockPrisma.achievement.findMany as jest.Mock).mockResolvedValue([]);

    const result = await userService.getMyGames('user-1');

    expect(result.data[0]?.isCompleted).toBe(true);
    expect(result.data[0]?.completionPct).toBe(100);
  });

  it('isCompleted=false cuando totalAchievements es 0', async () => {
    const game = { id: 'g1', title: 'Game', platform: 'STEAM', iconUrl: null, totalAchievements: 0 };
    (mockPrisma.userAchievement.findMany as jest.Mock).mockResolvedValue([
      makeUserAchievement('g1', game),
    ]);
    (mockPrisma.platformAccount.findMany as jest.Mock).mockResolvedValue([]);
    (mockPrisma.achievement.findMany as jest.Mock).mockResolvedValue([]);

    const result = await userService.getMyGames('user-1');

    expect(result.data[0]?.isCompleted).toBe(false);
  });

  // ─── totalGames / totalCompletedGames ─────────────────────────────────────────

  it('totalGames devuelve el número de juegos distintos', async () => {
    const gameA = { id: 'g1', title: 'A', platform: 'STEAM', iconUrl: null, totalAchievements: 5 };
    const gameB = { id: 'g2', title: 'B', platform: 'RA', iconUrl: null, totalAchievements: 10 };
    const gameC = { id: 'g3', title: 'C', platform: 'STEAM', iconUrl: null, totalAchievements: 3 };
    (mockPrisma.userAchievement.findMany as jest.Mock).mockResolvedValue([
      makeUserAchievement('g1', gameA),
      makeUserAchievement('g1', gameA),
      makeUserAchievement('g2', gameB, { platform: 'RA' }),
      makeUserAchievement('g3', gameC),
    ]);
    (mockPrisma.platformAccount.findMany as jest.Mock).mockResolvedValue([]);
    (mockPrisma.achievement.findMany as jest.Mock).mockResolvedValue([]);

    const result = await userService.getMyGames('user-1');

    expect(result.totalGames).toBe(3);
  });

  it('totalCompletedGames cuenta solo juegos donde earnedAchievements === totalAchievements', async () => {
    // gameA completado (2/2), gameB incompleto (1/5)
    const gameA = { id: 'g1', title: 'A', platform: 'STEAM', iconUrl: null, totalAchievements: 2 };
    const gameB = { id: 'g2', title: 'B', platform: 'STEAM', iconUrl: null, totalAchievements: 5 };
    (mockPrisma.userAchievement.findMany as jest.Mock).mockResolvedValue([
      makeUserAchievement('g1', gameA),
      makeUserAchievement('g1', gameA),
      makeUserAchievement('g2', gameB),
    ]);
    (mockPrisma.platformAccount.findMany as jest.Mock).mockResolvedValue([]);
    (mockPrisma.achievement.findMany as jest.Mock).mockResolvedValue([]);

    const result = await userService.getMyGames('user-1');

    expect(result.totalCompletedGames).toBe(1);
    expect(result.totalGames).toBe(2);
  });

  it('totalCompletedGames=0 cuando ningún juego está completado', async () => {
    const gameA = { id: 'g1', title: 'A', platform: 'STEAM', iconUrl: null, totalAchievements: 10 };
    const gameB = { id: 'g2', title: 'B', platform: 'RA', iconUrl: null, totalAchievements: 20 };
    (mockPrisma.userAchievement.findMany as jest.Mock).mockResolvedValue([
      makeUserAchievement('g1', gameA),
      makeUserAchievement('g2', gameB, { platform: 'RA' }),
    ]);
    (mockPrisma.platformAccount.findMany as jest.Mock).mockResolvedValue([]);
    (mockPrisma.achievement.findMany as jest.Mock).mockResolvedValue([]);

    const result = await userService.getMyGames('user-1');

    expect(result.totalCompletedGames).toBe(0);
  });

  it('totalCompletedGames === totalGames cuando todos los juegos están completados', async () => {
    const gameA = { id: 'g1', title: 'A', platform: 'STEAM', iconUrl: null, totalAchievements: 2 };
    const gameB = { id: 'g2', title: 'B', platform: 'RA', iconUrl: null, totalAchievements: 3 };
    (mockPrisma.userAchievement.findMany as jest.Mock).mockResolvedValue([
      makeUserAchievement('g1', gameA),
      makeUserAchievement('g1', gameA),
      makeUserAchievement('g2', gameB, { platform: 'RA' }),
      makeUserAchievement('g2', gameB, { platform: 'RA' }),
      makeUserAchievement('g2', gameB, { platform: 'RA' }),
    ]);
    (mockPrisma.platformAccount.findMany as jest.Mock).mockResolvedValue([]);
    (mockPrisma.achievement.findMany as jest.Mock).mockResolvedValue([]);

    const result = await userService.getMyGames('user-1');

    expect(result.totalCompletedGames).toBe(2);
    expect(result.totalGames).toBe(2);
    expect(result.totalCompletedGames).toBe(result.totalGames);
  });

  it('totalGames/totalCompletedGames se calculan antes de la paginación', async () => {
    // 25 juegos, 5 completados (1 logro cada uno con totalAchievements=1), 20 incompletos
    const completedGames = Array.from({ length: 5 }, (_, i) => {
      const game = { id: `c${i}`, title: `Completed ${i}`, platform: 'STEAM', iconUrl: null, totalAchievements: 1 };
      return makeUserAchievement(`c${i}`, game);
    });
    const incompleteGames = Array.from({ length: 20 }, (_, i) => {
      const game = { id: `p${i}`, title: `Partial ${i}`, platform: 'STEAM', iconUrl: null, totalAchievements: 10 };
      return makeUserAchievement(`p${i}`, game);
    });
    (mockPrisma.userAchievement.findMany as jest.Mock).mockResolvedValue([
      ...completedGames,
      ...incompleteGames,
    ]);
    (mockPrisma.platformAccount.findMany as jest.Mock).mockResolvedValue([]);
    (mockPrisma.achievement.findMany as jest.Mock).mockResolvedValue([]);

    // página 1, limit 20 — solo devuelve 20 juegos pero stats cubren los 25
    const result = await userService.getMyGames('user-1', undefined, 1, 20);

    expect(result.data).toHaveLength(20);
    expect(result.totalGames).toBe(25);
    expect(result.totalCompletedGames).toBe(5);
  });

  it('no devuelve juegos de una plataforma sin UserAchievements (plataforma desvinculada)', async () => {
    // Solo hay UserAchievements de PSN — Steam no tiene ninguno (como si se hubiera desvinculado)
    const psnGame = { id: 'psn-game-1', title: 'God of War', platform: 'PSN', iconUrl: null, totalAchievements: 36 };
    (mockPrisma.userAchievement.findMany as jest.Mock).mockResolvedValue([
      makeUserAchievement('psn-game-1', psnGame, { platform: 'PSN', normalizedPoints: 15 }),
    ]);
    (mockPrisma.platformAccount.findMany as jest.Mock).mockResolvedValue([
      { platform: 'PSN', lastSyncedAt: null },
    ]);
    (mockPrisma.achievement.findMany as jest.Mock).mockResolvedValue([]);

    const result = await userService.getMyGames('user-1');

    expect(result.data).toHaveLength(1);
    expect(result.data[0]?.platform).toBe('PSN');
    // Steam no tiene UserAchievements → no aparece en la biblioteca
    expect(result.data.some((g) => g.platform === 'STEAM')).toBe(false);
  });

  it('solo devuelve juegos para los que el usuario tiene al menos un UserAchievement', async () => {
    // Sin UserAchievements → sin juegos, aunque haya PlatformAccounts vinculadas
    (mockPrisma.userAchievement.findMany as jest.Mock).mockResolvedValue([]);
    (mockPrisma.platformAccount.findMany as jest.Mock).mockResolvedValue([
      { platform: 'STEAM', lastSyncedAt: null },
      { platform: 'PSN', lastSyncedAt: null },
    ]);
    (mockPrisma.achievement.findMany as jest.Mock).mockResolvedValue([]);

    const result = await userService.getMyGames('user-1');

    expect(result.data).toHaveLength(0);
    expect(result.totalGames).toBe(0);
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

// ─── getUserGames (F21) ───────────────────────────────────────────────────────

describe('userService.getUserGames', () => {
  const publicUser = { id: 'u-target', profileVisibility: 'PUBLIC', deletedAt: null };

  const makeUA = (gameId: string, title: string) => ({
    achievementId: `ach-${gameId}`,
    unlockedAt: new Date('2024-01-01'),
    achievement: {
      gameId,
      platform: 'STEAM',
      normalizedPoints: 50,
      game: { id: gameId, title, platform: 'STEAM', iconUrl: null, totalAchievements: 5 },
    },
  });

  it('devuelve juegos del usuario visitado cuando el perfil es PUBLIC', async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(publicUser);
    (mockPrisma.userAchievement.findMany as jest.Mock).mockResolvedValue([makeUA('g1', 'Portal')]);
    (mockPrisma.platformAccount.findMany as jest.Mock).mockResolvedValue([]);
    (mockPrisma.achievement.findMany as jest.Mock).mockResolvedValue([]);

    const result = await userService.getUserGames('targetuser');

    expect(result.data).toHaveLength(1);
    expect(result.data[0]?.title).toBe('Portal');
  });

  it('lanza USER_NOT_FOUND si el username no existe', async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(null);

    await expect(userService.getUserGames('noexiste')).rejects.toMatchObject({
      code: 'USER_NOT_FOUND',
      statusCode: 404,
    });
  });

  it('lanza USER_NOT_FOUND si el perfil es PRIVATE', async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 'u-target', profileVisibility: 'PRIVATE' });

    await expect(userService.getUserGames('secretuser')).rejects.toMatchObject({
      code: 'USER_NOT_FOUND',
      statusCode: 404,
    });
  });

  it('lanza PROFILE_FRIENDS_ONLY si el perfil es FRIENDS_ONLY y no hay sesión', async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 'u-target', profileVisibility: 'FRIENDS_ONLY' });

    await expect(userService.getUserGames('friendsonly', undefined)).rejects.toMatchObject({
      code: 'PROFILE_FRIENDS_ONLY',
      statusCode: 403,
    });
  });

  it('lanza PROFILE_FRIENDS_ONLY si el perfil es FRIENDS_ONLY y no son amigos', async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 'u-target', profileVisibility: 'FRIENDS_ONLY' });
    (mockPrisma.friendship.findFirst as jest.Mock).mockResolvedValue(null);

    await expect(userService.getUserGames('friendsonly', 'u-requester')).rejects.toMatchObject({
      code: 'PROFILE_FRIENDS_ONLY',
      statusCode: 403,
    });
  });

  it('permite acceso FRIENDS_ONLY cuando hay amistad ACCEPTED', async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 'u-target', profileVisibility: 'FRIENDS_ONLY' });
    (mockPrisma.friendship.findFirst as jest.Mock).mockResolvedValue({ id: 'fs-1' });
    (mockPrisma.userAchievement.findMany as jest.Mock).mockResolvedValue([]);
    (mockPrisma.platformAccount.findMany as jest.Mock).mockResolvedValue([]);
    (mockPrisma.achievement.findMany as jest.Mock).mockResolvedValue([]);

    const result = await userService.getUserGames('friendsonly', 'u-requester');

    expect(result.data).toHaveLength(0);
  });
});

// ─── getUserGameAchievements (F21) ───────────────────────────────────────────

describe('userService.getUserGameAchievements', () => {
  const publicUser = { id: 'u-target', profileVisibility: 'PUBLIC' };
  const baseGame = { id: 'game-1', title: 'Portal', iconUrl: null, platform: 'STEAM', totalAchievements: 2 };
  const baseAchievements = [
    { id: 'ach-1', title: 'Logro A', description: null, iconUrl: null, rarity: 0.5, normalizedPoints: 50, platform: 'STEAM', externalId: 'ACH_A', externalUrl: null },
    { id: 'ach-2', title: 'Logro B', description: null, iconUrl: null, rarity: 0.9, normalizedPoints: 10, platform: 'STEAM', externalId: 'ACH_B', externalUrl: null },
  ];

  it('devuelve achievements con isUnlocked del usuario visitado', async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(publicUser);
    (mockPrisma.game.findUnique as jest.Mock).mockResolvedValue(baseGame);
    (mockPrisma.achievement.findMany as jest.Mock).mockResolvedValue(baseAchievements);
    // El usuario visitado tiene desbloqueado ach-1 pero no ach-2
    (mockPrisma.userAchievement.findMany as jest.Mock).mockResolvedValueOnce([
      { achievementId: 'ach-1', unlockedAt: new Date('2024-01-01') },
    ]);

    const result = await userService.getUserGameAchievements('targetuser', 'game-1');

    expect(result.achievements).toHaveLength(2);
    expect(result.achievements[0]?.isUnlocked).toBe(true);
    expect(result.achievements[1]?.isUnlocked).toBe(false);
    expect(result.earnedCount).toBe(1);
    expect(result.game.completionPct).toBe(50);
  });

  it('isUnlockedByMe=null cuando no hay sesión activa', async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(publicUser);
    (mockPrisma.game.findUnique as jest.Mock).mockResolvedValue(baseGame);
    (mockPrisma.achievement.findMany as jest.Mock).mockResolvedValue(baseAchievements);
    (mockPrisma.userAchievement.findMany as jest.Mock).mockResolvedValue([]);

    const result = await userService.getUserGameAchievements('targetuser', 'game-1');

    expect(result.achievements[0]?.isUnlockedByMe).toBeNull();
  });

  it('isUnlockedByMe refleja el estado del solicitante cuando hay sesión', async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(publicUser);
    (mockPrisma.game.findUnique as jest.Mock).mockResolvedValue(baseGame);
    (mockPrisma.achievement.findMany as jest.Mock).mockResolvedValue(baseAchievements);
    // Primera llamada: logros del target (ach-1 desbloqueado)
    (mockPrisma.userAchievement.findMany as jest.Mock).mockResolvedValueOnce([
      { achievementId: 'ach-1', unlockedAt: new Date() },
    ]);
    // Segunda llamada: logros del requester (ach-2 desbloqueado)
    (mockPrisma.userAchievement.findMany as jest.Mock).mockResolvedValueOnce([
      { achievementId: 'ach-2' },
    ]);

    const result = await userService.getUserGameAchievements('targetuser', 'game-1', 'u-requester');

    expect(result.achievements[0]?.isUnlockedByMe).toBe(false); // ach-1 desbloqueado por target, no por me
    expect(result.achievements[1]?.isUnlockedByMe).toBe(true);  // ach-2 desbloqueado por me, no por target
  });

  it('lanza GAME_NOT_FOUND si el juego no existe', async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(publicUser);
    (mockPrisma.game.findUnique as jest.Mock).mockResolvedValue(null);

    await expect(userService.getUserGameAchievements('targetuser', 'juego-inexistente')).rejects.toMatchObject({
      code: 'GAME_NOT_FOUND',
      statusCode: 404,
    });
  });

  it('lanza USER_NOT_FOUND si el perfil es PRIVATE', async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 'u-target', profileVisibility: 'PRIVATE' });

    await expect(userService.getUserGameAchievements('private', 'game-1')).rejects.toMatchObject({
      code: 'USER_NOT_FOUND',
      statusCode: 404,
    });
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
  beforeEach(() => {
    // $transaction acepta función async y la ejecuta con el mock de prisma como tx
    (mockPrisma.$transaction as jest.Mock).mockImplementation(
      async (fn: (tx: typeof mockPrisma) => Promise<void>) => fn(mockPrisma),
    );
    (mockPrisma.user.update as jest.Mock).mockResolvedValue(baseUser);
    (mockPrisma.activityEvent.updateMany as jest.Mock).mockResolvedValue({ count: 0 });
    (mockPrisma.platformAccount.deleteMany as jest.Mock).mockResolvedValue({ count: 0 });
    (mockPrisma.passwordResetToken.deleteMany as jest.Mock).mockResolvedValue({ count: 0 });
  });

  // BUG-CRÍTICO-2: soft delete en lugar de hard delete
  it('BUG-CRÍTICO-2: hace soft delete (setea deletedAt) en lugar de borrado físico', async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(baseUserWithPlatforms);

    await userService.deleteAccount('user-1');

    expect(mockPrisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'user-1' },
        data: expect.objectContaining({ deletedAt: expect.any(Date) }),
      }),
    );
    expect(mockPrisma.user.delete).not.toHaveBeenCalled();
  });

  it('BUG-CRÍTICO-2: anonimiza los ActivityEvent del usuario', async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(baseUserWithPlatforms);

    await userService.deleteAccount('user-1');

    expect(mockPrisma.activityEvent.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      data: { payload: {} },
    });
  });

  it('BUG-CRÍTICO-2: elimina las PlatformAccount del usuario', async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(baseUserWithPlatforms);

    await userService.deleteAccount('user-1');

    expect(mockPrisma.platformAccount.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
    });
  });

  it('BUG-CRÍTICO-2: mantiene UserPoint intacto (integridad de auditoría)', async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(baseUserWithPlatforms);

    await userService.deleteAccount('user-1');

    // UserPoint no debe ser borrado — solo se llama update/delete sobre otras entidades
    const calls = (mockPrisma.$transaction as jest.Mock).mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    // userPoint.deleteMany nunca se llama
    expect((mockPrisma as unknown as Record<string, unknown>)['userPoint']).not.toHaveProperty('deleteMany');
  });

  it('lanza USER_NOT_FOUND cuando el usuario no existe', async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(null);

    await expect(userService.deleteAccount('noexiste')).rejects.toMatchObject({
      code: 'USER_NOT_FOUND',
      statusCode: 404,
    });

    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('ejecuta la transacción de soft delete correctamente', async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(baseUserWithPlatforms);

    await userService.deleteAccount('user-1');

    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('cancela el auto-sync de todas las plataformas del usuario al borrar la cuenta (T108)', async () => {
    const userWithMultiplePlatforms = {
      ...baseUser,
      platformAccounts: [
        { platform: 'STEAM' as const },
        { platform: 'PSN' as const },
        { platform: 'RA' as const },
      ],
    };
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(userWithMultiplePlatforms);

    await userService.deleteAccount('user-1');

    expect(mockCancelAutoSync).toHaveBeenCalledWith('user-1', 'STEAM');
    expect(mockCancelAutoSync).toHaveBeenCalledWith('user-1', 'PSN');
    expect(mockCancelAutoSync).toHaveBeenCalledWith('user-1', 'RA');
    expect(mockCancelAutoSync).toHaveBeenCalledTimes(3);
  });

  it('no cancela ningún auto-sync si el usuario no tiene plataformas vinculadas al borrar', async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({ ...baseUser, platformAccounts: [] });

    await userService.deleteAccount('user-1');

    expect(mockCancelAutoSync).not.toHaveBeenCalled();
  });
});

// ─── uploadAvatar ─────────────────────────────────────────────────────────────

const mockCloudinary = cloudinary as jest.Mocked<typeof cloudinary>;

describe('userService.uploadAvatar', () => {
  beforeEach(() => {
    (mockCloudinary.uploader.upload as jest.Mock).mockResolvedValue({
      secure_url: 'https://res.cloudinary.com/test/avatars/user_user-1.jpg',
    });
    (mockPrisma.user.update as jest.Mock).mockResolvedValue({
      ...baseUser,
      avatar: 'https://res.cloudinary.com/test/avatars/user_user-1.jpg',
    });
  });

  it('sube la imagen a Cloudinary con la carpeta y public_id correctos', async () => {
    const buffer = Buffer.from('fake-image-data');

    await userService.uploadAvatar('user-1', buffer, 'image/jpeg');

    expect(mockCloudinary.uploader.upload).toHaveBeenCalledWith(
      expect.stringContaining('data:image/jpeg;base64,'),
      expect.objectContaining({
        folder: 'unlockhub/avatars',
        public_id: 'user_user-1',
        overwrite: true,
      }),
    );
  });

  it('actualiza User.avatar con la URL segura de Cloudinary', async () => {
    const buffer = Buffer.from('fake-image-data');

    const result = await userService.uploadAvatar('user-1', buffer, 'image/jpeg');

    expect(mockPrisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'user-1' },
        data: { avatar: 'https://res.cloudinary.com/test/avatars/user_user-1.jpg' },
      }),
    );
    expect(result.avatar).toBe('https://res.cloudinary.com/test/avatars/user_user-1.jpg');
  });
});

// ─── uploadBanner ─────────────────────────────────────────────────────────────

describe('userService.uploadBanner', () => {
  beforeEach(() => {
    (mockCloudinary.uploader.upload as jest.Mock).mockResolvedValue({
      secure_url: 'https://res.cloudinary.com/test/banners/user-1-banner.jpg',
    });
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 'user-1' });
    (mockPrisma.user.update as jest.Mock).mockResolvedValue({
      ...baseUser,
      banner: 'https://res.cloudinary.com/test/banners/user-1-banner.jpg',
    });
  });

  it('sube la imagen a Cloudinary con folder banners y public_id correcto', async () => {
    const buffer = Buffer.from('fake-banner-data');

    await userService.uploadBanner('user-1', buffer, 'image/jpeg');

    expect(mockCloudinary.uploader.upload).toHaveBeenCalledWith(
      expect.stringContaining('data:image/jpeg;base64,'),
      expect.objectContaining({
        folder: 'unlockhub/banners',
        public_id: 'user-1-banner',
        overwrite: true,
      }),
    );
  });

  it('actualiza User.banner con la URL segura de Cloudinary', async () => {
    const buffer = Buffer.from('fake-banner-data');

    const result = await userService.uploadBanner('user-1', buffer, 'image/jpeg');

    expect(mockPrisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'user-1' },
        data: { banner: 'https://res.cloudinary.com/test/banners/user-1-banner.jpg' },
      }),
    );
    expect(result.banner).toBe('https://res.cloudinary.com/test/banners/user-1-banner.jpg');
  });

  it('lanza USER_NOT_FOUND si el userId no existe', async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(null);

    const buffer = Buffer.from('fake-banner-data');

    await expect(userService.uploadBanner('noexiste', buffer, 'image/jpeg')).rejects.toMatchObject({
      code: 'USER_NOT_FOUND',
      statusCode: 404,
    });

    expect(mockCloudinary.uploader.upload).not.toHaveBeenCalled();
  });
});
