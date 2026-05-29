import axios from 'axios';
import type { PlatformAccount } from '@prisma/client';
import type { Achievement, Game, SyncResult } from '@unlockhub/types';

import { prisma } from '../lib/prisma';
import { redis } from '../lib/redis';
import { AppError } from '../middleware/errorHandler';

import type { PlatformAdapter, SyncBatchCallback } from './platform.interface';

// URL base de la API de RetroAchievements
const RA_API_BASE = 'https://retroachievements.org/API';

const EXPRESS_GAME_LIMIT = 15;
const BATCH_SIZE_RA = 15;
const RA_PROCESS_CONCURRENCY = 3;    // juegos procesados en paralelo dentro de cada lote

// TTLs de caché en segundos
const CACHE_TTL_COMPLETED_GAMES = 60 * 60; // 1 hora
const CACHE_TTL_GAME_PROGRESS = 30 * 60; // 30 minutos
const CACHE_TTL_GAME_INFO = 6 * 60 * 60; // 6 horas

// Usuario y API key del sistema para llamadas de metadatos públicos
// Las credenciales de usuario se obtienen de la cuenta vinculada en cada sync
const RA_SYSTEM_USER = process.env['RA_SYSTEM_USER'] ?? '';
const RA_SYSTEM_KEY = process.env['RA_SYSTEM_KEY'] ?? '';

// ─── Tipos internos de la API de RetroAchievements ───────────────────────────

interface RaAchievementEntry {
  ID: number | string;
  Title: string;
  Description?: string;
  BadgeName?: string;
  Points?: number;
  TrueRatio?: number;
  DateEarned?: string | null;
  DateEarnedHardcore?: string | null;
}

interface RaGameProgress {
  ID: number | string;
  Title: string;
  ImageIcon?: string;
  NumAchievements?: number;
  ConsoleName?: string;
  Achievements?: Record<string, RaAchievementEntry>;
}

interface RaCompletedGame {
  GameID: number | string;
  Title: string;
  ImageIcon?: string;
  NumAwarded?: number;
  NumAchievements?: number;
}

// ─── Helpers de normalización ─────────────────────────────────────────────────

/**
 * Normaliza los puntos de RetroAchievements al sistema de XP de UnlockHub.
 * Fórmula: Math.round(puntosRA / 5), mínimo 5 XP.
 * RA Points range: 1–500 → normalizedPoints range: 5–100.
 */
function normalizePoints(points: number | undefined): number {
  if (!points || points <= 0) return 5;
  return Math.max(5, Math.round(points / 5));
}

/**
 * Construye la URL del icono de un logro de RA a partir del badge name.
 */
function buildBadgeUrl(badgeName: string | undefined): string | null {
  if (!badgeName) return null;
  return `https://media.retroachievements.org/Badge/${badgeName}.png`;
}

/**
 * Obtiene o refresca un valor de caché Redis.
 * Si la clave existe, devuelve el valor parseado.
 * Siempre devuelve null si no hay nada en caché.
 */
async function getCached<T>(key: string): Promise<T | null> {
  const raw = await redis.get(key);
  if (!raw) return null;
  return JSON.parse(raw) as T;
}

/**
 * Obtiene el valor cacheado ignorando el TTL (usando OBJECT ENCODING o GET).
 * Se usa como fallback cuando la API falla: devolvemos el dato aunque haya expirado.
 * Nota: en Redis el dato ya expirado no existe; guardamos una copia adicional sin TTL
 * o bien usamos una estrategia de stale-while-revalidate con clave "_stale".
 */
async function getStaleCache<T>(key: string): Promise<T | null> {
  // Intentamos primero la clave normal (si no ha expirado aún)
  const fresh = await redis.get(key);
  if (fresh) return JSON.parse(fresh) as T;

  // Si ya expiró, buscamos la copia estale (guardada sin TTL)
  const stale = await redis.get(`${key}:stale`);
  if (!stale) return null;
  return JSON.parse(stale) as T;
}

/**
 * Guarda el valor en caché con TTL Y una copia stale sin TTL para resiliencia.
 */
