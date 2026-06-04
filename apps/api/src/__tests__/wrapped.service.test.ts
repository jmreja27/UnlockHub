jest.mock('../lib/prisma', () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    userAchievement: { findMany: jest.fn() },
    game: { findMany: jest.fn() },
    userPoint: { aggregate: jest.fn() },
    activityEvent: { findMany: jest.fn() },
  },
}));

import { getWrapped, getMonthlyWrapped } from '../services/wrapped.service';
import { prisma } from '../lib/prisma';

const mockUserFindUnique = prisma.user.findUnique as jest.Mock;
const mockUAFindMany = prisma.userAchievement.findMany as jest.Mock;
const mockGameFindMany = prisma.game.findMany as jest.Mock;
const mockPointAggregate = prisma.userPoint.aggregate as jest.Mock;
const mockActivityFindMany = prisma.activityEvent.findMany as jest.Mock;

const GAME = { id: 'g1', title: 'Half-Life 2', iconUrl: 'https://img/hl2.png', platform: 'STEAM' };
const ACHIEVEMENT = { id: 'a1', title: 'Logro 1', iconUrl: null, rarity: 5.2, normalizedPoints: 25, platform: 'STEAM', gameId: 'g1', game: GAME };
const RARE_ACHIEVEMENT = { id: 'a2', title: 'Logro Raro', iconUrl: null, rarity: 0.3, normalizedPoints: 100, platform: 'STEAM', gameId: 'g1', game: GAME };

function makeUA(achievementOverride = ACHIEVEMENT) {
  return { id: 'ua1', userId: 'u1', achievementId: achievementOverride.id, unlockedAt: new Date(), achievement: achievementOverride };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUserFindUnique.mockResolvedValue({ id: 'u1', streakDays: 14 });
  mockUAFindMany.mockResolvedValue([]);
  mockGameFindMany.mockResolvedValue([]);
  mockPointAggregate.mockResolvedValue({ _sum: { amount: 0 } });
  mockActivityFindMany.mockResolvedValue([]);
});

