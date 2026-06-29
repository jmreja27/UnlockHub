import type { User, PublicUser, PlatformAccount, PointReason, Platform, ProfileVisibility } from '@unlockhub/types';
import type { ProfileVisibility as PrismaProfileVisibility } from '@prisma/client';

import { AppError } from '../middleware/errorHandler';
import { prisma } from '../lib/prisma';
import { redis } from '../lib/redis';
import { cloudinary } from '../lib/cloudinary';

import { upsertUserScore, removeUserFromRankings } from './ranking.service';
import { cancelAutoSync } from '../jobs/sync.scheduler';

const USER_GAMES_CACHE_TTL = 300; // 5 minutos
const USER_GAMES_KEYS_SET = (userId: string) => `user-cache-keys:${userId}`;
const userGamesCacheKey = (username: string, platform: string, page: number, limit: number) =>
  `user-games:${username}:${platform}:${page}:${limit}`;
const userGameAchCacheKey = (username: string, gameId: string, requestingUserId: string) =>
  `user-game-ach:${username}:${gameId}:${requestingUserId}`;

/**
 * Invalida toda la caché pública del usuario (juegos y logros de sus juegos).
 * Llamar tras un sync exitoso o al cambiar la visibilidad del perfil.
 */
export async function invalidateUserPublicCache(userId: string): Promise<void> {
  const keys = await redis.smembers(USER_GAMES_KEYS_SET(userId));
  if (keys.length > 0) {
    await redis.del(...keys);
  }
  await redis.del(USER_GAMES_KEYS_SET(userId));
}

// XP necesario por nivel — cada 1000 XP sube un nivel, máximo nivel 100
export const XP_PER_LEVEL = 1000;
export const MAX_LEVEL = 100;

/**
 * Calcula el nivel del usuario en función de su XP acumulado.
 * Fórmula: floor(xp / 1000) + 1, mínimo nivel 1, máximo nivel 100.
 */
export function calculateLevel(xp: number): number {
  return Math.min(Math.max(1, Math.floor(Math.max(0, xp) / XP_PER_LEVEL) + 1), MAX_LEVEL);
}

/**
 * Transforma el usuario de Prisma al tipo PublicUser compartido.
 * Excluye email, isPremium, premiumUntil y lastSyncAt — campos privados que no
 * deben exponerse en perfiles públicos no autenticados.
 */
function mapPublicUser(dbUser: {
  id: string;
  username: string;
  avatar: string | null;
  banner: string | null;
  bio: string | null;
  level: number;
  xp: number;
  streakDays: number;
  countryCode: string | null;
  profileVisibility: string;
  createdAt: Date;
}): PublicUser {
  return {
    id: dbUser.id,
    username: dbUser.username,
    avatar: dbUser.avatar,
    banner: dbUser.banner,
    bio: dbUser.bio,
    level: dbUser.level,
    xp: dbUser.xp,
    streakDays: dbUser.streakDays,
    countryCode: dbUser.countryCode,
    profileVisibility: dbUser.profileVisibility as ProfileVisibility,
    createdAt: dbUser.createdAt.toISOString(),
  };
}

/**
 * Transforma el usuario de Prisma al tipo User compartido (incluye email).
 * Solo usar para el perfil propio autenticado — nunca para perfiles públicos.
 */
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
  profileVisibility: string;
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
    profileVisibility: dbUser.profileVisibility as ProfileVisibility,
    createdAt: dbUser.createdAt.toISOString(),
  };
}

/**
 * Transforma una cuenta de plataforma de Prisma al tipo PlatformAccount compartido.
 * Omite el campo encryptedToken para no exponer tokens AES-256 en respuestas de la API.
 */
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

/**
 * Obtiene el perfil completo del usuario autenticado, incluyendo sus cuentas de plataforma.
 * Usa mapUser (con email) — solo para uso interno con sesión activa.
 * @throws {AppError} USER_NOT_FOUND (404) si el userId no existe.
 */
