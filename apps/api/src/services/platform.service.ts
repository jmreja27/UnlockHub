import type { Platform, PlatformAccount } from '@unlockhub/types';

import { AppError } from '../middleware/errorHandler';
import { prisma } from '../lib/prisma';
import { encrypt } from '../lib/crypto';
import { scheduleAutoSync, cancelAutoSync } from '../jobs/sync.scheduler';

import { removeUserFromRankings, upsertUserScore } from './ranking.service';
import { calculateLevel } from './user.service';

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
    platform: dbAccount.platform as Platform,
    externalId: dbAccount.externalId,
    username: dbAccount.username,
    lastSyncedAt: dbAccount.lastSyncedAt?.toISOString() ?? null,
    requiresReauth: dbAccount.requiresReauth,
    psnProfilePrivate: dbAccount.psnProfilePrivate,
  };
}

// Vincula una plataforma externa al usuario — cifra el token antes de persistir
export async function linkPlatform(
  userId: string,
  platform: Platform,
  externalId: string,
  username: string,
  rawToken: string,
  options?: { psnProfilePrivate?: boolean },
): Promise<PlatformAccount> {
  // Verificar que el usuario existe
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, isPremium: true, xp: true, countryCode: true },
  });

  if (!user) {
    throw new AppError('Usuario no encontrado', 'USER_NOT_FOUND', 404);
  }

  // Verificar que la plataforma no está ya vinculada por otro usuario con el mismo externalId
  const existingAccount = await prisma.platformAccount.findFirst({
    where: { platform, externalId, userId: { not: userId } },
  });

  if (existingAccount) {
    throw new AppError(
      'Esta cuenta ya está vinculada a otro usuario de UnlockHub',
      'PLATFORM_ACCOUNT_ALREADY_LINKED',
      409,
    );
  }

  // Cifrar el token antes de persistir — nunca en texto plano
  const encryptedToken = encrypt(rawToken);

  const psnProfilePrivate = options?.psnProfilePrivate ?? false;

  // Upsert: si ya existe la vinculación para este usuario y plataforma, actualizar
  const dbAccount = await prisma.platformAccount.upsert({
    where: {
      userId_platform: { userId, platform },
    },
    create: {
      userId,
      platform,
      externalId,
      username,
      encryptedToken,
      psnProfilePrivate,
    },
    update: {
      externalId,
      username,
      encryptedToken,
      requiresReauth: false,
      psnProfilePrivate,
    },
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
  });

  // Al vincular una plataforma, resetear requiresReauth (nueva vinculación limpia el estado)
  // Programar el sync automático para esta plataforma
  await scheduleAutoSync(userId, dbAccount.id, platform, user.isPremium);

  // Añadir al usuario en el sorted set de esta plataforma para que aparezca en rankings
  // inmediatamente, incluso antes de que el primer sync complete
  const allPlatforms = await prisma.platformAccount.findMany({
    where: { userId },
    select: { platform: true },
  });
  await upsertUserScore(
    userId,
    user.xp,
    allPlatforms.map((p) => p.platform),
  );

  return mapPlatformAccount(dbAccount);
}

export interface UnlinkResult {
  deletedAchievements: number;
}

// Desvincula una plataforma del usuario, borra sus logros en esa plataforma y actualiza XP
export async function unlinkPlatform(
  userId: string,
  platform: Platform,
): Promise<UnlinkResult> {
  const dbAccount = await prisma.platformAccount.findFirst({
    where: { userId, platform },
    select: { id: true },
  });

  if (!dbAccount) {
    throw new AppError('La plataforma no está vinculada a este usuario', 'PLATFORM_NOT_LINKED', 404);
  }

  // Transacción atómica: borrar logros → borrar cuenta → actualizar XP
  const { deletedAchievements, newXp } = await prisma.$transaction(
    async (tx) => {
      // 1. Obtener los logros del usuario en esta plataforma para calcular XP a restar
      const toDelete = await tx.userAchievement.findMany({
        where: {
          userId,
          achievement: { platform },
        },
        include: {
          achievement: { select: { normalizedPoints: true } },
        },
      });

      const xpToRemove = toDelete.reduce(
        (sum, ua) => sum + ua.achievement.normalizedPoints,
        0,
      );
      const count = toDelete.length;

      // 2. Borrar UserAchievements de esta plataforma
      await tx.userAchievement.deleteMany({
        where: {
          userId,
          achievement: { platform },
        },
      });

      // 3. Borrar la PlatformAccount
      await tx.platformAccount.delete({ where: { id: dbAccount.id } });

      // 4. Actualizar XP y nivel del usuario si había logros que restaban XP
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { xp: true },
      });

      const currentXp = user?.xp ?? 0;
      const updatedXp = Math.max(0, currentXp - xpToRemove);
      const updatedLevel = calculateLevel(updatedXp);

      await tx.user.update({
        where: { id: userId },
        data: { xp: updatedXp, level: updatedLevel },
      });

      return {
        deletedAchievements: count,
        newXp: updatedXp,
        newLevel: updatedLevel,
      };
    },
  );

  // Cancelar el sync automático para esta plataforma
  await cancelAutoSync(userId, platform);

  // Eliminar al usuario del ranking de esta plataforma y actualizar su puntuación global
  await removeUserFromRankings(userId, [platform]);

  // Obtener plataformas restantes para recalcular el score global con el XP actualizado
  const remainingPlatforms = await prisma.platformAccount.findMany({
    where: { userId },
    select: { platform: true },
  });

  await upsertUserScore(
    userId,
    newXp,
    remainingPlatforms.map((p) => p.platform as Platform),
  );

  return { deletedAchievements };
}

// Devuelve todas las plataformas vinculadas al usuario (sin tokens cifrados)
export async function getLinkedPlatforms(userId: string): Promise<PlatformAccount[]> {
  const dbAccounts = await prisma.platformAccount.findMany({
    where: { userId },
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
  });

  return dbAccounts.map(mapPlatformAccount);
}