describe('getWrapped', () => {
  it('lanza USER_NOT_FOUND si el usuario no existe', async () => {
    mockUserFindUnique.mockResolvedValue(null);
    await expect(getWrapped('u1', 2025)).rejects.toMatchObject({ code: 'USER_NOT_FOUND' });
  });

  it('lanza WRAPPED_YEAR_FUTURE si el año es futuro', async () => {
    await expect(getWrapped('u1', 9999)).rejects.toMatchObject({ code: 'WRAPPED_YEAR_FUTURE' });
  });

  it('devuelve ceros cuando no hay datos', async () => {
    const result = await getWrapped('u1', 2024);
    expect(result.totalAchievements).toBe(0);
    expect(result.totalXpGained).toBe(0);
    expect(result.topGame).toBeNull();
    expect(result.rarestAchievement).toBeNull();
    expect(result.previousYear).toBeNull();
  });

  it('cuenta logros correctamente', async () => {
    mockUAFindMany.mockResolvedValue([makeUA(), makeUA()]);
    const result = await getWrapped('u1', 2024);
    expect(result.totalAchievements).toBe(2);
  });

  it('suma XP correctamente', async () => {
    mockPointAggregate.mockResolvedValue({ _sum: { amount: 1500 } });
    const result = await getWrapped('u1', 2024);
    expect(result.totalXpGained).toBe(1500);
  });

  it('calcula topGame como el juego con más logros', async () => {
    const GAME2 = { id: 'g2', title: 'Portal 2', iconUrl: null, platform: 'STEAM' };
    const UA_GAME2 = { id: 'ua2', userId: 'u1', achievementId: 'a3', unlockedAt: new Date(),
      achievement: { id: 'a3', title: 'A3', iconUrl: null, rarity: 10, gameId: 'g2', game: GAME2 } };
    mockUAFindMany.mockResolvedValue([makeUA(), makeUA(), UA_GAME2]);
    const result = await getWrapped('u1', 2024);
    expect(result.topGame?.title).toBe('Half-Life 2');
    expect(result.topGame?.achievementsCount).toBe(2);
  });

  it('calcula rarestAchievement como el logro con menor rareza', async () => {
    mockUAFindMany.mockResolvedValue([makeUA(ACHIEVEMENT), makeUA(RARE_ACHIEVEMENT)]);
    const result = await getWrapped('u1', 2024);
    expect(result.rarestAchievement?.title).toBe('Logro Raro');
    expect(result.rarestAchievement?.rarity).toBe(0.3);
  });

  it('usa streakDays del usuario si no hay eventos de hito (año actual)', async () => {
    const currentYear = new Date().getFullYear();
    mockUAFindMany.mockResolvedValue([]);
    mockActivityFindMany.mockResolvedValue([]);
    const result = await getWrapped('u1', currentYear);
    expect(result.bestStreak).toBe(14); // streakDays del mock
  });

  it('usa el máximo de eventos de hito para bestStreak', async () => {
    mockActivityFindMany.mockResolvedValue([
      { payload: { days: 30 } },
      { payload: { days: 7 } },
      { payload: { days: 100 } },
    ]);
    const result = await getWrapped('u1', 2024);
    expect(result.bestStreak).toBe(100);
  });

  it('incluye previousYear cuando el año anterior tiene datos', async () => {
    mockUAFindMany
      .mockResolvedValueOnce([makeUA()])   // año solicitado
      .mockResolvedValueOnce([makeUA()])   // año anterior
      .mockResolvedValue([]);               // earnedAllTimeByGame (extended stats)
    mockPointAggregate
      .mockResolvedValueOnce({ _sum: { amount: 500 } })   // año solicitado
      .mockResolvedValueOnce({ _sum: { amount: 200 } });  // año anterior
    mockGameFindMany.mockResolvedValue([{ id: 'g1', platform: 'STEAM', totalAchievements: 5 }]);
    const result = await getWrapped('u1', 2025);
    expect(result.previousYear).not.toBeNull();
    expect(result.previousYear?.totalAchievements).toBe(1);
    expect(result.previousYear?.totalXpGained).toBe(200);
  });

  it('previousYear es null cuando el año anterior no tiene datos', async () => {
    // Llamada 1: año solicitado con 1 logro. Llamada 2: año anterior sin datos.
    // Llamada 3: earnedAllTimeByGame en computeExtendedStats (devuelve [])
    mockUAFindMany
      .mockResolvedValueOnce([makeUA()])
      .mockResolvedValue([]);
    mockGameFindMany.mockResolvedValue([{ id: 'g1', platform: 'STEAM', totalAchievements: 5 }]);
    const result = await getWrapped('u1', 2024);
    expect(result.previousYear).toBeNull();
  });
});

// ─── Estadísticas extendidas del Wrapped anual ────────────────────────────────

const PSN_GAME = { id: 'psn1', title: 'Bloodborne', iconUrl: null, platform: 'PSN' };
const PSN_PLATINUM = {
  id: 'ap1', title: 'Platinum', iconUrl: null, rarity: null, normalizedPoints: 300,
  gameId: 'psn1', platform: 'PSN', game: PSN_GAME,
};
const PSN_BRONZE = {
  id: 'ap2', title: 'Trophy 1', iconUrl: null, rarity: 50, normalizedPoints: 15,
  gameId: 'psn1', platform: 'PSN', game: PSN_GAME,
};
const STEAM_ACH = {
  id: 'as1', title: 'Steam Ach', iconUrl: null, rarity: 20, normalizedPoints: 10,
  gameId: 'g1', platform: 'STEAM', game: GAME,
};

function makeUADate(achievement: typeof ACHIEVEMENT, date: Date) {
  return { id: `ua-${date.toISOString()}`, userId: 'u1', achievementId: achievement.id,
    unlockedAt: date, achievement };
}

