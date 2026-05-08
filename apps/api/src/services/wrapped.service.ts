import { prisma } from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';
import type { GamingWrapped, Platform } from '@unlockhub/types';

function yearBounds(year: number): { start: Date; end: Date } {
  return {
    start: new Date(`${year}-01-01T00:00:00.000Z`),
    end: new Date(`${year}-12-31T23:59:59.999Z`),
  };
}

async function computeStats(
  userId: string,
  start: Date,
  end: Date,
): Promise<{
  totalAchievements: number;
  totalXpGained: number;
  bestStreak: number;
  topGame: GamingWrapped['topGame'];
  rarestAchievement: GamingWrapped['rarestAchievement'];
}> {
  const [userAchievements, xpResult, streakEvents] = await Promise.all([
    prisma.userAchievement.findMany({
      where: { userId, unlockedAt: { gte: start, lte: end } },
      include: { achievement: { include: { game: true } } },
    }),
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

export async function getWrapped(userId: string, year: number): Promise<GamingWrapped> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, streakDays: true } });
  if (!user) throw new AppError('Usuario no encontrado.', 'USER_NOT_FOUND', 404);

  const currentYear = new Date().getFullYear();
  if (year > currentYear) {
    throw new AppError('El año solicitado aún no ha ocurrido.', 'WRAPPED_YEAR_FUTURE', 400);
  }

  const { start, end } = yearBounds(year);
  const stats = await computeStats(userId, start, end);

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

  return {
    year,
    totalAchievements: stats.totalAchievements,
    totalXpGained: stats.totalXpGained,
    topGame: stats.topGame,
    rarestAchievement: stats.rarestAchievement,
    bestStreak: stats.bestStreak,
    previousYear,
  };
}