export async function getProfile(
  userId: string,
): Promise<User & { platformAccounts: PlatformAccount[] }> {
  const dbUser = await prisma.user.findUnique({
    where: { id: userId, deletedAt: null },
    select: {
      id: true, username: true, email: true, avatar: true, banner: true, bio: true,
      level: true, xp: true, streakDays: true, countryCode: true,
      isPremium: true, premiumUntil: true, lastSyncAt: true,
      profileVisibility: true, createdAt: true,
      platformAccounts: {
        select: {
          id: true, userId: true, platform: true, externalId: true, username: true,
          lastSyncedAt: true, requiresReauth: true, psnProfilePrivate: true,
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

/**
 * Obtiene el perfil público de un usuario por su username.
 * Usa mapPublicUser para excluir email y campos privados — seguro para respuestas no autenticadas.
 * Filtra usuarios con soft delete (deletedAt !== null) para cumplir GDPR.
 * Respeta la configuración de privacidad del perfil:
 * - PRIVATE → 404 (indistinguible de "no existe" por privacidad)
 * - FRIENDS_ONLY → 403 si el solicitante no es amigo aceptado
 * @throws {AppError} USER_NOT_FOUND (404) si el username no existe, está eliminado, o el perfil es PRIVATE.
 * @throws {AppError} PROFILE_FRIENDS_ONLY (403) si el perfil es FRIENDS_ONLY y el solicitante no es amigo.
 */
export async function getPublicProfile(
  username: string,
  requestingUserId?: string,
): Promise<PublicUser & { platformAccounts: PlatformAccount[] }> {
  const dbUser = await prisma.user.findUnique({
    where: { username, deletedAt: null },
    select: {
      id: true, username: true, avatar: true, banner: true, bio: true,
      level: true, xp: true, streakDays: true, countryCode: true,
      profileVisibility: true, createdAt: true,
      platformAccounts: {
        select: {
          id: true, userId: true, platform: true, externalId: true, username: true,
          lastSyncedAt: true, requiresReauth: true, psnProfilePrivate: true,
        },
      },
    },
  });

  if (!dbUser) {
    throw new AppError('Usuario no encontrado', 'USER_NOT_FOUND', 404);
  }

  // No devolver 404 vs 403 por perfil privado — mismo mensaje que "no existe" para no filtrar info
  if (dbUser.profileVisibility === 'PRIVATE') {
    throw new AppError('Usuario no encontrado', 'USER_NOT_FOUND', 404);
  }

  if (dbUser.profileVisibility === 'FRIENDS_ONLY') {
    if (!requestingUserId || requestingUserId === dbUser.id) {
      // Permite al propio usuario ver su perfil; visitantes no autenticados reciben 403
      if (!requestingUserId) {
        throw new AppError('Este perfil solo es visible para amigos', 'PROFILE_FRIENDS_ONLY', 403);
      }
    } else {
      // Verificar que existe amistad ACCEPTED entre los dos usuarios
      const friendship = await prisma.friendship.findFirst({
        where: {
          OR: [
            { senderId: requestingUserId, receiverId: dbUser.id },
            { senderId: dbUser.id, receiverId: requestingUserId },
          ],
          status: 'ACCEPTED',
        },
        select: { id: true },
      });
      if (!friendship) {
        throw new AppError('Este perfil solo es visible para amigos', 'PROFILE_FRIENDS_ONLY', 403);
      }
    }
  }

  return {
    ...mapPublicUser(dbUser),
    platformAccounts: dbUser.platformAccounts.map(mapPlatformAccount),
  };
}

/**
 * Obtiene los datos mínimos necesarios para generar el HTML Open Graph de un perfil.
 * Devuelve null si el usuario no existe, está eliminado (soft delete) o su perfil es PRIVATE.
 * Los perfiles FRIENDS_ONLY exponen datos básicos — el OG tag es para crawlers de redes sociales.
 */
export async function getOgProfileData(username: string): Promise<{
  username: string;
  level: number;
  xp: number;
  avatar: string | null;
  totalAchievements: number;
} | null> {
  const dbUser = await prisma.user.findUnique({
    where: { username, deletedAt: null },
    select: { id: true, username: true, level: true, xp: true, avatar: true, profileVisibility: true },
  });

  if (!dbUser || dbUser.profileVisibility === 'PRIVATE') return null;

  const totalAchievements = await prisma.userAchievement.count({ where: { userId: dbUser.id } });

  return { username: dbUser.username, level: dbUser.level, xp: dbUser.xp, avatar: dbUser.avatar, totalAchievements };
}

/**
 * Actualiza campos editables del perfil del usuario (bio, avatar, banner, countryCode, profileVisibility).
 * Cuando profileVisibility cambia, sincroniza los sorted sets de Redis en consecuencia:
 * - A no-PUBLIC → removeUserFromRankings (el usuario deja de aparecer en rankings)
 * - A PUBLIC → upsertUserScore (el usuario vuelve a los rankings)
 */
export async function updateProfile(
  userId: string,
  data: { bio?: string; avatar?: string; banner?: string; countryCode?: string; profileVisibility?: PrismaProfileVisibility },
): Promise<User> {
  const previousUser = data.profileVisibility !== undefined
    ? await prisma.user.findUnique({
        where: { id: userId },
        select: { xp: true, profileVisibility: true },
      })
    : null;

  const dbUser = await prisma.user.update({
    where: { id: userId },
    data,
  });

  // Sincronizar rankings Redis si cambió la visibilidad del perfil
  if (data.profileVisibility !== undefined && previousUser && data.profileVisibility !== previousUser.profileVisibility) {
    const platforms = await prisma.platformAccount.findMany({
      where: { userId },
      select: { platform: true },
    });
    const platformList = platforms.map((p) => p.platform);

    if (data.profileVisibility === 'PUBLIC') {
      await upsertUserScore(userId, dbUser.xp, platformList, 'PUBLIC');
    } else {
      await removeUserFromRankings(userId, platformList);
    }
    // Visibilidad cambiada — invalidar caché pública para que los nuevos permisos surtan efecto
    await invalidateUserPublicCache(userId);
  }

  return mapUser(dbUser);
}

/**
 * Añade XP al usuario, recalcula su nivel y actualiza los sorted sets de ranking en Redis.
 * Crea un registro en UserPoint (historial auditable de puntos).
 * La actualización de usuario y UserPoint se hace en una sola transacción Prisma.
 * @param userId - ID del usuario en Prisma
 * @param amount - Cantidad de XP a añadir (positivo)
 * @param reason - Motivo del XP (para auditoría — PointReason)
 * @throws {AppError} USER_NOT_FOUND (404) si el userId no existe.
 */
export async function addXp(
  userId: string,
  amount: number,
  reason: PointReason,
): Promise<{ newXp: number; newLevel: number; leveledUp: boolean }> {
  const dbUser = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      level: true, xp: true, profileVisibility: true,
    },
  });

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

  // Actualizar el ranking en Redis tras el cambio de XP (respeta visibilidad del perfil)
  const platforms = await prisma.platformAccount.findMany({
    where: { userId },
    select: { platform: true },
  });

  await upsertUserScore(
    userId,
    newXp,
    platforms.map((p) => p.platform),
    dbUser.profileVisibility,
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

  // Orden por defecto: actividad más reciente primero (MAX unlockedAt del juego).
  // La biblioteca propia re-ordena en cliente; la pública muestra este orden directamente.
  const sorted = allGames.sort((a, b) => {
    const aDate = a.lastActivityAt ? new Date(a.lastActivityAt).getTime() : 0;
    const bDate = b.lastActivityAt ? new Date(b.lastActivityAt).getTime() : 0;
    return bDate - aDate;
  });

  const total = sorted.length;
  const start = (page - 1) * limit;
  const data = sorted.slice(start, start + limit);

  return {
    data, total, page, limit,
    totalEarnedAchievements, totalAvailableAchievements,
    totalGames, totalCompletedGames,
  };
}

/**
 * Devuelve los logros ganados por el usuario en un juego específico.
 * Usado para mostrar el estado Desbloqueado/Pendiente en la pantalla de detalle de juego.
 * @param userId - ID del usuario autenticado
 * @param gameId - ID interno del juego en Prisma (no el externalId de la plataforma)
 */
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

/**
 * Compara el perfil del usuario autenticado con el de otro usuario.
 * Calcula logros y juegos compartidos, y la diferencia de XP.
 * @throws {AppError} USER_NOT_FOUND (404) si el targetUsername no existe o está eliminado.
 */
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
    where: { username: targetUsername, deletedAt: null },
    select: { id: true, username: true, level: true, xp: true, avatar: true, profileVisibility: true },
  });
  if (!targetUser) throw new AppError('Usuario no encontrado', 'USER_NOT_FOUND', 404);

  // Respetar la privacidad del perfil objetivo
  if (targetUser.profileVisibility === 'PRIVATE') {
    throw new AppError('Usuario no encontrado', 'USER_NOT_FOUND', 404);
  }
  if (targetUser.profileVisibility === 'FRIENDS_ONLY') {
    const friendship = await prisma.friendship.findFirst({
      where: {
        OR: [
          { senderId: myUserId, receiverId: targetUser.id },
          { senderId: targetUser.id, receiverId: myUserId },
        ],
        status: 'ACCEPTED',
      },
      select: { id: true },
    });
    if (!friendship) {
      throw new AppError('Este perfil solo es visible para amigos', 'PROFILE_FRIENDS_ONLY', 403);
    }
  }

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

// Aplica el flujo de borrado GDPR especificado en CLAUDE.md:
// 1. Soft delete: User.deletedAt = now() — el usuario no puede hacer login
// 2. Anonimizar: ActivityEvent.payload → {}
// 3. Eliminar: PlatformAccount y PasswordResetToken
// 4. Mantener: UserPoint y UserChallenge (auditoría de puntos)
// 5. El borrado físico lo ejecuta gdpr-cleanup.scheduler a los 30 días
export async function deleteAccount(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { platformAccounts: { select: { platform: true } } },
  });
  if (!user) throw new AppError('Usuario no encontrado', 'USER_NOT_FOUND', 404);

  const platforms = user.platformAccounts.map((a) => a.platform);

  await prisma.$transaction(async (tx) => {
    // 1. Soft delete — impide login inmediatamente
    await tx.user.update({
      where: { id: userId },
      data: { deletedAt: new Date() },
    });

    // 2. Anonimizar eventos de actividad
    await tx.activityEvent.updateMany({
      where: { userId },
      data: { payload: {} },
    });

    // 3. Eliminar cuentas de plataforma y tokens de reset de contraseña
    await tx.platformAccount.deleteMany({ where: { userId } });
    await tx.passwordResetToken.deleteMany({ where: { userId } });
    // 4. Revocar todos los refresh tokens — el usuario no debe poder obtener nuevos access tokens
    await tx.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    // UserPoint y UserChallenge se mantienen para integridad de auditoría
  });

  // Limpiar Redis fuera de la transacción (no admite operaciones externas)
  await Promise.all([
    removeUserFromRankings(userId, platforms),
    invalidateUserPublicCache(userId),
    ...platforms.map((p) => cancelAutoSync(userId, p)),
  ]);
}