describe('getWrapped — estadísticas extendidas', () => {
  it('devuelve 0 extended stats cuando no hay logros en el año', async () => {
    mockUAFindMany.mockResolvedValue([]);
    const result = await getWrapped('u1', 2024);
    expect(result.platinumsEarned).toBe(0);
    expect(result.longestStreakInYear).toBe(0);
    expect(result.mostActivePlatform).toBeNull();
    expect(result.mostProductiveDay).toBeNull();
    expect(result.completedGamesByPlatform).toEqual({ steam: 0, ra: 0, psn: 0 });
  });

  it('cuenta platinumsEarned: solo PSN con normalizedPoints === 300', async () => {
    const ua1 = { ...makeUA(), achievement: PSN_PLATINUM };
    const ua2 = { ...makeUA(), achievement: PSN_BRONZE };
    const ua3 = { ...makeUA(), achievement: STEAM_ACH };
    mockUAFindMany.mockResolvedValue([ua1, ua2, ua3]);
    const result = await getWrapped('u1', 2024);
    expect(result.platinumsEarned).toBe(1); // solo PSN_PLATINUM
  });

  it('calcula longestStreakInYear: días consecutivos con logros', async () => {
    const day1 = new Date('2024-03-10T12:00:00Z');
    const day2 = new Date('2024-03-11T12:00:00Z');
    const day3 = new Date('2024-03-12T12:00:00Z');
    const day5 = new Date('2024-03-14T12:00:00Z'); // gap de 1 día
    mockUAFindMany.mockResolvedValue([
      makeUADate(ACHIEVEMENT, day1),
      makeUADate(ACHIEVEMENT, day2),
      makeUADate(ACHIEVEMENT, day3),
      makeUADate(ACHIEVEMENT, day5),
    ]);
    const result = await getWrapped('u1', 2024);
    expect(result.longestStreakInYear).toBe(3); // días 10-11-12
  });

  it('longestStreakInYear: días no consecutivos devuelve el mayor bloque', async () => {
    // Días 1, gap, 3-4-5: la racha más larga es 3 (días 3,4,5)
    const days = [
      new Date('2024-01-01T12:00:00Z'),
      new Date('2024-01-03T12:00:00Z'), // gap de 1 día (no consecutivo)
      new Date('2024-01-04T12:00:00Z'),
      new Date('2024-01-05T12:00:00Z'),
    ];
    mockUAFindMany.mockResolvedValue(days.map((d) => makeUADate(ACHIEVEMENT, d)));
    const result = await getWrapped('u1', 2024);
    expect(result.longestStreakInYear).toBe(3); // días 03, 04, 05 son consecutivos
  });

  it('calcula mostProductiveDay: el día con más logros', async () => {
    const busyDay = new Date('2024-06-15T12:00:00Z');
    const quietDay = new Date('2024-06-20T12:00:00Z');
    mockUAFindMany.mockResolvedValue([
      makeUADate(ACHIEVEMENT, busyDay),
      makeUADate(RARE_ACHIEVEMENT, busyDay),
      makeUADate(ACHIEVEMENT, quietDay),
    ]);
    const result = await getWrapped('u1', 2024);
    expect(result.mostProductiveDay?.date).toBe('2024-06-15');
    expect(result.mostProductiveDay?.achievementsCount).toBe(2);
  });

  it('calcula mostActivePlatform: la plataforma con más logros', async () => {
    const ua1 = { ...makeUA(), achievement: PSN_PLATINUM };
    const ua2 = { ...makeUA(), achievement: PSN_BRONZE };
    const ua3 = { ...makeUA(), achievement: STEAM_ACH };
    mockUAFindMany.mockResolvedValue([ua1, ua2, ua3]);
    const result = await getWrapped('u1', 2024);
    expect(result.mostActivePlatform).toBe('PSN'); // 2 PSN vs 1 Steam
  });

  it('completedGamesByPlatform: cuenta juegos donde earned all-time === totalAchievements', async () => {
    // Usuario tiene 2 logros en g1 (Steam), game tiene totalAchievements: 2 → completado
    const ua1 = { ...makeUA(), achievement: STEAM_ACH };
    const ua2 = { ...makeUA(), achievement: { ...STEAM_ACH, id: 'as2' } };
    mockUAFindMany
      .mockResolvedValueOnce([ua1, ua2])          // año solicitado
      .mockResolvedValueOnce([])                   // año anterior
      .mockResolvedValueOnce([                     // earnedAllTimeByGame
        { achievementId: 'as1', achievement: { gameId: 'g1' } },
        { achievementId: 'as2', achievement: { gameId: 'g1' } },
      ]);
    mockGameFindMany.mockResolvedValue([
      { id: 'g1', platform: 'STEAM', totalAchievements: 2 },
    ]);
    const result = await getWrapped('u1', 2024);
    expect(result.completedGamesByPlatform?.steam).toBe(1);
    expect(result.completedGamesByPlatform?.ra).toBe(0);
    expect(result.completedGamesByPlatform?.psn).toBe(0);
  });

  it('completedGamesByPlatform: juego con earned < total no se cuenta como completado', async () => {
    mockUAFindMany
      .mockResolvedValueOnce([makeUA()])     // año solicitado (1 logro)
      .mockResolvedValueOnce([])             // año anterior
      .mockResolvedValueOnce([               // earnedAllTimeByGame: 1 ganado de 5 totales
        { achievementId: 'a1', achievement: { gameId: 'g1' } },
      ]);
    mockGameFindMany.mockResolvedValue([
      { id: 'g1', platform: 'STEAM', totalAchievements: 5 },
    ]);
    const result = await getWrapped('u1', 2024);
    expect(result.completedGamesByPlatform?.steam).toBe(0);
  });
});

