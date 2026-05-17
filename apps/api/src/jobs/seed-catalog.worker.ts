/**
 * Worker BullMQ para el seed periódico del catálogo de juegos y logros.
 *
 * Sincroniza los juegos más populares de Steam y RetroAchievements con la BD
 * usando upsert — nunca borra datos existentes. Diseñado para ejecutarse
 * cada 30 días desde el scheduler o bajo demanda desde el dashboard admin.
 *
 * PSN se omite aquí porque requiere NPSSO (token personal de usuario),
 * que no es almacenable de forma segura como secreto del sistema.
 */

import axios from 'axios';
import { Worker, Job } from 'bullmq';

import { createWorkerConnection } from '../lib/redis';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';

import type { SeedCatalogJobData, SeedCatalogJobResult } from './seed-catalog.queue';

// ─── Constantes ───────────────────────────────────────────────────────────────

const STEAM_API_BASE = 'https://api.steampowered.com';
const STEAM_STORE_CDN = 'https://media.steampowered.com/steamcommunity/public/images/apps';
const STEAM_HEADER_CDN = 'https://cdn.cloudflare.steamstatic.com/steam/apps';
const STEAMSPY_API = 'https://steamspy.com/api.php';
const RA_API_BASE = 'https://retroachievements.org/API';

const STEAM_DELAY_MS = 300;
const RA_DELAY_MS = 400;

const RA_CONSOLE_IDS = [7, 3, 5, 12, 2, 1, 6, 21];
const RA_GAMES_PER_CONSOLE = 50;

// ─── Tipos internos ───────────────────────────────────────────────────────────

interface SteamSpyEntry {
  appid: number;
  name: string;
}

interface SteamSchemaAchievement {
  name: string;
  displayName: string;
  description?: string;
  icon?: string;
}

interface SteamGlobalAchievementPercentage {
  name: string;
  percent: number;
}

interface RaGameListEntry {
  ID: number | string;
  Title: string;
  ImageIcon?: string;
}

interface RaAchievement {
  ID: number | string;
  Title: string;
  Description?: string;
  BadgeName?: string;
  Points?: number;
}