/**
 * Sube un avatar a Cloudinary y actualiza el campo avatar del usuario en BD.
 * La imagen se redimensiona a 256×256 con crop/fill y detección de cara (gravity: face).
 * Requiere CLOUDINARY_URL en el entorno — el SDK lee la variable automáticamente.
 */
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

// Verifica que el solicitante puede acceder al perfil según su visibilidad.
// Comportamiento espejo de getPublicProfile — no lanza si el usuario visita su propio perfil.
async function checkProfileVisibility(
  dbUser: { id: string; profileVisibility: string },
  requestingUserId?: string,
): Promise<void> {
  if (dbUser.profileVisibility === 'PRIVATE') {
    throw new AppError('Usuario no encontrado', 'USER_NOT_FOUND', 404);
  }
  if (dbUser.profileVisibility === 'FRIENDS_ONLY') {
    if (!requestingUserId) {
      throw new AppError('Este perfil solo es visible para amigos', 'PROFILE_FRIENDS_ONLY', 403);
    }
    if (requestingUserId !== dbUser.id) {
      const friendship = await prisma.friendship.findFirst({
        where: {
          OR: [
            { senderId: requestingUserId, receiverId: dbUser.id },
            { senderId: dbUser.id, receiverId: requestingUserId },
          ],
          status: 'ACCEPTED',
        },
        select: { id: true },
      });
      if (!friendship) {
        throw new AppError('Este perfil solo es visible para amigos', 'PROFILE_FRIENDS_ONLY', 403);
      }
    }
  }
}