describe('getMonthlyWrapped', () => {
  it('lanza USER_NOT_FOUND si el usuario no existe', async () => {
    mockUserFindUnique.mockResolvedValue(null);
    await expect(getMonthlyWrapped('u1', 2024, 1)).rejects.toMatchObject({ code: 'USER_NOT_FOUND' });
  });

  it('lanza WRAPPED_PERIOD_FUTURE para un mes en el futuro', async () => {
    const future = new Date();
    future.setFullYear(future.getFullYear() + 1);
    await expect(
      getMonthlyWrapped('u1', future.getFullYear(), future.getMonth() + 1),
    ).rejects.toMatchObject({ code: 'WRAPPED_PERIOD_FUTURE' });
  });

  it('devuelve stats del mes con period en formato YYYY-MM', async () => {
    mockUAFindMany.mockResolvedValue([]);
    const result = await getMonthlyWrapped('u1', 2024, 3);
    expect(result.period).toBe('2024-03');
    expect(result.totalAchievements).toBe(0);
  });

  it('incluye previousYear cuando el mismo mes del año anterior tiene datos', async () => {
    mockUAFindMany
      .mockResolvedValueOnce([makeUA()])   // mes solicitado
      .mockResolvedValueOnce([makeUA()]);  // mismo mes año anterior
    mockPointAggregate
      .mockResolvedValueOnce({ _sum: { amount: 300 } })
      .mockResolvedValueOnce({ _sum: { amount: 150 } });

    const result = await getMonthlyWrapped('u1', 2024, 6);
    expect(result.previousYear).not.toBeNull();
    expect(result.previousYear?.totalAchievements).toBe(1);
  });

  it('usa streakDays del usuario si bestStreak es 0 en el mes actual', async () => {
    const now = new Date();
    mockActivityFindMany.mockResolvedValue([]);
    const result = await getMonthlyWrapped('u1', now.getFullYear(), now.getMonth() + 1);
    expect(result.bestStreak).toBe(14); // valor del mock de usuario
  });
});
