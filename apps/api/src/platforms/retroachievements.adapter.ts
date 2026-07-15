import { randomUUID } from 'crypto';

import axios from 'axios';
import { Prisma } from '@prisma/client';
import type { PlatformAccount } from '@prisma/client';
import type { Achievement, Game, SyncResult } from '@unlockhub/types';

import { prisma } from '../lib/prisma';
import { redis } from '../lib/redis';
import { AppError } from '../middleware/errorHandler';
import { logger } from '../lib/logger';

import type { PlatformAdapter, SyncBatchCallback } from './platform.interface';
import { getCachedGameMeta, setCachedGameMeta } from './game-cache';

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

// Exportado para el test de integración de equivalencia (T114) — construye fixtures del mismo tipo.
export interface RaAchievementEntry {
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

// TTL de la copia stale: 7 días. Suficiente para recuperarse de interrupciones prolongadas de la API
// sin acumular claves permanentes en Redis (especialmente para usuarios con 1000+ juegos RA).
const STALE_CACHE_TTL = 7 * 24 * 60 * 60; // 604800 s

/**
 * Guarda el valor en caché con TTL Y una copia stale de larga duración para resiliencia.
 */
async function setResilientCache<T>(key: string, value: T, ttl: number): Promise<void> {
  const serialized = JSON.stringify(value);
  await Promise.all([
    redis.setex(key, ttl, serialized),
    redis.setex(`${key}:stale`, STALE_CACHE_TTL, serialized),
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
        {
          username,
          originalError: error instanceof Error ? error.message : String(error),
          httpStatus: axios.isAxiosError(error) ? error.response?.status : undefined,
        },
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

// ─── T114 Ataque A — batching de escrituras (solo RA, rollout por plataforma) ─
//
// Reemplaza el `for` secuencial (2 await por logro: achievement.upsert + userAchievement.upsert)
// por 2 fases en lote con SQL crudo. Datos de producción (T114): las escrituras dominan el sync
// 35-37:1 sobre la red — el batching ataca directamente ese cuello de botella.
//
// El CÁLCULO se queda en TypeScript: normalizePoints/buildBadgeUrl se llaman exactamente igual
// que en el código secuencial que sustituye, ANTES de construir el SQL — el batch solo persiste
// valores ya calculados, nunca reimplementa la fórmula de puntos en SQL.

interface RaAchievementRow {
  id: string;
  externalId: string;
  title: string;
  description: string | null;
  iconUrl: string | null;
  rawValue: number | null;
  normalizedPoints: number;
  externalUrl: string;
  unlockedAt: Date | null;
}

/**
 * Hace upsert en lote de todos los logros de un juego RA + los UserAchievement de los ganados.
 * Devuelve el número de logros marcados como ganados en este sync (== achievementsSynced).
 *
 * Trade-off aceptado (documentado en T114): con INSERT multi-fila, una fila inválida aborta la
 * sentencia ENTERA — de "N-1 logros se guardan, 1 falla" (comportamiento del `for` secuencial)
 * pasamos a "0 logros se guardan, el juego se reintenta en el siguiente sync". Esto es aceptable
 * porque el JUEGO ya es la unidad de fallo en el diseño actual: si `fetchMergedTrophies`/el fetch
 * de progreso falla, el juego entero se pierde igual (ver `processRaGame` — aislamiento por juego
 * vía `Promise.allSettled`, no por logro individual).
 */
// Exportado para el test de integración de equivalencia (T114) — llamado directamente contra BD real.
export async function batchUpsertRaAchievements(
  achievements: Record<string, RaAchievementEntry>,
  gameId: string,
  userId: string,
): Promise<number> {
  // Dedupe por externalId (última entrada gana) — el `for` secuencial anterior no podía chocar
  // consigo mismo (cada upsert era independiente), pero un INSERT ... VALUES (...), (...) con el
  // mismo conflict target repetido dos veces en el mismo lote SÍ falla en Postgres
  // ("ON CONFLICT DO UPDATE command cannot affect row a second time"). No debería ocurrir en datos
  // reales de RA (las claves del objeto Achievements ya son únicas), pero es una nueva superficie
  // de fallo que el código viejo no tenía — se cierra aquí en vez de dejarla como riesgo latente.
  const byExternalId = new Map<string, RaAchievementRow>();
  for (const [achId, ach] of Object.entries(achievements)) {
    const externalId = String(ach.ID ?? achId);
    const earnedDateRaw = ach.DateEarned ?? ach.DateEarnedHardcore;
    const unlockedAt =
      earnedDateRaw && earnedDateRaw !== '' && earnedDateRaw !== '0000-00-00 00:00:00'
        ? new Date(earnedDateRaw)
        : null;

    byExternalId.set(externalId, {
      id: randomUUID(),
      externalId,
      title: ach.Title,
      description: ach.Description ?? null,
      iconUrl: buildBadgeUrl(ach.BadgeName),
      rawValue: ach.Points ?? null,
      normalizedPoints: normalizePoints(ach.Points),
      externalUrl: `https://retroachievements.org/achievement/${externalId}`,
      unlockedAt,
    });
  }
  const rows = [...byExternalId.values()];

  const now = new Date();

  // ── FASE 1 — Achievement en lote ──────────────────────────────────────────
  // Conflict target por LISTA DE COLUMNAS explícita (no por nombre de constraint — más robusto
  // ante un rename del índice). Debe coincidir EXACTAMENTE con @@unique([platform, gameId,
  // externalId]) del schema. Ojo al case-sensitivity: "gameId"/"externalId" entre comillas, no
  // gameid/externalid — Postgres los trataría como columnas distintas (inexistentes) sin comillas.
  const achievementValues = Prisma.join(
    rows.map(
      (row) =>
        Prisma.sql`(${row.id}, ${gameId}, 'RA'::"Platform", ${row.externalId}, ${row.title}, ${row.description}, ${row.iconUrl}, ${row.rawValue}, ${row.normalizedPoints}, ${null}, ${row.externalUrl}, ${now}, ${now})`,
    ),
  );

  const upserted = await prisma.$queryRaw<Array<{ id: string; externalId: string }>>(Prisma.sql`
    INSERT INTO "Achievement"
      ("id", "gameId", "platform", "externalId", "title", "description", "iconUrl", "rawValue", "normalizedPoints", "rarity", "externalUrl", "createdAt", "updatedAt")
    VALUES ${achievementValues}
    ON CONFLICT ("platform", "gameId", "externalId") DO UPDATE SET
      "title" = EXCLUDED."title",
      "description" = EXCLUDED."description",
      "iconUrl" = EXCLUDED."iconUrl",
      "rawValue" = EXCLUDED."rawValue",
      "normalizedPoints" = EXCLUDED."normalizedPoints",
      "externalUrl" = EXCLUDED."externalUrl",
      "updatedAt" = EXCLUDED."updatedAt"
    RETURNING "id", "externalId"
  `);
  // "rarity" y "trophyType" se insertan solo en el INSERT (RA nunca los usa, quedan NULL) y se
  // OMITEN del DO UPDATE SET a propósito — igual que el `update:` de Prisma que sustituye, que
  // nunca tocaba esos dos campos en un re-sync.

  const achievementIdByExternalId = new Map(upserted.map((r) => [r.externalId, r.id]));

  // ── FASE 2 — UserAchievement en lote (solo logros ganados) ────────────────
  const earnedRows = rows
    .filter((row) => row.unlockedAt !== null)
    .flatMap((row) => {
      const achievementId = achievementIdByExternalId.get(row.externalId);
      // Defensivo: RETURNING devuelve una fila por cada input, así que esto no debería pasar nunca.
      if (!achievementId) return [];
      return [{ id: randomUUID(), achievementId, unlockedAt: row.unlockedAt as Date }];
    });

  if (earnedRows.length === 0) return 0;

  const userAchievementValues = Prisma.join(
    earnedRows.map(
      (row) => Prisma.sql`(${row.id}, ${userId}, ${row.achievementId}, ${row.unlockedAt})`,
    ),
  );

  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO "UserAchievement" ("id", "userId", "achievementId", "unlockedAt")
    VALUES ${userAchievementValues}
    ON CONFLICT ("userId", "achievementId") DO UPDATE SET "unlockedAt" = EXCLUDED."unlockedAt"
  `);

  return earnedRows.length;
}

async function processRaGame(
  gameId: string,
  gameEntry: RaCompletedGame,
  username: string,
  userId: string,
): Promise<{ gamesUpdated: number; achievementsSynced: number; fetchMs: number; writeMs: number }> {
  const progressCacheKey = `ra:game:${gameId}:${username}`;

  const fetchStartedAt = Date.now();
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
  const fetchMs = Date.now() - fetchStartedAt;

  if (!gameProgress) return { gamesUpdated: 0, achievementsSynced: 0, fetchMs, writeMs: 0 };
  if (!gameProgress.Achievements || Object.keys(gameProgress.Achievements).length === 0) {
    return { gamesUpdated: 0, achievementsSynced: 0, fetchMs, writeMs: 0 };
  }

  const writeStartedAt = Date.now();

  const gameTitle = gameProgress.Title ?? gameEntry.Title ?? 'Juego sin título';
  const gameIconUrl = gameProgress.ImageIcon
    ? `https://media.retroachievements.org${gameProgress.ImageIcon}`
    : null;
  const gameTotalAchievements = gameProgress.NumAchievements ?? gameEntry.NumAchievements ?? 0;
  const gameConsole = gameProgress.ConsoleName ?? null;

  // Caché de metadatos de juego (24h) — evita un game.upsert por juego en cada sync
  let dbGame: { id: string };
  const cachedMeta = await getCachedGameMeta('RA', gameId);
  if (cachedMeta) {
    dbGame = { id: cachedMeta.id };
  } else {
    dbGame = await prisma.game.upsert({
      where: { platform_externalId: { platform: 'RA', externalId: gameId } },
      create: {
        platform: 'RA',
        externalId: gameId,
        title: gameTitle,
        console: gameConsole,
        iconUrl: gameIconUrl,
        headerUrl: null,
        totalAchievements: gameTotalAchievements,
      },
      update: {
        title: gameTitle,
        console: gameConsole,
        iconUrl: gameIconUrl,
        totalAchievements: gameTotalAchievements,
      },
    });
    await setCachedGameMeta('RA', gameId, {
      id: dbGame.id,
      title: gameTitle,
      iconUrl: gameIconUrl,
      totalAchievements: gameTotalAchievements,
      console: gameConsole,
    });
  }

  const achievementsSynced = await batchUpsertRaAchievements(gameProgress.Achievements, dbGame.id, userId);

  const writeMs = Date.now() - writeStartedAt;

  // T114 — instrumentación de timings por juego. Una línea por juego, no por logro.
  logger.debug(
    {
      platform: 'RA',
      gameId,
      achievements: Object.keys(gameProgress.Achievements).length,
      fetchMs,
      writeMs,
      totalMs: fetchMs + writeMs,
    },
    '[RaAdapter] Timing de juego',
  );

  return { gamesUpdated: 1, achievementsSynced, fetchMs, writeMs };
}

// ─── Fetch de definiciones de logros sin progreso de usuario ─────────────────

export interface RaAchievementDefinition {
  externalId: string;
  title: string;
  description: string | null;
  iconUrl: string | null;
  rawValue: number | null;
  normalizedPoints: number;
}

/**
 * Obtiene las definiciones de logros de un juego de RA usando las credenciales del sistema.
 * No incluye progreso del usuario — solo metadatos de los logros.
 * Usa caché resiliente (normal + stale) igual que el sync.
 */
export async function fetchRaAchievementDefinitions(
  gameExternalId: string,
): Promise<RaAchievementDefinition[]> {
  if (!RA_SYSTEM_KEY) {
    throw new AppError(
      'Credenciales del sistema de RetroAchievements no configuradas.',
      'RA_SYSTEM_NOT_CONFIGURED',
      503,
    );
  }

  const cacheKey = `ra:game:${gameExternalId}:${RA_SYSTEM_USER}`;

  let gameProgress: RaGameProgress | null = null;
  try {
    const url = `${RA_API_BASE}/API_GetGameInfoAndUserProgress.php`;
    const response = await axios.get<RaGameProgress>(url, {
      params: { z: RA_SYSTEM_USER, y: RA_SYSTEM_KEY, g: gameExternalId, u: RA_SYSTEM_USER },
      timeout: 10_000,
    });
    gameProgress = response.data;
    await setResilientCache(cacheKey, gameProgress, CACHE_TTL_GAME_PROGRESS);
  } catch {
    gameProgress = await getStaleCache<RaGameProgress>(cacheKey);
  }

  if (!gameProgress?.Achievements) return [];

  return Object.entries(gameProgress.Achievements).map(([achId, ach]) => {
    const externalId = String(ach.ID ?? achId);
    return {
      externalId,
      title: ach.Title,
      description: ach.Description ?? null,
      iconUrl: buildBadgeUrl(ach.BadgeName),
      rawValue: ach.Points ?? null,
      normalizedPoints: normalizePoints(ach.Points),
    };
  });
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
    let fetchMs = 0;
    let writeMs = 0;

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
          fetchMs += result.value.fetchMs;
          writeMs += result.value.writeMs;
        }
        // juego fallido: aislado, no cancela el resto del lote
      }
    }

    await prisma.platformAccount.upsert({
      where: { userId_platform: { userId: account.userId, platform: account.platform } },
      update: { lastSyncedAt: new Date() },
      create: {
        userId: account.userId,
        platform: account.platform,
        externalId: account.externalId,
        username: account.username,
        encryptedToken: account.encryptedToken,
        lastSyncedAt: new Date(),
      },
    });

    return { platform: 'RA', achievementsSynced, gamesUpdated, syncedAt: new Date().toISOString(), timing: { fetchMs, writeMs } };
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
    let fetchMs = 0;
    let writeMs = 0;

    // Procesamiento paralelo con aislamiento por juego — igual que syncUser/syncUserBatched
    for (let i = 0; i < entries.length; i += RA_PROCESS_CONCURRENCY) {
      const chunk = entries.slice(i, i + RA_PROCESS_CONCURRENCY);
      const results = await Promise.allSettled(
        chunk.map(([gameId, gameEntry]) => processRaGame(gameId, gameEntry, username, account.userId)),
      );
      for (let j = 0; j < results.length; j++) {
        const result = results[j];
        if (result?.status === 'fulfilled') {
          achievementsSynced += result.value.achievementsSynced;
          gamesUpdated += result.value.gamesUpdated;
          fetchMs += result.value.fetchMs;
          writeMs += result.value.writeMs;
        } else if (result?.status === 'rejected') {
          const gameId = chunk[j]?.[0] ?? 'unknown';
          logger.warn({ gameId, err: result.reason }, '[RA] syncUserExpress: error en juego individual — continuando');
        }
      }
    }

    return { platform: 'RA', achievementsSynced, gamesUpdated, syncedAt: new Date().toISOString(), timing: { fetchMs, writeMs } };
  },

