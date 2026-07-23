import * as statsService from '../services/stats.service';

jest.mock('../lib/prisma', () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    userAchievement: { findMany: jest.fn() },
    game: { findMany: jest.fn() },
  },
}));

jest.mock('../lib/redis', () => ({
  redis: { get: jest.fn(), set: jest.fn() },
}));

import { prisma } from '../lib/prisma';
import { redis } from '../lib/redis';

const mockUserFind = prisma.user.findUnique as jest.Mock;
const mockUAFind = prisma.userAchievement.findMany as jest.Mock;
const mockGameFind = prisma.game.findMany as jest.Mock;
const mockRedisGet = redis.get as jest.Mock;
const mockRedisSet = redis.set as jest.Mock;

const now = new Date('2024-06-10T12:00:00Z'); // lunes

const makeAchievement = (overrides: Partial<{
  id: string; title: string; iconUrl: string | null; rarity: number | null;
  gameId: string; platform: string; normalizedPoints: number;
}> = {}) => ({
  id: 'ach-1',
  title: 'Logro de prueba',
  iconUrl: null,
  rarity: 5.0,
  gameId: 'game-1',
  platform: 'STEAM',
  normalizedPoints: 50,
  ...overrides,
});

const makeUA = (achievement = makeAchievement(), unlockedAt = now) => ({
  id: 'ua-1',
  unlockedAt,
  achievement,
});

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers().setSystemTime(new Date('2024-06-10T12:00:00Z'));
  mockRedisGet.mockResolvedValue(null);
  mockRedisSet.mockResolvedValue('OK');
  mockGameFind.mockResolvedValue([]);
});

afterEach(() => {
  jest.useRealTimers();
});

describe('getUserStats', () => {
  it('devuelve stats desde caché Redis si existe', async () => {
    const cachedStats = { xpByWeek: [], rarestAchievement: null, favoritePlatform: null, bestStreak: 5, completedGames: 0, totalAchievements: 0, totalXp: 100 };
    mockRedisGet.mockResolvedValue(JSON.stringify(cachedStats));

    const result = await statsService.getUserStats('u-1');

    expect(result).toEqual(cachedStats);
    expect(mockUserFind).not.toHaveBeenCalled();
  });

  it('lanza USER_NOT_FOUND si el usuario no existe', async () => {
    mockUserFind.mockResolvedValue(null);

    await expect(statsService.getUserStats('no-existe')).rejects.toMatchObject({
      code: 'USER_NOT_FOUND',
      statusCode: 404,
    });
  });

  it('devuelve totalAchievements y totalXp correctos', async () => {
    mockUserFind.mockResolvedValue({ xp: 200, streakDays: 7 });
    mockUAFind.mockResolvedValue([makeUA(), makeUA(makeAchievement({ id: 'ach-2', gameId: 'game-2' }))]);

    const result = await statsService.getUserStats('u-1');

    expect(result.totalAchievements).toBe(2);
    expect(result.totalXp).toBe(200);
    expect(result.bestStreak).toBe(7);
  });

  it('devuelve rarestAchievement con menor rarity', async () => {
    mockUserFind.mockResolvedValue({ xp: 100, streakDays: 3 });
    const rare = makeAchievement({ id: 'ach-rare', title: 'Rarísimo', rarity: 0.5 });
    const common = makeAchievement({ id: 'ach-common', title: 'Común', rarity: 30 });
    mockUAFind.mockResolvedValue([makeUA(rare), makeUA(common, new Date('2024-05-01T00:00:00Z'))]);

    const result = await statsService.getUserStats('u-1');

    expect(result.rarestAchievement?.id).toBe('ach-rare');
    expect(result.rarestAchievement?.rarity).toBe(0.5);
  });

  it('devuelve rarestAchievement null si no hay logros con rarity', async () => {
    mockUserFind.mockResolvedValue({ xp: 0, streakDays: 0 });
    mockUAFind.mockResolvedValue([makeUA(makeAchievement({ rarity: null }))]);

    const result = await statsService.getUserStats('u-1');

    expect(result.rarestAchievement).toBeNull();
  });

  it('devuelve favoritePlatform con más logros', async () => {
    mockUserFind.mockResolvedValue({ xp: 150, streakDays: 2 });
    const steam1 = makeUA(makeAchievement({ id: 'a1', platform: 'STEAM' }));
    const steam2 = makeUA(makeAchievement({ id: 'a2', platform: 'STEAM' }));
    const psn1 = makeUA(makeAchievement({ id: 'a3', platform: 'PSN' }));
    mockUAFind.mockResolvedValue([steam1, steam2, psn1]);

    const result = await statsService.getUserStats('u-1');

    expect(result.favoritePlatform).toBe('STEAM');
  });

  it('cuenta completedGames correctamente', async () => {
    mockUserFind.mockResolvedValue({ xp: 100, streakDays: 1 });
    mockUAFind.mockResolvedValue([
      makeUA(makeAchievement({ id: 'a1', gameId: 'game-1' })),
      makeUA(makeAchievement({ id: 'a2', gameId: 'game-1' })),
    ]);
    mockGameFind.mockResolvedValue([{ id: 'game-1', totalAchievements: 2 }]);

    const result = await statsService.getUserStats('u-1');

    expect(result.completedGames).toBe(1);
  });

  it('no cuenta juego como completado si faltan logros', async () => {
    mockUserFind.mockResolvedValue({ xp: 50, streakDays: 0 });
    mockUAFind.mockResolvedValue([makeUA(makeAchievement({ id: 'a1', gameId: 'game-1' }))]);
    mockGameFind.mockResolvedValue([{ id: 'game-1', totalAchievements: 5 }]);

    const result = await statsService.getUserStats('u-1');

    expect(result.completedGames).toBe(0);
  });

  it('guarda el resultado en Redis con EX de 1h', async () => {
    mockUserFind.mockResolvedValue({ xp: 10, streakDays: 0 });
    mockUAFind.mockResolvedValue([]);

    await statsService.getUserStats('u-1');

    expect(mockRedisSet).toHaveBeenCalledWith(
      'stats:u-1',
      expect.any(String),
      'EX',
      3600,
    );
  });

  it('xpByWeek incluye logros de la semana actual con XP correcto', async () => {
    mockUserFind.mockResolvedValue({ xp: 50, streakDays: 0 });
    const ach = makeAchievement({ normalizedPoints: 100 });
    mockUAFind.mockResolvedValue([makeUA(ach, new Date('2024-06-10T08:00:00Z'))]);

    const result = await statsService.getUserStats('u-1');

    const thisWeek = result.xpByWeek.find((w) => w.week === '2024-06-10');
    expect(thisWeek?.xp).toBe(100);
  });
});