/**
 * Devuelve la biblioteca de juegos de un usuario público con privacidad respetada.
 * Comportamiento equivalente a getMyGames, pero resuelve username → userId y aplica
 * los mismos checks de visibilidad que getPublicProfile.
 * @throws {AppError} USER_NOT_FOUND (404) si el usuario no existe, está eliminado o su perfil es PRIVATE.
 * @throws {AppError} PROFILE_FRIENDS_ONLY (403) si el perfil es FRIENDS_ONLY y no hay amistad.
 */
export async function getUserGames(
  username: string,
  requestingUserId?: string,
  platform?: Platform,
  page = 1,
  limit = 20,
): ReturnType<typeof getMyGames> {
  const dbUser = await prisma.user.findUnique({
    where: { username, deletedAt: null },
    select: { id: true, profileVisibility: true },
  });
  if (!dbUser) throw new AppError('Usuario no encontrado', 'USER_NOT_FOUND', 404);

  await checkProfileVisibility(dbUser, requestingUserId);

  // FRIENDS_ONLY: privacidad validada arriba; la caché es segura porque el check siempre corre primero
  const cacheKey = userGamesCacheKey(username, platform ?? 'all', page, limit);
  const cached = await redis.get(cacheKey);
  if (cached) return JSON.parse(cached) as Awaited<ReturnType<typeof getMyGames>>;

  const result = await getMyGames(dbUser.id, platform, page, limit);
  await redis.set(cacheKey, JSON.stringify(result), 'EX', USER_GAMES_CACHE_TTL);
  await redis.sadd(USER_GAMES_KEYS_SET(dbUser.id), cacheKey);
  // Rotar el TTL del set de tracking cada vez que se añade una clave nueva.
  // El set puede llenarse de claves ya expiradas si nunca se invalida — este TTL limita su vida.
  await redis.expire(USER_GAMES_KEYS_SET(dbUser.id), USER_GAMES_CACHE_TTL * 4);
  return result;
}