async function setResilientCache<T>(key: string, value: T, ttl: number): Promise<void> {
  const serialized = JSON.stringify(value);
  await Promise.all([
    redis.setex(key, ttl, serialized),
    redis.set(`${key}:stale`, serialized), // sin TTL: persiste aunque expire la clave principal
  ]);
}

// ─── Helpers públicos ─────────────────────────────────────────────────────────

/**
 * Verifica que un usuario de RetroAchievements existe llamando a getUserSummary.
 * Lanza RA_USER_NOT_FOUND (404) si el usuario no existe o la API devuelve error.
 * Lanza RA_SYSTEM_NOT_CONFIGURED (503) si RA_SYSTEM_KEY no está configurada.
 */
export async function lookupRaUser(username: string): Promise<void> {
  const systemUser = process.env['RA_SYSTEM_USER'] ?? '';
  const systemKey = process.env['RA_SYSTEM_KEY'] ?? '';
  if (!systemKey) {
    throw new AppError(
      'Credenciales del sistema de RetroAchievements no configuradas. Configura RA_SYSTEM_USER y RA_SYSTEM_KEY en Railway.',
      'RA_SYSTEM_NOT_CONFIGURED',
      503,
    );
  }

  try {
    const url = `${RA_API_BASE}/API_GetUserSummary.php`;
    const response = await axios.get<{ ID?: number | null }>(url, {
      params: { z: systemUser, y: systemKey, u: username, g: 0, a: 0 },
      timeout: 10_000,
    });
    // La API devuelve null o un objeto con ID null si el usuario no existe
    if (!response.data || response.data.ID == null) {
      throw new AppError(
        `No se encontró ninguna cuenta de RetroAchievements con el username "${username}".`,
        'RA_USER_NOT_FOUND',
        404,
        { username },
      );
    }
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(
      `No se encontró ninguna cuenta de RetroAchievements con el username "${username}".`,
      'RA_USER_NOT_FOUND',
      404,
      { username },
    );
  }
}

// ─── Helpers internos de procesamiento ───────────────────────────────────────

async function fetchRaUniqueGames(username: string): Promise<Map<string, RaCompletedGame>> {
  const completedCacheKey = `ra:completed:${username}`;
  let completedGames: RaCompletedGame[];

  try {
    const url = `${RA_API_BASE}/API_GetUserCompletedGames.php`;
    const response = await axios.get<RaCompletedGame[]>(url, {
      params: { z: RA_SYSTEM_USER, y: RA_SYSTEM_KEY, u: username },
      timeout: 15_000,
    });
    completedGames = Array.isArray(response.data) ? response.data : [];
    await setResilientCache(completedCacheKey, completedGames, CACHE_TTL_COMPLETED_GAMES);
  } catch (error) {
    const stale = await getStaleCache<RaCompletedGame[]>(completedCacheKey);
    if (stale) {
      completedGames = stale;
    } else {
      throw new AppError(
        'Error al obtener los juegos del usuario desde RetroAchievements',
        'RA_API_ERROR',
        502,
        { username, originalError: error instanceof Error ? error.message : String(error) },
      );
    }
  }

  const uniqueGames = new Map<string, RaCompletedGame>();
  for (const game of completedGames) {
    const gameId = String(game.GameID);
    if (!uniqueGames.has(gameId)) uniqueGames.set(gameId, game);
  }
  return uniqueGames;
}

