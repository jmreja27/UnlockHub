import { AppError } from '../middleware/errorHandler';
import { prisma } from '../lib/prisma';
import { upsertUserScore } from './ranking.service';
import type { User, PlatformAccount, PointReason, Platform } from '@unlockhub/types';

// XP necesario por nivel — cada 1000 XP sube un nivel, máximo nivel 100
const XP_PER_LEVEL = 1000;
const MAX_LEVEL = 100;

function calculateLevel(xp: number): number {
  return Math.min(Math.floor(xp / XP_PER_LEVEL) + 1, MAX_LEVEL);
}

// Transforma el usuario de Prisma al tipo compartido User (sin passwordHash)
function mapUser(dbUser: {
  id: string;
  username: string;
  email: string;
  avatar: string | null;
  banner: string | null;
  bio: string | null;
  level: number;
  xp: number;
  streakDays: number;
  countryCode: string | null;
  isPremium: boolean;
  premiumUntil: Date | null;
  lastSyncAt: Date | null;
  createdAt: Date;
}): User {
  return {
    id: dbUser.id,
    username: dbUser.username,
    email: dbUser.email,
    avatar: dbUser.avatar,
    banner: dbUser.banner,
    bio: dbUser.bio,
    level: dbUser.level,
    xp: dbUser.xp,
    streakDays: dbUser.streakDays,
    countryCode: dbUser.countryCode,
    isPremium: dbUser.isPremium,
    premiumUntil: dbUser.premiumUntil?.toISOString() ?? null,
    lastSyncAt: dbUser.lastSyncAt?.toISOString() ?? null,
    createdAt: dbUser.createdAt.toISOString(),
  };
}

// Transforma una cuenta de plataforma de Prisma al tipo compartido (sin token cifrado)
function mapPlatformAccount(dbAccount: {
  id: string;
  userId: string;
  platform: string;
  externalId: string;
  username: string;
  lastSyncedAt: Date | null;
}): PlatformAccount {
  return {
    id: dbAccount.id,
    userId: dbAccount.userId,
    platform: dbAccount.platform as PlatformAccount['platform'],
    externalId: dbAccount.externalId,
    username: dbAccount.username,
    lastSyncedAt: dbAccount.lastSyncedAt?.toISOString() ?? null,
  };
}

// Obtiene el perfil completo del usuario autenticado, incluyendo sus cuentas de plataforma
export async function getProfile(
  userId: string,
): Promise<User & { platformAccounts: PlatformAccount[] }> {
  const dbUser = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      platformAccounts: {
        select: {
          id: true,
          userId: true,
          platform: true,
          externalId: true,
          username: true,
          lastSyncedAt: true,
        },
      },
    },
  });

  if (!dbUser) {
    throw new AppError('Usuario no encontrado', 'USER_NOT_FOUND', 404);
  }

  return {
    ...mapUser(dbUser),
    platformAccounts: dbUser.platformAccounts.map(mapPlatformAccount),
  };
}

// Obtiene el perfil público de un usuario por su username
export async function getPublicProfile(
  username: string,
): Promise<User & { platformAccounts: PlatformAccount[] }> {
  const dbUser = await prisma.user.findUnique({
    where: { username },
    include: {
      platformAccounts: {
        select: {
          id: true,
          userId: true,
          platform: true,
          externalId: true,
          username: true,
          lastSyncedAt: true,
        },
      },
    },
  });

  if (!dbUser) {
    throw new AppError('Usuario no encontrado', 'USER_NOT_FOUND', 404);
  }

  return {
    ...mapUser(dbUser),
    platformAccounts: dbUser.platformAccounts.map(mapPlatformAccount),
  };
}

// Actualiza campos editables del perfil del usuario
export async function updateProfile(
  userId: string,
  data: { bio?: string; avatar?: string; banner?: string; countryCode?: string },
): Promise<User> {
  const dbUser = await prisma.user.update({
    where: { id: userId },
    data,
  });

  return mapUser(dbUser);
}

