import type { Prisma } from '@prisma/client';
import type { GamingWrapped, Platform } from '@unlockhub/types';

import { prisma } from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';

type UserAchievementFull = Prisma.UserAchievementGetPayload<{
  include: { achievement: { include: { game: true } } };
}>;

function yearBounds(year: number): { start: Date; end: Date } {
  return {
    start: new Date(`${year}-01-01T00:00:00.000Z`),
    end: new Date(`${year}-12-31T23:59:59.999Z`),
  };
}

function monthBounds(year: number, month: number): { start: Date; end: Date } {
  const start = new Date(Date.UTC(year, month - 1, 1));
  // El día 0 del mes siguiente es el último día del mes actual
  const end = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
  return { start, end };
}

// Carga los logros desbloqueados en el periodo — se puede reutilizar en extended stats
async function loadUserAchievements(
  userId: string,
  start: Date,
  end: Date,
): Promise<UserAchievementFull[]> {
  return prisma.userAchievement.findMany({
    where: { userId, unlockedAt: { gte: start, lte: end } },
    include: { achievement: { include: { game: true } } },
  });
}

async function computeStats(
  userId: string,
  start: Date,
  end: Date,
  preloaded?: UserAchievementFull[],
): Promise<{
  totalAchievements: number;
  totalXpGained: number;
  bestStreak: number;
  topGame: GamingWrapped['topGame'];
  rarestAchievement: GamingWrapped['rarestAchievement'];
}> {
  const [userAchievements, xpResult, streakEvents] = await Promise.all([
    preloaded ?? loadUserAchievements(userId, start, end),
    prisma.userPoint.aggregate({
      where: { userId, createdAt: { gte: start, lte: end } },
      _sum: { amount: true },
    }),
    prisma.activityEvent.findMany({
      where: { userId, type: 'STREAK_MILESTONE', createdAt: { gte: start, lte: end } },
    }),
  ]);

  const totalAchievements = userAchievements.length;
  const totalXpGained = xpResult._sum.amount ?? 0;

  // Mejor racha del año basada en eventos de hito
  let bestStreak = 0;
  for (const event of streakEvents) {
    const payload = event.payload as Record<string, unknown> | null;
    const days = typeof payload?.['days'] === 'number' ? payload['days'] : 0;
    if (days > bestStreak) bestStreak = days;
  }

  // Juego con más logros desbloqueados en el periodo
  const gameMap = new Map<string, { count: number; title: string; iconUrl: string | null; platform: string }>();
  let rarestAchievement: GamingWrapped['rarestAchievement'] = null;
  let lowestRarity = Infinity;

  for (const ua of userAchievements) {
    const { achievement } = ua;
    const { game } = achievement;

    const entry = gameMap.get(game.id);
    if (entry) {
      entry.count++;
    } else {
      gameMap.set(game.id, { count: 1, title: game.title, iconUrl: game.iconUrl, platform: game.platform });
    }

    if (achievement.rarity !== null && achievement.rarity < lowestRarity) {
      lowestRarity = achievement.rarity;
      rarestAchievement = {
        title: achievement.title,
        iconUrl: achievement.iconUrl,
        rarity: achievement.rarity,
        gameName: game.title,
      };
    }
  }

  let topGame: GamingWrapped['topGame'] = null;
  let maxCount = 0;
  for (const data of gameMap.values()) {
    if (data.count > maxCount) {
      maxCount = data.count;
      topGame = {
        title: data.title,
        iconUrl: data.iconUrl,
        achievementsCount: data.count,
        platform: data.platform as Platform,
      };
    }
  }

  return { totalAchievements, totalXpGained, bestStreak, topGame, rarestAchievement };
}

