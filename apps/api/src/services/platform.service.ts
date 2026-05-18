import type { Platform, PlatformAccount } from '@unlockhub/types';

import { AppError } from '../middleware/errorHandler';
import { prisma } from '../lib/prisma';
import { encrypt } from '../lib/crypto';
import { scheduleAutoSync, cancelAutoSync } from '../jobs/sync.scheduler';

import { removeUserFromRankings } from './ranking.service';

// Transforma una cuenta de plataforma de Prisma al tipo compartido (sin token cifrado)
function mapPlatformAccount(dbAccount: {
  id: string;
  userId: string;
  platform: string;
  externalId: string;
  username: string;
  lastSyncedAt: Date | null;
  requiresReauth: boolean;
}): PlatformAccount {
  return {
    id: dbAccount.id,
    userId: dbAccount.userId,
    platform: dbAccount.platform as Platform,
    externalId: dbAccount.externalId,
    username: dbAccount.username,
    lastSyncedAt: dbAccount.lastSyncedAt?.toISOString() ?? null,
    requiresReauth: dbAccount.requiresReauth,
  };
}

// Vincula una plataforma externa al usuario — cifra el token antes de persistir
export async function linkPlatform(
  userId: string,
  platform: Platform,
  externalId: string,
  username: string,
  rawToken: string,
): Promise<PlatformAccount> {
  // Verificar que el usuario existe
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, isPremium: true },
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
      'Esta cuenta de plataforma ya está vinculada a otro usuario',
      'PLATFORM_ACCOUNT_TAKEN',
      409,
    );
  }

  // Cifrar el token antes de persistir — nunca en texto plano
  const encryptedToken = encrypt(rawToken);

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
    },
    update: {
      externalId,
      username,
      encryptedToken,
      requiresReauth: false,
    },
    select: {
      id: true,
      userId: true,
      platform: true,
      externalId: true,
      username: true,
      lastSyncedAt: true,
      requiresReauth: true,
    },
  });

  // Al vincular una plataforma, resetear requiresReauth (nueva vinculación limpia el estado)
  // Programar el sync automático para esta plataforma
  await scheduleAutoSync(userId, dbAccount.id, platform, user.isPremium);

  return mapPlatformAccount(dbAccount);
}

// Desvincula una plataforma del usuario y cancela los syncs automáticos
export async function unlinkPlatform(userId: string, platform: Platform): Promise<void> {
  const dbAccount = await prisma.platformAccount.findFirst({
    where: { userId, platform },
    select: { id: true },
  });

  if (!dbAccount) {
    throw new AppError('La plataforma no está vinculada a este usuario', 'PLATFORM_NOT_LINKED', 404);
  }

  await prisma.platformAccount.delete({ where: { id: dbAccount.id } });

  // Cancelar el sync automático para esta plataforma
  await cancelAutoSync(userId, platform);

  // Obtener datos del usuario para actualizar el ranking de Redis
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { xp: true, countryCode: true },
  });

  // Eliminar al usuario del ranking específico de esta plataforma en Redis
  if (user) {
    await removeUserFromRankings(userId, user.countryCode, [platform]);
  }
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
    },
  });

  return dbAccounts.map(mapPlatformAccount);
}