async function processRaGame(
  gameId: string,
  gameEntry: RaCompletedGame,
  username: string,
  userId: string,
): Promise<{ gamesUpdated: number; achievementsSynced: number }> {
  const progressCacheKey = `ra:game:${gameId}:${username}`;

  let gameProgress: RaGameProgress | null = null;
  try {
    const url = `${RA_API_BASE}/API_GetGameInfoAndUserProgress.php`;
    const response = await axios.get<RaGameProgress>(url, {
      params: { z: RA_SYSTEM_USER, y: RA_SYSTEM_KEY, g: gameId, u: username },
      timeout: 10_000,
    });
    gameProgress = response.data;
    await setResilientCache(progressCacheKey, gameProgress, CACHE_TTL_GAME_PROGRESS);
  } catch {
    gameProgress = await getStaleCache<RaGameProgress>(progressCacheKey);
  }

  if (!gameProgress) return { gamesUpdated: 0, achievementsSynced: 0 };
  if (!gameProgress.Achievements || Object.keys(gameProgress.Achievements).length === 0) {
    return { gamesUpdated: 0, achievementsSynced: 0 };
  }

  const dbGame = await prisma.game.upsert({
    where: { platform_externalId: { platform: 'RA', externalId: gameId } },
    create: {
      platform: 'RA',
      externalId: gameId,
      title: gameProgress.Title ?? gameEntry.Title ?? 'Juego sin título',
      console: gameProgress.ConsoleName ?? null,
      iconUrl: gameProgress.ImageIcon
        ? `https://media.retroachievements.org${gameProgress.ImageIcon}`
        : null,
      headerUrl: null,
      totalAchievements: gameProgress.NumAchievements ?? gameEntry.NumAchievements ?? 0,
    },
    update: {
      title: gameProgress.Title ?? gameEntry.Title ?? 'Juego sin título',
      console: gameProgress.ConsoleName ?? null,
      iconUrl: gameProgress.ImageIcon
        ? `https://media.retroachievements.org${gameProgress.ImageIcon}`
        : null,
      totalAchievements: gameProgress.NumAchievements ?? gameEntry.NumAchievements ?? 0,
    },
  });

  let achievementsSynced = 0;

  for (const [achId, ach] of Object.entries(gameProgress.Achievements)) {
    const achievementExternalId = String(ach.ID ?? achId);

    const dbAchievement = await prisma.achievement.upsert({
      where: { platform_gameId_externalId: { platform: 'RA', gameId: dbGame.id, externalId: achievementExternalId } },
      create: {
        gameId: dbGame.id,
        platform: 'RA',
        externalId: achievementExternalId,
        title: ach.Title,
        description: ach.Description ?? null,
        iconUrl: buildBadgeUrl(ach.BadgeName),
        rawValue: ach.Points ?? null,
        normalizedPoints: normalizePoints(ach.Points),
        rarity: null,
        externalUrl: `https://retroachievements.org/achievement/${achievementExternalId}`,
      },
      update: {
        title: ach.Title,
        description: ach.Description ?? null,
        iconUrl: buildBadgeUrl(ach.BadgeName),
        rawValue: ach.Points ?? null,
        normalizedPoints: normalizePoints(ach.Points),
        externalUrl: `https://retroachievements.org/achievement/${achievementExternalId}`,
      },
    });

    const earnedDate = ach.DateEarned ?? ach.DateEarnedHardcore;
    if (earnedDate && earnedDate !== '' && earnedDate !== '0000-00-00 00:00:00') {
      await prisma.userAchievement.upsert({
        where: { userId_achievementId: { userId, achievementId: dbAchievement.id } },
        create: { userId, achievementId: dbAchievement.id, unlockedAt: new Date(earnedDate) },
        update: { unlockedAt: new Date(earnedDate) },
      });
      achievementsSynced++;
    }
  }

  return { gamesUpdated: 1, achievementsSynced };
}

// ─── Adapter ──────────────────────────────────────────────────────────────────