// Añade XP al usuario, recalcula su nivel y actualiza el ranking en Redis
export async function addXp(
  userId: string,
  amount: number,
  reason: PointReason,
): Promise<{ newXp: number; newLevel: number; leveledUp: boolean }> {
  const dbUser = await prisma.user.findUnique({ where: { id: userId } });

  if (!dbUser) {
    throw new AppError('Usuario no encontrado', 'USER_NOT_FOUND', 404);
  }

  const previousLevel = dbUser.level;
  const newXp = dbUser.xp + amount;
  const newLevel = calculateLevel(newXp);
  const leveledUp = newLevel > previousLevel;

  // Guardar el registro de puntos y actualizar usuario en una transacción
  await prisma.$transaction([
    prisma.userPoint.create({
      data: {
        userId,
        amount,
        reason,
      },
    }),
    prisma.user.update({
      where: { id: userId },
      data: { xp: newXp, level: newLevel },
    }),
  ]);

  // Actualizar el ranking en Redis tras el cambio de XP
  const platforms = await prisma.platformAccount.findMany({
    where: { userId },
    select: { platform: true },
  });

  await upsertUserScore(
    userId,
    newXp,
    dbUser.countryCode,
    platforms.map((p) => p.platform),
  );

  return { newXp, newLevel, leveledUp };
}

// Devuelve los juegos con logros del usuario, agrupados por juego con stats de completado
export async function getMyGames(
  userId: string,
  platform?: Platform,
): Promise<{
  data: Array<{
    id: string;
    title: string;
    platform: string;
    iconUrl: string | null;
    totalAchievements: number;
    earnedAchievements: number;
    completionPct: number;
    lastSyncedAt: string | null;
  }>;
  total: number;
}> {
  const userAchievements = await prisma.userAchievement.findMany({
    where: {
      userId,
      achievement: platform ? { platform } : undefined,
    },
    select: {
      achievement: {
        select: {
          gameId: true,
          game: {
            select: {
              id: true,
              title: true,
              platform: true,
              iconUrl: true,
              totalAchievements: true,
            },
          },
        },
      },
    },
  });

  const platformAccounts = await prisma.platformAccount.findMany({
    where: { userId },
    select: { platform: true, lastSyncedAt: true },
  });
  const syncMap = new Map<string, string | null>();
  for (const pa of platformAccounts) {
    syncMap.set(pa.platform, pa.lastSyncedAt?.toISOString() ?? null);
  }

  const gameMap = new Map<
    string,
    {
      id: string;
      title: string;
      platform: string;
      iconUrl: string | null;
      totalAchievements: number;
      earnedAchievements: number;
    }
  >();

  for (const ua of userAchievements) {
    const { gameId, game } = ua.achievement;
    const entry = gameMap.get(gameId);
    if (!entry) {
      gameMap.set(gameId, {
        id: game.id,
        title: game.title,
        platform: game.platform,
        iconUrl: game.iconUrl,
        totalAchievements: game.totalAchievements,
        earnedAchievements: 1,
      });
    } else {
      entry.earnedAchievements++;
    }
  }

  const data = Array.from(gameMap.values())
    .map((g) => ({
      id: g.id,
      title: g.title,
      platform: g.platform,
      iconUrl: g.iconUrl,
      totalAchievements: g.totalAchievements,
      earnedAchievements: g.earnedAchievements,
      completionPct:
        g.totalAchievements > 0
          ? Math.round((g.earnedAchievements / g.totalAchievements) * 100)
          : 0,
      lastSyncedAt: syncMap.get(g.platform) ?? null,
    }))
    .sort((a, b) => a.title.localeCompare(b.title));

  return { data, total: data.length };
}

// Elimina la cuenta del usuario y todos sus datos asociados.
// El cascade en Prisma borra automáticamente PlatformAccount, UserAchievement,
// Friendship, ActivityEvent, UserPoint, Subscription, DeviceToken y RefreshToken.
// También limpia las puntuaciones del usuario en todos los Sorted Sets de Redis.
export async function deleteAccount(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError('Usuario no encontrado', 'USER_NOT_FOUND', 404);

  // Borrar datos de ranking en Redis antes de eliminar el registro en BD
  await prisma.$transaction([
    prisma.user.delete({ where: { id: userId } }),
  ]);
}
