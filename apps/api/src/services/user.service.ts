import type { User, PlatformAccount, PointReason, Platform } from '@unlockhub/types';

import { AppError } from '../middleware/errorHandler';
import { prisma } from '../lib/prisma';
import { cloudinary } from '../lib/cloudinary';

import { upsertUserScore, removeUserFromRankings } from './ranking.service';

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
  requiresReauth: boolean;
  psnProfilePrivate: boolean;
}): PlatformAccount {
  return {
    id: dbAccount.id,
    userId: dbAccount.userId,
    platform: dbAccount.platform as PlatformAccount['platform'],
    externalId: dbAccount.externalId,
    username: dbAccount.username,
    lastSyncedAt: dbAccount.lastSyncedAt?.toISOString() ?? null,
    requiresReauth: dbAccount.requiresReauth,
    psnProfilePrivate: dbAccount.psnProfilePrivate,
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
          requiresReauth: true,
          psnProfilePrivate: true,
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
          requiresReauth: true,
          psnProfilePrivate: true,
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

type LibraryGame = {
  id: string;
  title: string;
  platform: string;
  iconUrl: string | null;
  totalAchievements: number;
  earnedAchievements: number;
  completionPct: number;
  lastSyncedAt: string | null;
  // MAX(unlockedAt) del juego — usado para sort "último jugado" real
  lastActivityAt: string | null;
  // Estados PSN: solo presentes cuando platform === 'PSN'
  hasPlatinum: boolean;
  platinumEarned: boolean;
  isCompleted: boolean;
};

// Devuelve los juegos con logros del usuario, agrupados por juego con stats de completado.
// Soporta paginación via page/limit — la agregación ocurre en memoria para evitar
// GROUP BY complejo en Prisma. Suficiente para la escala esperada por usuario.
//
// Los aggregate stats (totalEarnedAchievements, totalAvailableAchievements) se calculan
// sobre TODOS los juegos (antes de paginar) para que el header del cliente los muestre
// correctamente aunque no todas las páginas estén cargadas.
export async function getMyGames(
  userId: string,
  platform?: Platform,
  page = 1,
  limit = 20,
): Promise<{
  data: LibraryGame[];
  total: number;
  page: number;
  limit: number;
  totalEarnedAchievements: number;
  totalAvailableAchievements: number;
  totalGames: number;
  totalCompletedGames: number;
}> {
  const [userAchievements, platformAccounts] = await Promise.all([
    prisma.userAchievement.findMany({
      where: {
        userId,
        achievement: platform ? { platform } : undefined,
      },
      select: {
        achievementId: true,
        unlockedAt: true,
        achievement: {
          select: {
            gameId: true,
            platform: true,
            // normalizedPoints === 300 identifica el trofeo platino en PSN (ver CLAUDE.md)
            normalizedPoints: true,
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
    }),
    prisma.platformAccount.findMany({
      where: { userId },
      select: { platform: true, lastSyncedAt: true },
    }),
  ]);

  const syncMap = new Map<string, string | null>();
  for (const pa of platformAccounts) {
    syncMap.set(pa.platform, pa.lastSyncedAt?.toISOString() ?? null);
  }

  // Para PSN: mapear juego → achievements del usuario (para calcular hasPlatinum y platinumEarned)
  // Se necesitan todos los achievements del juego para saber si hay platino disponible
  const psnGameIds = new Set(
    userAchievements
      .filter((ua) => ua.achievement.platform === 'PSN')
      .map((ua) => ua.achievement.gameId),
  );

  // Obtener todos los achievements PSN de los juegos (no solo los desbloqueados)
  // para saber si el juego tiene un trofeo platino
  const psnAllAchievements = psnGameIds.size > 0
    ? await prisma.achievement.findMany({
        where: { gameId: { in: Array.from(psnGameIds) }, platform: 'PSN' },
        select: { gameId: true, normalizedPoints: true },
      })
    : [];

  // Map gameId → ¿tiene trofeo platino disponible? (algún achievement con 300 pts)
  const psnHasPlatinumMap = new Map<string, boolean>();
  for (const ach of psnAllAchievements) {
    if (ach.normalizedPoints === 300) {
      psnHasPlatinumMap.set(ach.gameId, true);
    }
  }

  // Map gameId → ¿el usuario ha ganado el platino?
  const psnEarnedPlatinumMap = new Map<string, boolean>();
  for (const ua of userAchievements) {
    if (ua.achievement.platform === 'PSN' && ua.achievement.normalizedPoints === 300) {
      psnEarnedPlatinumMap.set(ua.achievement.gameId, true);
    }
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
      lastActivityAt: Date | null;
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
        lastActivityAt: ua.unlockedAt,
      });
    } else {
      entry.earnedAchievements++;
      // Mantener el MAX(unlockedAt) para reflejar la actividad más reciente por juego
      if (ua.unlockedAt > (entry.lastActivityAt ?? new Date(0))) {
        entry.lastActivityAt = ua.unlockedAt;
      }
    }
  }

  const allGames: LibraryGame[] = Array.from(gameMap.values()).map((g) => {
    const isCompleted =
      g.totalAchievements > 0 && g.earnedAchievements === g.totalAchievements;
    const hasPlatinum = g.platform === 'PSN' ? (psnHasPlatinumMap.get(g.id) ?? false) : false;
    const platinumEarned = g.platform === 'PSN' ? (psnEarnedPlatinumMap.get(g.id) ?? false) : false;

    return {
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
      lastActivityAt: g.lastActivityAt?.toISOString() ?? null,
      hasPlatinum,
      platinumEarned,
      isCompleted,
    };
  });

  // Aggregate stats sobre todos los juegos (antes de paginar) — BUG-10
  const totalEarnedAchievements = allGames.reduce((sum, g) => sum + g.earnedAchievements, 0);
  const totalAvailableAchievements = allGames.reduce((sum, g) => sum + g.totalAchievements, 0);
  const totalGames = allGames.length;
  const totalCompletedGames = allGames.filter((g) => g.isCompleted).length;

  const sorted = allGames.sort((a, b) => a.title.localeCompare(b.title));

  const total = sorted.length;
  const start = (page - 1) * limit;
  const data = sorted.slice(start, start + limit);

  return {
    data, total, page, limit,
    totalEarnedAchievements, totalAvailableAchievements,
    totalGames, totalCompletedGames,
  };
}

// Devuelve los achievementIds ganados por el usuario en un juego específico.
// Usado para mostrar el estado Desbloqueado/Pendiente en la pantalla de logros.
export async function getMyGameAchievements(
  userId: string,
  gameId: string,
): Promise<{ achievementId: string; unlockedAt: string }[]> {
  const earned = await prisma.userAchievement.findMany({
    where: { userId, achievement: { gameId } },
    select: { achievementId: true, unlockedAt: true },
  });
  return earned.map((e) => ({
    achievementId: e.achievementId,
    unlockedAt: e.unlockedAt.toISOString(),
  }));
}

// Compara el perfil del usuario autenticado con otro usuario por username.
export async function compareProfiles(
  myUserId: string,
  targetUsername: string,
): Promise<{
  targetUser: { username: string; level: number; xp: number; avatar: string | null };
  xpDiff: number;
  sharedAchievementCount: number;
  sharedGameCount: number;
}> {
  const targetUser = await prisma.user.findUnique({
    where: { username: targetUsername },
    select: { id: true, username: true, level: true, xp: true, avatar: true },
  });
  if (!targetUser) throw new AppError('Usuario no encontrado', 'USER_NOT_FOUND', 404);

  const myUser = await prisma.user.findUnique({
    where: { id: myUserId },
    select: { xp: true },
  });
  if (!myUser) throw new AppError('Usuario no encontrado', 'USER_NOT_FOUND', 404);

  const [myAchievements, theirAchievements] = await Promise.all([
    prisma.userAchievement.findMany({
      where: { userId: myUserId },
      select: { achievementId: true, achievement: { select: { gameId: true } } },
    }),
    prisma.userAchievement.findMany({
      where: { userId: targetUser.id },
      select: { achievementId: true, achievement: { select: { gameId: true } } },
    }),
  ]);

  const myAchievementIds = new Set(myAchievements.map((a) => a.achievementId));
  const myGameIds = new Set(myAchievements.map((a) => a.achievement.gameId));
  const theirGameIds = new Set(theirAchievements.map((a) => a.achievement.gameId));

  const sharedAchievementCount = theirAchievements.filter((a) =>
    myAchievementIds.has(a.achievementId),
  ).length;

  const sharedGameCount = [...theirGameIds].filter((id) => myGameIds.has(id)).length;

  return {
    targetUser: {
      username: targetUser.username,
      level: targetUser.level,
      xp: targetUser.xp,
      avatar: targetUser.avatar,
    },
    xpDiff: myUser.xp - targetUser.xp,
    sharedAchievementCount,
    sharedGameCount,
  };
}

// Elimina la cuenta del usuario y todos sus datos asociados.
// El cascade en Prisma borra automáticamente PlatformAccount, UserAchievement,
// Friendship, ActivityEvent, UserPoint, Subscription, DeviceToken y RefreshToken.
// También limpia las puntuaciones del usuario en todos los Sorted Sets de Redis.
export async function deleteAccount(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { platformAccounts: { select: { platform: true } } },
  });
  if (!user) throw new AppError('Usuario no encontrado', 'USER_NOT_FOUND', 404);

  const platforms = user.platformAccounts.map((a) => a.platform);

  // Limpiar Redis antes de borrar BD para evitar datos huérfanos si falla la transacción
  await removeUserFromRankings(userId, user.countryCode, platforms);

  await prisma.$transaction([
    prisma.user.delete({ where: { id: userId } }),
  ]);
}

// Sube un avatar a Cloudinary y actualiza el campo avatar del usuario
export async function uploadAvatar(userId: string, fileBuffer: Buffer, mimetype: string): Promise<User> {
  const dataUri = `data:${mimetype};base64,${fileBuffer.toString('base64')}`;

  const result = await cloudinary.uploader.upload(dataUri, {
    folder: 'unlockhub/avatars',
    public_id: `user_${userId}`,
    overwrite: true,
    transformation: [{ width: 256, height: 256, crop: 'fill', gravity: 'face' }],
  });

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { avatar: result.secure_url },
  });

  return mapUser(updated);
}