interface RaGameExtended {
  ID: number | string;
  Title: string;
  ImageIcon?: string;
  Achievements?: Record<string, RaAchievement>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeSteamPoints(rarityPercent: number): number {
  const raw = Math.round((1 - rarityPercent / 100) * 100);
  return Math.max(1, Math.min(100, raw));
}

function normalizeRaPoints(points: number | undefined): number {
  return Math.min(100, Math.max(1, points ?? 1));
}

// ─── Steam seed ───────────────────────────────────────────────────────────────

async function seedSteamGames(
  job: Job<SeedCatalogJobData, SeedCatalogJobResult>,
): Promise<{ gamesCreated: number; achievementsCreated: number; errors: number }> {
  const apiKey = process.env['STEAM_API_KEY'];
  if (!apiKey) {
    logger.warn('[SeedCatalog] STEAM_API_KEY no configurada — sección Steam omitida');
    return { gamesCreated: 0, achievementsCreated: 0, errors: 0 };
  }

  const appIds = new Map<string, string>();

  const steamSpyRequests = [
    'top100in2weeks',
    'top100forever',
    'genre&genre=Action',
    'genre&genre=Adventure',
    'genre&genre=RPG',
  ];

  for (const request of steamSpyRequests) {
    try {
      const resp = await axios.get<Record<string, SteamSpyEntry>>(
        `${STEAMSPY_API}?request=${request}`,
        { timeout: 15_000 },
      );
      for (const entry of Object.values(resp.data)) {
        if (entry.appid) appIds.set(String(entry.appid), entry.name ?? `Steam ${entry.appid}`);
      }
      await delay(500);
    } catch {
      // SteamSpy puede fallar — continuar con los demás
    }
  }

  logger.info({ count: appIds.size }, '[SeedCatalog] Steam: apps a procesar');

  let gamesCreated = 0;
  let achievementsCreated = 0;
  let errors = 0;
  let processed = 0;

  for (const [appId, appName] of appIds) {
    processed++;
    if (processed % 25 === 0) {
      await job.updateProgress(Math.round((processed / appIds.size) * 50)); // Steam = 0-50%
      logger.info(
        { processed, total: appIds.size, gamesCreated, achievementsCreated },
        '[SeedCatalog] Steam progreso',
      );
    }

    try {
      const schemaResp = await axios.get<{
        game?: { availableGameStats?: { achievements?: SteamSchemaAchievement[] } };
      }>(
        `${STEAM_API_BASE}/ISteamUserStats/GetSchemaForGame/v2/`,
        {
          params: { key: apiKey, appid: appId, format: 'json' },
          timeout: 10_000,
        },
      );
      await delay(STEAM_DELAY_MS);

      const achievements = schemaResp.data.game?.availableGameStats?.achievements;
      if (!achievements || achievements.length === 0) continue;

      let rarityMap = new Map<string, number>();
      try {
        const rarityResp = await axios.get<{
          achievementpercentages?: { achievements?: SteamGlobalAchievementPercentage[] };
        }>(
          `${STEAM_API_BASE}/ISteamUserStats/GetGlobalAchievementPercentagesForApp/v0002/`,
          {
            params: { gameid: appId, format: 'json' },
            timeout: 10_000,
          },
        );
        await delay(STEAM_DELAY_MS);
        const rawRarity = rarityResp.data.achievementpercentages?.achievements ?? [];
        rarityMap = new Map(rawRarity.map((r) => [r.name, r.percent]));
      } catch {
        // Sin rareza: continuar con defaults
      }

      const dbGame = await prisma.game.upsert({
        where: { platform_externalId: { platform: 'STEAM', externalId: appId } },
        create: {
          platform: 'STEAM',
          externalId: appId,
          title: appName,
          iconUrl: null,
          headerUrl: `${STEAM_HEADER_CDN}/${appId}/header.jpg`,
          totalAchievements: achievements.length,
        },
        update: {
          title: appName,
          totalAchievements: achievements.length,
        },
      });

      gamesCreated++;

      for (const ach of achievements) {
        const rarityPercent = rarityMap.get(ach.name) ?? 100;
        await prisma.achievement.upsert({
          where: { platform_externalId: { platform: 'STEAM', externalId: ach.name } },
          create: {
            gameId: dbGame.id,
            platform: 'STEAM',
            externalId: ach.name,
            title: ach.displayName ?? ach.name,
            description: ach.description ?? null,
            iconUrl: ach.icon ? `${STEAM_STORE_CDN}/${appId}/${ach.icon}.jpg` : null,
            rawValue: rarityPercent,
            normalizedPoints: normalizeSteamPoints(rarityPercent),
            rarity: rarityPercent,
            externalUrl: `https://store.steampowered.com/app/${appId}`,
          },
          update: {
            title: ach.displayName ?? ach.name,
            description: ach.description ?? null,
            rawValue: rarityPercent,
            normalizedPoints: normalizeSteamPoints(rarityPercent),
            rarity: rarityPercent,
          },
        });
        achievementsCreated++;
      }
    } catch (err) {
      errors++;
      if (axios.isAxiosError(err) && err.response?.status !== 403 && err.response?.status !== 400) {
        logger.warn({ appId, err: (err as Error).message }, '[SeedCatalog] Steam app error (omitido)');
      }
    }
  }

  return { gamesCreated, achievementsCreated, errors };
}

// ─── RA seed ──────────────────────────────────────────────────────────────────

async function seedRaGames(
  job: Job<SeedCatalogJobData, SeedCatalogJobResult>,
): Promise<{ gamesCreated: number; achievementsCreated: number; errors: number }> {
  const raUser = process.env['RA_SYSTEM_USER'];
  const raKey = process.env['RA_SYSTEM_KEY'];

  if (!raUser || !raKey) {
    logger.warn('[SeedCatalog] RA_SYSTEM_USER/KEY no configuradas — sección RA omitida');
    return { gamesCreated: 0, achievementsCreated: 0, errors: 0 };
  }

  let gamesCreated = 0;
  let achievementsCreated = 0;
  let errors = 0;
  let totalGames = 0;
  let processedGames = 0;

  const allGames: Array<{ consoleId: number; gameId: string; gameTitle: string }> = [];

  // Recopilar listas de juegos de todas las consolas
  for (const consoleId of RA_CONSOLE_IDS) {
    try {
      const listResp = await axios.get<RaGameListEntry[]>(
        `${RA_API_BASE}/API_GetGameList.php`,
        {
          params: { z: raUser, y: raKey, i: consoleId, f: 1 },
          timeout: 20_000,
        },
      );
      await delay(RA_DELAY_MS);

      const games = Array.isArray(listResp.data) ? listResp.data.slice(0, RA_GAMES_PER_CONSOLE) : [];
      for (const g of games) {
        allGames.push({ consoleId, gameId: String(g.ID), gameTitle: g.Title ?? 'Sin título' });
      }
      totalGames += games.length;
    } catch (err) {
      logger.warn({ consoleId, err: (err as Error).message }, '[SeedCatalog] RA consola error (omitida)');
      errors++;
    }
  }

  logger.info({ totalGames }, '[SeedCatalog] RA: juegos a procesar');

  for (const { gameId, gameTitle } of allGames) {
    processedGames++;

    if (processedGames % 25 === 0) {
      await job.updateProgress(50 + Math.round((processedGames / allGames.length) * 50)); // RA = 50-100%
      logger.info(
        { processedGames, total: allGames.length, gamesCreated, achievementsCreated },
        '[SeedCatalog] RA progreso',
      );
    }

    try {
      const extResp = await axios.get<RaGameExtended>(
        `${RA_API_BASE}/API_GetGameExtended.php`,
        {
          params: { z: raUser, y: raKey, i: gameId },
          timeout: 15_000,
        },
      );
      await delay(RA_DELAY_MS);

      const gameData = extResp.data;
      if (!gameData.Achievements || Object.keys(gameData.Achievements).length === 0) continue;

      const dbGame = await prisma.game.upsert({
        where: { platform_externalId: { platform: 'RA', externalId: gameId } },
        create: {
          platform: 'RA',
          externalId: gameId,
          title: gameData.Title ?? gameTitle,
          iconUrl: gameData.ImageIcon
            ? `https://media.retroachievements.org${gameData.ImageIcon}`
            : null,
          headerUrl: null,
          totalAchievements: Object.keys(gameData.Achievements).length,
        },
        update: {
          title: gameData.Title ?? gameTitle,
          iconUrl: gameData.ImageIcon
            ? `https://media.retroachievements.org${gameData.ImageIcon}`
            : null,
          totalAchievements: Object.keys(gameData.Achievements).length,
        },
      });

      gamesCreated++;

      for (const [achKey, ach] of Object.entries(gameData.Achievements)) {
        const achId = String(ach.ID ?? achKey);
        await prisma.achievement.upsert({
          where: { platform_externalId: { platform: 'RA', externalId: achId } },
          create: {
            gameId: dbGame.id,
            platform: 'RA',
            externalId: achId,
            title: ach.Title,
            description: ach.Description ?? null,
            iconUrl: ach.BadgeName
              ? `https://media.retroachievements.org/Badge/${ach.BadgeName}.png`
              : null,
            rawValue: ach.Points ?? null,
            normalizedPoints: normalizeRaPoints(ach.Points),
            rarity: null,
            externalUrl: `https://retroachievements.org/achievement/${achId}`,
          },
          update: {
            title: ach.Title,
            description: ach.Description ?? null,
            rawValue: ach.Points ?? null,
            normalizedPoints: normalizeRaPoints(ach.Points),
            externalUrl: `https://retroachievements.org/achievement/${achId}`,
          },
        });
        achievementsCreated++;
      }
    } catch (err) {
      errors++;
      logger.warn({ gameId, err: (err as Error).message }, '[SeedCatalog] RA game error (omitido)');
    }
  }

  return { gamesCreated, achievementsCreated, errors };
}

// ─── Worker ───────────────────────────────────────────────────────────────────

export function startSeedCatalogWorker() {
  const worker = new Worker<SeedCatalogJobData, SeedCatalogJobResult>(
    'seed-catalog',
    async (job) => {
      const { platforms } = job.data;
      logger.info({ platforms, triggeredBy: job.data.triggeredBy }, '[SeedCatalog] Iniciando seed de catálogo');

      let steamGames = 0, steamAchievements = 0;
      let raGames = 0, raAchievements = 0;
      let errors = 0;

      if (platforms.includes('STEAM')) {
        const steamResult = await seedSteamGames(job);
        steamGames = steamResult.gamesCreated;
        steamAchievements = steamResult.achievementsCreated;
        errors += steamResult.errors;
      }

      if (platforms.includes('RA')) {
        const raResult = await seedRaGames(job);
        raGames = raResult.gamesCreated;
        raAchievements = raResult.achievementsCreated;
        errors += raResult.errors;
      }

      const result: SeedCatalogJobResult = {
        steamGames,
        steamAchievements,
        raGames,
        raAchievements,
        errors,
        finishedAt: new Date().toISOString(),
      };

      logger.info(result, '[SeedCatalog] Seed completado');
      return result;
    },
    {
      connection: createWorkerConnection(),
      concurrency: 1, // El seed es pesado — solo un job a la vez
    },
  );

  worker.on('completed', (job, result) => {
    logger.info(
      {
        steamGames: result.steamGames,
        raGames: result.raGames,
        totalAchievements: result.steamAchievements + result.raAchievements,
      },
      '[SeedCatalog] Job completado',
    );
  });

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err: err.message }, '[SeedCatalog] Job fallido');
  });

  return worker;
}