// Calcula estadísticas extendidas solo para el Wrapped anual reutilizando
// los userAchievements ya cargados y haciendo queries adicionales mínimas.
async function computeExtendedStats(
  userId: string,
  userAchievements: UserAchievementFull[],
): Promise<{
  completedGamesByPlatform: GamingWrapped['completedGamesByPlatform'];
  platinumsEarned: number;
  longestStreakInYear: number;
  mostActivePlatform: GamingWrapped['mostActivePlatform'];
  mostProductiveDay: GamingWrapped['mostProductiveDay'];
}> {
  // Juegos tocados en el año — IDs para las queries posteriores
  const gameIdsInYear = new Set(userAchievements.map((ua) => ua.achievement.game.id));

  if (gameIdsInYear.size === 0) {
    // Sin logros en el año — devolver valores vacíos sin queries adicionales
    return {
      completedGamesByPlatform: { steam: 0, ra: 0, psn: 0 },
      platinumsEarned: 0,
      longestStreakInYear: 0,
      mostActivePlatform: null,
      mostProductiveDay: null,
    };
  }

  // Dos queries en paralelo para completedGamesByPlatform:
  // 1) totalAchievements de los juegos tocados en el año
  // 2) earned ALL-TIME del usuario en esos juegos (puede incluir logros de años anteriores)
  const gameIdsArr = Array.from(gameIdsInYear);
  const [gamesInYear, earnedAllTimeByGame] = await Promise.all([
    prisma.game.findMany({
      where: { id: { in: gameIdsArr } },
      select: { id: true, platform: true, totalAchievements: true },
    }),
    prisma.userAchievement.findMany({
      where: {
        userId,
        achievement: { gameId: { in: gameIdsArr } },
      },
      select: { achievementId: true, achievement: { select: { gameId: true } } },
    }),
  ]);

  // Mapa achievementId → gameId para traducir earned all-time
  const earnedAllTimePerGame = new Map<string, number>();
  for (const row of earnedAllTimeByGame) {
    const gid = row.achievement.gameId;
    earnedAllTimePerGame.set(gid, (earnedAllTimePerGame.get(gid) ?? 0) + 1);
  }

  // completedGamesByPlatform: earned all-time === totalAchievements > 0
  // y el juego tuvo actividad en el año
  const completedGamesByPlatform = { steam: 0, ra: 0, psn: 0 };
  for (const game of gamesInYear) {
    const earned = earnedAllTimePerGame.get(game.id) ?? 0;
    if (game.totalAchievements > 0 && earned >= game.totalAchievements) {
      if (game.platform === 'STEAM') completedGamesByPlatform.steam++;
      else if (game.platform === 'RA') completedGamesByPlatform.ra++;
      else if (game.platform === 'PSN') completedGamesByPlatform.psn++;
    }
  }

  // platinumsEarned: logros PSN con normalizedPoints === 300 desbloqueados en el año
  let platinumsEarned = 0;
  for (const ua of userAchievements) {
    if (ua.achievement.platform === 'PSN' && ua.achievement.normalizedPoints === 300) {
      platinumsEarned++;
    }
  }

  // longestStreakInYear: máximo de días consecutivos con al menos 1 logro
  const daySet = new Set<string>();
  for (const ua of userAchievements) {
    if (ua.unlockedAt) {
      const d = ua.unlockedAt.toISOString().slice(0, 10); // "YYYY-MM-DD"
      daySet.add(d);
    }
  }
  const days = Array.from(daySet).sort();
  let longestStreakInYear = 0;
  let currentStreakRun = 0;
  for (let i = 0; i < days.length; i++) {
    if (i === 0) {
      currentStreakRun = 1;
    } else {
      const prev = new Date(days[i - 1] as string);
      const curr = new Date(days[i] as string);
      const diffMs = curr.getTime() - prev.getTime();
      const diffDays = Math.round(diffMs / 86_400_000);
      if (diffDays === 1) {
        currentStreakRun++;
      } else {
        currentStreakRun = 1;
      }
    }
    if (currentStreakRun > longestStreakInYear) longestStreakInYear = currentStreakRun;
  }

  // mostActivePlatform: plataforma con más logros desbloqueados en el año
  const platformCount: Record<string, number> = {};
  for (const ua of userAchievements) {
    const p = ua.achievement.platform;
    platformCount[p] = (platformCount[p] ?? 0) + 1;
  }
  let mostActivePlatform: Platform | null = null;
  let maxPlatformCount = 0;
  for (const [p, count] of Object.entries(platformCount)) {
    if (count > maxPlatformCount) {
      maxPlatformCount = count;
      mostActivePlatform = p as Platform;
    }
  }

  // mostProductiveDay: día con más logros desbloqueados en el año
  const dayCount = new Map<string, number>();
  for (const ua of userAchievements) {
    if (ua.unlockedAt) {
      const d = ua.unlockedAt.toISOString().slice(0, 10);
      dayCount.set(d, (dayCount.get(d) ?? 0) + 1);
    }
  }
  let mostProductiveDay: GamingWrapped['mostProductiveDay'] = null;
  let maxDayCount = 0;
  for (const [date, count] of dayCount.entries()) {
    if (count > maxDayCount) {
      maxDayCount = count;
      mostProductiveDay = { date, achievementsCount: count };
    }
  }

  return {
    completedGamesByPlatform,
    platinumsEarned,
    longestStreakInYear,
    mostActivePlatform,
    mostProductiveDay,
  };
}