  async syncUserBatched(account: PlatformAccount, onBatch: SyncBatchCallback): Promise<SyncResult> {
    const username = account.externalId;
    const uniqueGames = await fetchRaUniqueGames(username);

    const entries = [...uniqueGames.entries()];
    const total = entries.length;
    let achievementsSynced = 0;
    let gamesUpdated = 0;
    let processed = 0;
    let fetchMs = 0;
    let writeMs = 0;

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
            fetchMs += result.value.fetchMs;
            writeMs += result.value.writeMs;
          }
          // juego fallido: aislado, no cancela el resto del lote
        }
      }

      achievementsSynced += batchAchievements;
      gamesUpdated += batchGames;
      processed += batch.length;

      await onBatch({ processed, total, newGamesCount: batchGames, newAchievementsCount: batchAchievements });
    }

    await prisma.platformAccount.upsert({
      where: { userId_platform: { userId: account.userId, platform: account.platform } },
      update: { lastSyncedAt: new Date() },
      create: {
        userId: account.userId,
        platform: account.platform,
        externalId: account.externalId,
        username: account.username,
        encryptedToken: account.encryptedToken,
        lastSyncedAt: new Date(),
      },
    });

    return { platform: 'RA', achievementsSynced, gamesUpdated, syncedAt: new Date().toISOString(), timing: { fetchMs, writeMs } };
  },
};