interface AchievementWithCompareStatus {
  id: string;
  title: string;
  description: string | null;
  iconUrl: string | null;
  rarity: number | null;
  normalizedPoints: number;
  platform: string;
  externalId: string;
  externalUrl: string | null;
  isUnlocked: boolean;
  unlockedAt: string | null;
  // null cuando el solicitante no está autenticado o es el mismo usuario visitado
  isUnlockedByMe: boolean | null;
}

/**
 * Devuelve los logros de un juego concreto para un usuario público.
 * Incluye isUnlocked (estado del usuario visitado) e isUnlockedByMe (estado del solicitante).
 * Respeta la misma lógica de privacidad que getUserGames/getPublicProfile.
 * @throws {AppError} USER_NOT_FOUND (404) si el usuario no existe, está eliminado o es PRIVATE.
 * @throws {AppError} PROFILE_FRIENDS_ONLY (403) si el perfil es FRIENDS_ONLY y no hay amistad.
 * @throws {AppError} GAME_NOT_FOUND (404) si el juego no existe en la BD.
 */
export async function getUserGameAchievements(
  username: string,
  gameId: string,
  requestingUserId?: string,
): Promise<{
  game: {
    id: string;
    title: string;
    iconUrl: string | null;
    platform: string;
    totalAchievements: number;
    earnedAchievements: number;
    completionPct: number;
  };
  achievements: AchievementWithCompareStatus[];
  earnedCount: number;
  totalCount: number;
}> {
  const dbUser = await prisma.user.findUnique({
    where: { username, deletedAt: null },
    select: { id: true, profileVisibility: true },
  });
  if (!dbUser) throw new AppError('Usuario no encontrado', 'USER_NOT_FOUND', 404);

  await checkProfileVisibility(dbUser, requestingUserId);

  const game = await prisma.game.findUnique({
    where: { id: gameId },
    select: { id: true, title: true, iconUrl: true, platform: true, totalAchievements: true },
  });
  if (!game) throw new AppError('Juego no encontrado', 'GAME_NOT_FOUND', 404);

  // isUnlockedByMe varía por solicitante — clave incluye requestingUserId para datos personalizados
  const achCacheKey = userGameAchCacheKey(username, gameId, requestingUserId ?? 'anon');
  const achCached = await redis.get(achCacheKey);
  if (achCached) {
    return JSON.parse(achCached) as Awaited<ReturnType<typeof getUserGameAchievements>>;
  }

  const achievementRows = await prisma.achievement.findMany({
    where: { gameId },
    orderBy: [{ rarity: 'asc' }, { normalizedPoints: 'desc' }],
    select: {
      id: true,
      title: true,
      description: true,
      iconUrl: true,
      rarity: true,
      normalizedPoints: true,
      platform: true,
      externalId: true,
      externalUrl: true,
    },
  });

  const targetEarnedMap = new Map<string, string>();
  if (achievementRows.length > 0) {
    const targetEarned = await prisma.userAchievement.findMany({
      where: { userId: dbUser.id, achievementId: { in: achievementRows.map((a) => a.id) } },
      select: { achievementId: true, unlockedAt: true },
    });
    targetEarned.forEach((e) => targetEarnedMap.set(e.achievementId, e.unlockedAt.toISOString()));
  }

  // Logros del solicitante — solo si hay sesión activa y no es el mismo usuario visitado
  const myEarnedSet = new Set<string>();
  const canCompare = !!requestingUserId && requestingUserId !== dbUser.id;
  if (canCompare && achievementRows.length > 0) {
    const myEarned = await prisma.userAchievement.findMany({
      where: { userId: requestingUserId, achievementId: { in: achievementRows.map((a) => a.id) } },
      select: { achievementId: true },
    });
    myEarned.forEach((e) => myEarnedSet.add(e.achievementId));
  }

  const earnedCount = targetEarnedMap.size;
  const achievements: AchievementWithCompareStatus[] = achievementRows.map((a) => ({
    id: a.id,
    title: a.title,
    description: a.description,
    iconUrl: a.iconUrl,
    rarity: a.rarity,
    normalizedPoints: a.normalizedPoints,
    platform: a.platform as string,
    externalId: a.externalId,
    externalUrl: a.externalUrl,
    isUnlocked: targetEarnedMap.has(a.id),
    unlockedAt: targetEarnedMap.get(a.id) ?? null,
    isUnlockedByMe: canCompare ? myEarnedSet.has(a.id) : null,
  }));

  const result = {
    game: {
      id: game.id,
      title: game.title,
      iconUrl: game.iconUrl,
      platform: game.platform as string,
      totalAchievements: game.totalAchievements,
      earnedAchievements: earnedCount,
      completionPct:
        game.totalAchievements > 0
          ? Math.round((earnedCount / game.totalAchievements) * 100)
          : 0,
    },
    achievements,
    earnedCount,
    totalCount: achievementRows.length,
  };

  await redis.set(achCacheKey, JSON.stringify(result), 'EX', USER_GAMES_CACHE_TTL);
  await redis.sadd(USER_GAMES_KEYS_SET(dbUser.id), achCacheKey);
  await redis.expire(USER_GAMES_KEYS_SET(dbUser.id), USER_GAMES_CACHE_TTL * 4);
  return result;
}

/**
 * Sube un banner a Cloudinary y actualiza el campo banner del usuario en BD.
 * La imagen se redimensiona a 1500×500 (aspect ratio 3:1) con crop/fill.
 * @throws {AppError} USER_NOT_FOUND (404) si el userId no existe.
 */
export async function uploadBanner(userId: string, fileBuffer: Buffer, mimetype: string): Promise<User> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!user) throw new AppError('Usuario no encontrado', 'USER_NOT_FOUND', 404);

  const dataUri = `data:${mimetype};base64,${fileBuffer.toString('base64')}`;

  const result = await cloudinary.uploader.upload(dataUri, {
    folder: 'unlockhub/banners',
    public_id: `${userId}-banner`,
    overwrite: true,
    transformation: [{ width: 1500, height: 500, crop: 'fill' }],
  });

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { banner: result.secure_url },
  });

  return mapUser(updated);
}