export async function getWrapped(userId: string, year: number): Promise<GamingWrapped> {
  const user = await prisma.user.findUnique({ where: { id: userId, deletedAt: null }, select: { id: true, streakDays: true } });
  if (!user) throw new AppError('Usuario no encontrado.', 'USER_NOT_FOUND', 404);

  const currentYear = new Date().getFullYear();
  if (year > currentYear) {
    throw new AppError('El año solicitado aún no ha ocurrido.', 'WRAPPED_YEAR_FUTURE', 400);
  }

  const { start, end } = yearBounds(year);
  // Carga única — se reutiliza en computeStats y computeExtendedStats
  const userAchievementsForYear = await loadUserAchievements(userId, start, end);
  const stats = await computeStats(userId, start, end, userAchievementsForYear);

  // Para el año actual sin eventos de hito, usar racha actual del usuario
  if (stats.bestStreak === 0 && year === currentYear) {
    stats.bestStreak = user.streakDays;
  }

  // Estadísticas del año anterior para comparación
  const prevBounds = yearBounds(year - 1);
  const prevStats = await computeStats(userId, prevBounds.start, prevBounds.end);

  const previousYear =
    prevStats.totalAchievements > 0 || prevStats.totalXpGained > 0
      ? {
          totalAchievements: prevStats.totalAchievements,
          totalXpGained: prevStats.totalXpGained,
          bestStreak: prevStats.bestStreak,
        }
      : null;

  // Estadísticas extendidas del año (no se calculan para el mensual)
  const extended = await computeExtendedStats(userId, userAchievementsForYear);

  return {
    year,
    period: String(year),
    totalAchievements: stats.totalAchievements,
    totalXpGained: stats.totalXpGained,
    topGame: stats.topGame,
    rarestAchievement: stats.rarestAchievement,
    bestStreak: stats.bestStreak,
    previousYear,
    completedGamesByPlatform: extended.completedGamesByPlatform,
    platinumsEarned: extended.platinumsEarned,
    longestStreakInYear: extended.longestStreakInYear,
    mostActivePlatform: extended.mostActivePlatform,
    mostProductiveDay: extended.mostProductiveDay,
  };
}

// Wrapped mensual: stats del mes especificado y comparación con el mismo mes del año anterior.
export async function getMonthlyWrapped(
  userId: string,
  year: number,
  month: number,
): Promise<GamingWrapped> {
  const user = await prisma.user.findUnique({
    where: { id: userId, deletedAt: null },
    select: { id: true, streakDays: true },
  });
  if (!user) throw new AppError('Usuario no encontrado.', 'USER_NOT_FOUND', 404);

  const currentDate = new Date();
  const currentYear = currentDate.getFullYear();
  const currentMonth = currentDate.getMonth() + 1;

  if (year > currentYear || (year === currentYear && month > currentMonth)) {
    throw new AppError(
      'El período solicitado aún no ha ocurrido.',
      'WRAPPED_PERIOD_FUTURE',
      400,
    );
  }

  const { start, end } = monthBounds(year, month);
  const stats = await computeStats(userId, start, end);

  // Para el mes actual en curso, usar racha actual si no hay eventos de hito
  const isCurrentMonth = year === currentYear && month === currentMonth;
  if (stats.bestStreak === 0 && isCurrentMonth) {
    stats.bestStreak = user.streakDays;
  }

  // Comparación con el mismo mes del año anterior
  const prevBounds = monthBounds(year - 1, month);
  const prevStats = await computeStats(userId, prevBounds.start, prevBounds.end);

  const previousYear =
    prevStats.totalAchievements > 0 || prevStats.totalXpGained > 0
      ? {
          totalAchievements: prevStats.totalAchievements,
          totalXpGained: prevStats.totalXpGained,
          bestStreak: prevStats.bestStreak,
        }
      : null;

  const paddedMonth = String(month).padStart(2, '0');

  return {
    year,
    month,
    period: `${year}-${paddedMonth}`,
    totalAchievements: stats.totalAchievements,
    totalXpGained: stats.totalXpGained,
    topGame: stats.topGame,
    rarestAchievement: stats.rarestAchievement,
    bestStreak: stats.bestStreak,
    previousYear,
  };
}
