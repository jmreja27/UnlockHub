import { prisma } from '../lib/prisma';
import { redis } from '../lib/redis';
import { AppError } from '../middleware/errorHandler';

const STATS_CACHE_TTL_SECONDS = 3600;

// Clave de caché Redis para las estadísticas de un usuario
function statsCacheKey(userId: string): string {
  return `stats:${userId}`;
}

// Devuelve el lunes de la semana a la que pertenece una fecha dada (en formato YYYY-MM-DD)
function getMondayOfWeek(date: Date): string {
  const d = new Date(date);
  const day = d.getUTCDay(); // 0=domingo, 1=lunes, ...
  const diff = day === 0 ? -6 : 1 - day; // retroceder hasta el lunes
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

export interface XpByWeek {
  week: string; // Fecha del lunes en formato YYYY-MM-DD
  xp: number;
}

export interface RarestAchievement {
  id: string;
  title: string;
  iconUrl: string | null;
  rarity: number;
  gameId: string;
  platform: string;
}

export interface UserStats {
  xpByWeek: XpByWeek[];
  rarestAchievement: RarestAchievement | null;
  favoritePlatform: string | null;
  bestStreak: number;
  completedGames: number;
  totalAchievements: number;
  totalXp: number;
}

// Calcula las estadísticas avanzadas de un usuario y las guarda en caché Redis 1h.
export async function getUserStats(userId: string): Promise<UserStats> {
  // Intentar recuperar de caché antes de calcular
  const cached = await redis.get(statsCacheKey(userId));
  if (cached) {
    return JSON.parse(cached) as UserStats;
  }

  // Traer datos del usuario
  const user = await prisma.user.findUnique({
    where: { id: userId, deletedAt: null },
    select: { xp: true, streakDays: true },
  });

  if (!user) {
    throw new AppError('Usuario no encontrado', 'USER_NOT_FOUND', 404);
  }

  // Traer todos los logros desbloqueados con sus metadatos
  const userAchievements = await prisma.userAchievement.findMany({
    where: { userId },
    select: {
      id: true,
      unlockedAt: true,
      achievement: {
        select: {
          id: true,
          title: true,
          iconUrl: true,
          rarity: true,
          gameId: true,
          platform: true,
          normalizedPoints: true,
        },
      },
    },
  });

  const totalAchievements = userAchievements.length;

  // ── xpByWeek: últimas 8 semanas ──────────────────────────────────────────────

  // Construir mapa de lunes → XP acumulado
  const xpMap = new Map<string, number>();

  // Generar las 8 semanas previas (incluyendo la actual) como base con 0 XP
  const now = new Date();
  for (let i = 7; i >= 0; i--) {
    const weekDate = new Date(now);
    weekDate.setUTCDate(weekDate.getUTCDate() - i * 7);
    const monday = getMondayOfWeek(weekDate);
    if (!xpMap.has(monday)) {
      xpMap.set(monday, 0);
    }
  }

  // Acumular XP por semana a partir de los logros desbloqueados en las últimas 8 semanas
  const eightWeeksAgo = new Date(now.getTime() - 8 * 7 * 24 * 60 * 60 * 1000);
  for (const ua of userAchievements) {
    if (ua.unlockedAt >= eightWeeksAgo) {
      const monday = getMondayOfWeek(ua.unlockedAt);
      const current = xpMap.get(monday) ?? 0;
      xpMap.set(monday, current + ua.achievement.normalizedPoints);
    }
  }

  // Ordenar por fecha ascendente y limitar a 8 semanas
  const xpByWeek: XpByWeek[] = Array.from(xpMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-8)
    .map(([week, xp]) => ({ week, xp }));

  // ── rarestAchievement: logro con menor rarity (no nulo) ─────────────────────

  let rarestAchievement: RarestAchievement | null = null;
  let lowestRarity = Infinity;

  for (const ua of userAchievements) {
    const rarity = ua.achievement.rarity;
    if (rarity !== null && rarity < lowestRarity) {
      lowestRarity = rarity;
      rarestAchievement = {
        id: ua.achievement.id,
        title: ua.achievement.title,
        iconUrl: ua.achievement.iconUrl,
        rarity,
        gameId: ua.achievement.gameId,
        platform: ua.achievement.platform,
      };
    }
  }

  // ── favoritePlatform: plataforma con más logros desbloqueados ───────────────

  const platformCount = new Map<string, number>();
  for (const ua of userAchievements) {
    const p = ua.achievement.platform as string;
    platformCount.set(p, (platformCount.get(p) ?? 0) + 1);
  }

  let favoritePlatform: string | null = null;
  let maxCount = 0;
  for (const [platform, count] of platformCount.entries()) {
    if (count > maxCount) {
      maxCount = count;
      favoritePlatform = platform;
    }
  }

  // ── completedGames: juegos con todos los logros desbloqueados ───────────────

  // Agrupar logros del usuario por gameId
  const achievementsByGame = new Map<string, number>();
  for (const ua of userAchievements) {
    const gameId = ua.achievement.gameId;
    achievementsByGame.set(gameId, (achievementsByGame.get(gameId) ?? 0) + 1);
  }

  // Consultar totalAchievements de los juegos que el usuario tiene al menos un logro
  const gameIds = Array.from(achievementsByGame.keys());
  let completedGames = 0;

  if (gameIds.length > 0) {
    const games = await prisma.game.findMany({
      where: { id: { in: gameIds }, totalAchievements: { gt: 0 } },
      select: { id: true, totalAchievements: true },
    });

    for (const game of games) {
      const unlocked = achievementsByGame.get(game.id) ?? 0;
      if (unlocked >= game.totalAchievements) {
        completedGames++;
      }
    }
  }

  // ── Construir resultado ──────────────────────────────────────────────────────

  const stats: UserStats = {
    xpByWeek,
    rarestAchievement,
    favoritePlatform,
    bestStreak: user.streakDays,
    completedGames,
    totalAchievements,
    totalXp: user.xp,
  };

  // Guardar en caché con TTL de 1 hora
  await redis.set(statsCacheKey(userId), JSON.stringify(stats), 'EX', STATS_CACHE_TTL_SECONDS);

  return stats;
}
