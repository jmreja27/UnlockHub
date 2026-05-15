jest.mock('../lib/prisma', () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    userAchievement: { findMany: jest.fn() },
    userPoint: { aggregate: jest.fn() },
    activityEvent: { findMany: jest.fn() },
  },
}));

import { getWrapped, getMonthlyWrapped } from '../services/wrapped.service';
import { prisma } from '../lib/prisma';

const mockUserFindUnique = prisma.user.findUnique as jest.Mock;
const mockUAFindMany = prisma.userAchievement.findMany as jest.Mock;
const mockPointAggregate = prisma.userPoint.aggregate as jest.Mock;
const mockActivityFindMany = prisma.activityEvent.findMany as jest.Mock;

const GAME = { id: 'g1', title: 'Half-Life 2', iconUrl: 'https://img/hl2.png', platform: 'STEAM' };
const ACHIEVEMENT = { id: 'a1', title: 'Logro 1', iconUrl: null, rarity: 5.2, gameId: 'g1', game: GAME };
const RARE_ACHIEVEMENT = { id: 'a2', title: 'Logro Raro', iconUrl: null, rarity: 0.3, gameId: 'g1', game: GAME };

function makeUA(achievementOverride = ACHIEVEMENT) {
  return { id: 'ua1', userId: 'u1', achievementId: achievementOverride.id, unlockedAt: new Date(), achievement: achievementOverride };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUserFindUnique.mockResolvedValue({ id: 'u1', streakDays: 14 });
  mockUAFindMany.mockResolvedValue([]);
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
      .mockResolvedValueOnce([makeUA()]);  // año anterior
    mockPointAggregate
      .mockResolvedValueOnce({ _sum: { amount: 500 } })   // año solicitado
      .mockResolvedValueOnce({ _sum: { amount: 200 } });  // año anterior
    const result = await getWrapped('u1', 2025);
    expect(result.previousYear).not.toBeNull();
    expect(result.previousYear?.totalAchievements).toBe(1);
    expect(result.previousYear?.totalXpGained).toBe(200);
  });

  it('previousYear es null cuando el año anterior no tiene datos', async () => {
    // Primera llamada: año solicitado con 1 logro. Segunda: año anterior sin datos.
    mockUAFindMany
      .mockResolvedValueOnce([makeUA()])
      .mockResolvedValueOnce([]);
    const result = await getWrapped('u1', 2024);
    expect(result.previousYear).toBeNull();
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