export const retroAchievementsAdapter: PlatformAdapter = {
  platform: 'RA' as const,

  /**
   * Obtiene los logros de un juego concreto para un usuario de RetroAchievements.
   * Cachea en Redis con TTL de 30 minutos. Si la API falla, devuelve caché stale.
   * Solo lanza RA_API_ERROR si falla Y no hay ningún dato cacheado.
   */
  async getUserAchievements(externalId: string): Promise<Achievement[]> {
    // externalId aquí es "{username}:{gameId}" — convenio para esta plataforma
    const [username, gameId] = externalId.split(':');
    if (!username || !gameId) {
      throw new AppError(
        'El externalId para RetroAchievements debe tener formato "username:gameId"',
        'RA_INVALID_EXTERNAL_ID',
        400,
      );
    }

    const cacheKey = `ra:game:${gameId}:${username}`;

    // Intentar obtener de caché primero
    const cached = await getCached<Achievement[]>(cacheKey);
    if (cached) return cached;

    try {
      // Llamada a la API de RetroAchievements con credenciales del sistema
      const url = `${RA_API_BASE}/API_GetGameInfoAndUserProgress.php`;
      const response = await axios.get<RaGameProgress>(url, {
        params: {
          z: RA_SYSTEM_USER,
          y: RA_SYSTEM_KEY,
          g: gameId,
          u: username,
        },
        timeout: 10_000,
      });

      const gameData = response.data;
      const achievements: Achievement[] = [];

      if (gameData.Achievements) {
        for (const [achId, ach] of Object.entries(gameData.Achievements)) {
          achievements.push({
            id: '', // Se asigna en la BD tras upsert
            gameId: String(gameData.ID),
            platform: 'RA',
            externalId: String(ach.ID ?? achId),
            title: ach.Title,
            description: ach.Description ?? null,
            iconUrl: buildBadgeUrl(ach.BadgeName),
            rawValue: ach.Points ?? null,
            normalizedPoints: normalizePoints(ach.Points),
            rarity: null, // La rareza real requiere el total de jugadores — se calcula en sync completo
            externalUrl: `https://retroachievements.org/achievement/${ach.ID ?? achId}`,
          });
        }
      }

      // Guardar en caché con resiliencia para fallback stale
      await setResilientCache(cacheKey, achievements, CACHE_TTL_GAME_PROGRESS);

      return achievements;
    } catch (error) {
      // Si la API falla, intentar devolver datos cacheados aunque estén expirados
      const stale = await getStaleCache<Achievement[]>(cacheKey);
      if (stale) return stale;

      // Sin caché disponible → error explícito
      throw new AppError(
        'Error al conectar con la API de RetroAchievements',
        'RA_API_ERROR',
        502,
        { originalError: error instanceof Error ? error.message : String(error) },
      );
    }
  },

  /**
   * Obtiene la información básica de un juego de RetroAchievements.
   * Cachea en Redis con TTL de 6 horas. Si la API falla, devuelve caché stale.
   */
  async getGameInfo(externalId: string): Promise<Game> {
    const cacheKey = `ra:gameinfo:${externalId}`;

    // Intentar obtener de caché primero
    const cached = await getCached<Game>(cacheKey);
    if (cached) return cached;

    try {
      const url = `${RA_API_BASE}/API_GetGameInfoAndUserProgress.php`;
      const response = await axios.get<RaGameProgress>(url, {
        params: {
          z: RA_SYSTEM_USER,
          y: RA_SYSTEM_KEY,
          g: externalId,
          // Sin usuario: solo metadatos del juego
        },
        timeout: 10_000,
      });

      const data = response.data;
      const game: Game = {
        id: '', // Se asigna en la BD tras upsert
        platform: 'RA',
        externalId: String(data.ID ?? externalId),
        title: data.Title ?? 'Juego sin título',
        console: data.ConsoleName ?? null,
        iconUrl: data.ImageIcon
          ? `https://media.retroachievements.org${data.ImageIcon}`
          : null,
        headerUrl: null, // RA no tiene imagen de cabecera separada
        totalAchievements: data.NumAchievements ?? 0,
      };

      await setResilientCache(cacheKey, game, CACHE_TTL_GAME_INFO);
      return game;
    } catch (error) {
      const stale = await getStaleCache<Game>(cacheKey);
      if (stale) return stale;

      throw new AppError(
        'Error al obtener información del juego desde RetroAchievements',
        'RA_API_ERROR',
        502,
        { gameId: externalId, originalError: error instanceof Error ? error.message : String(error) },
      );
    }
  },

  /**
   * Sincroniza todos los logros de un usuario de RetroAchievements.
   *
   * Proceso:
   * 1. Desencripta el token (apiKey) almacenado en la cuenta
   * 2. Obtiene la lista de juegos completados/en progreso
   * 3. Para cada juego, obtiene el progreso detallado con logros
   * 4. Hace upsert de Game y Achievement en la BD
   * 5. Hace upsert de UserAchievement para los logros desbloqueados
   * 6. Devuelve el resumen de la sincronización
   */
  async syncUser(account: PlatformAccount): Promise<SyncResult> {
    const username = account.externalId;
    const uniqueGames = await fetchRaUniqueGames(username);
    const entries = [...uniqueGames.entries()];

    let achievementsSynced = 0;
    let gamesUpdated = 0;

    // Procesamiento paralelo con aislamiento por juego
    for (let i = 0; i < entries.length; i += RA_PROCESS_CONCURRENCY) {
      const chunk = entries.slice(i, i + RA_PROCESS_CONCURRENCY);
      const results = await Promise.allSettled(
        chunk.map(([gameId, gameEntry]) => processRaGame(gameId, gameEntry, username, account.userId)),
      );
      for (const result of results) {
        if (result.status === 'fulfilled') {
          achievementsSynced += result.value.achievementsSynced;
          gamesUpdated += result.value.gamesUpdated;
        }
        // juego fallido: aislado, no cancela el resto del lote
      }
    }

    await prisma.platformAccount.update({
      where: { id: account.id },
      data: { lastSyncedAt: new Date() },
    });

    return { platform: 'RA', achievementsSynced, gamesUpdated, syncedAt: new Date().toISOString() };
  },

  async syncUserExpress(account: PlatformAccount): Promise<SyncResult> {
    const username = account.externalId;
    const uniqueGames = await fetchRaUniqueGames(username);

    // Priorizar juegos con más logros desbloqueados (los más jugados)
    const entries = [...uniqueGames.entries()]
      .sort(([, a], [, b]) => (b.NumAwarded ?? 0) - (a.NumAwarded ?? 0))
      .slice(0, EXPRESS_GAME_LIMIT);

    let achievementsSynced = 0;
    let gamesUpdated = 0;

    for (const [gameId, gameEntry] of entries) {
      const r = await processRaGame(gameId, gameEntry, username, account.userId);
      achievementsSynced += r.achievementsSynced;
      gamesUpdated += r.gamesUpdated;
    }

    return { platform: 'RA', achievementsSynced, gamesUpdated, syncedAt: new Date().toISOString() };
  },

  async syncUserBatched(account: PlatformAccount, onBatch: SyncBatchCallback): Promise<SyncResult> {
    const username = account.externalId;
    const uniqueGames = await fetchRaUniqueGames(username);

    const entries = [...uniqueGames.entries()];
    const total = entries.length;
    let achievementsSynced = 0;
    let gamesUpdated = 0;
    let processed = 0;

    for (let i = 0; i < entries.length; i += BATCH_SIZE_RA) {
      const batch = entries.slice(i, i + BATCH_SIZE_RA);
      let batchGames = 0;
      let batchAchievements = 0;

      // Procesamiento paralelo dentro del lote con aislamiento por juego
      for (let j = 0; j < batch.length; j += RA_PROCESS_CONCURRENCY) {
        const chunk = batch.slice(j, j + RA_PROCESS_CONCURRENCY);
        const results = await Promise.allSettled(
          chunk.map(([gameId, gameEntry]) => processRaGame(gameId, gameEntry, username, account.userId)),
        );
        for (const result of results) {
          if (result.status === 'fulfilled') {
            batchGames += result.value.gamesUpdated;
            batchAchievements += result.value.achievementsSynced;
          }
          // juego fallido: aislado, no cancela el resto del lote
        }
      }

      achievementsSynced += batchAchievements;
      gamesUpdated += batchGames;
      processed += batch.length;

      await onBatch({ processed, total, newGamesCount: batchGames, newAchievementsCount: batchAchievements });
    }

    await prisma.platformAccount.update({
      where: { id: account.id },
      data: { lastSyncedAt: new Date() },
    });

    return { platform: 'RA', achievementsSynced, gamesUpdated, syncedAt: new Date().toISOString() };
  },
};
