import { prisma } from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';
import { logger } from '../lib/logger';
import {
  fetchSteamAchievementDefinitions,
} from '../platforms/steam.adapter';
import {
  fetchRaAchievementDefinitions,
} from '../platforms/retroachievements.adapter';

const FETCH_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 horas

export interface FetchAchievementsResult {
  achievementsAdded: number;
}

/**
 * Obtiene y persiste las definiciones de logros de un juego con totalAchievements === 0.
 * Guard: si el juego ya tiene logros y fue actualizado en las últimas 24h, devuelve 0 (idempotente).
 * Soporta Steam y RA. PSN devuelve 0 (los logros PSN siempre llegan desde sync).
 */
export async function fetchAndUpsertGameAchievements(
  gameId: string,
): Promise<FetchAchievementsResult> {
  const game = await prisma.game.findUnique({
    where: { id: gameId },
    select: {
      id: true,
      platform: true,
      externalId: true,
      title: true,
      totalAchievements: true,
      updatedAt: true,
    },
  });

  if (!game) {
    throw new AppError('Juego no encontrado', 'GAME_NOT_FOUND', 404);
  }

  // Guard de idempotencia: si ya tiene logros y la última actualización fue reciente, no re-fetchear
  const isRecent = Date.now() - game.updatedAt.getTime() < FETCH_COOLDOWN_MS;
  if (game.totalAchievements > 0 && isRecent) {
    return { achievementsAdded: 0 };
  }

  if (game.platform === 'XBOX') {
    throw new AppError('Xbox no soportado hasta Fase 4', 'PLATFORM_NOT_SUPPORTED', 400);
  }

  if (game.platform === 'PSN') {
    // PSN: los logros siempre llegan desde sync del usuario — no hay fetch on-demand sin cuenta
    return { achievementsAdded: 0 };
  }

  try {
    if (game.platform === 'STEAM') {
      return await fetchAndPersistSteamAchievements(game.id, game.externalId);
    }
    if (game.platform === 'RA') {
      return await fetchAndPersistRaAchievements(game.id, game.externalId);
    }
  } catch (err) {
    logger.warn(
      { gameId, platform: game.platform, err },
      '[games.service] fetchAndUpsertGameAchievements: error al obtener logros',
    );
    throw err;
  }

  return { achievementsAdded: 0 };
}

async function fetchAndPersistSteamAchievements(
  dbGameId: string,
  appId: string,
): Promise<FetchAchievementsResult> {
  const definitions = await fetchSteamAchievementDefinitions(appId);
  if (definitions.length === 0) return { achievementsAdded: 0 };

  let added = 0;
  for (const def of definitions) {
    await prisma.achievement.upsert({
      where: {
        platform_gameId_externalId: {
          platform: 'STEAM',
          gameId: dbGameId,
          externalId: def.externalId,
        },
      },
      create: {
        gameId: dbGameId,
        platform: 'STEAM',
        externalId: def.externalId,
        title: def.title,
        description: def.description,
        iconUrl: def.iconUrl,
        rawValue: def.rarity,
        normalizedPoints: def.normalizedPoints,
        rarity: def.rarity,
        externalUrl: `https://store.steampowered.com/app/${appId}`,
      },
      update: {
        title: def.title,
        description: def.description,
        iconUrl: def.iconUrl,
        rawValue: def.rarity,
        normalizedPoints: def.normalizedPoints,
        rarity: def.rarity,
      },
    });
    added++;
  }

  await prisma.game.update({
    where: { id: dbGameId },
    data: { totalAchievements: definitions.length },
  });

  return { achievementsAdded: added };
}

async function fetchAndPersistRaAchievements(
  dbGameId: string,
  gameExternalId: string,
): Promise<FetchAchievementsResult> {
  const definitions = await fetchRaAchievementDefinitions(gameExternalId);
  if (definitions.length === 0) return { achievementsAdded: 0 };

  let added = 0;
  for (const def of definitions) {
    await prisma.achievement.upsert({
      where: {
        platform_gameId_externalId: {
          platform: 'RA',
          gameId: dbGameId,
          externalId: def.externalId,
        },
      },
      create: {
        gameId: dbGameId,
        platform: 'RA',
        externalId: def.externalId,
        title: def.title,
        description: def.description,
        iconUrl: def.iconUrl,
        rawValue: def.rawValue,
        normalizedPoints: def.normalizedPoints,
        rarity: null,
        externalUrl: `https://retroachievements.org/achievement/${def.externalId}`,
      },
      update: {
        title: def.title,
        description: def.description,
        iconUrl: def.iconUrl,
        rawValue: def.rawValue,
        normalizedPoints: def.normalizedPoints,
        externalUrl: `https://retroachievements.org/achievement/${def.externalId}`,
      },
    });
    added++;
  }

  await prisma.game.update({
    where: { id: dbGameId },
    data: { totalAchievements: definitions.length },
  });

  return { achievementsAdded: added };
}
