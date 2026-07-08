import axios from 'axios';
import type { PlatformAccount } from '@prisma/client';
import type { Achievement, Game, SyncResult } from '@unlockhub/types';

import { prisma } from '../lib/prisma';
import { redis } from '../lib/redis';
import { AppError } from '../middleware/errorHandler';
import { logger } from '../lib/logger';
import { STEAM_MAX_GAMES_PER_SYNC } from '../config/steamQuota';

import type { PlatformAdapter, SyncBatchCallback } from './platform.interface';
import { getCachedGameMeta, setCachedGameMeta } from './game-cache';
import { normalizeAchievementPoints } from './achievement-points';

// Clave del sistema — todas las llamadas a Steam usan esta key del servidor
const STEAM_SYSTEM_API_KEY = process.env['STEAM_API_KEY'] ?? '';

// ─── Constantes ────────────────────────────────────────────────────────────────

const STEAM_API_BASE = 'https://api.steampowered.com';
const STEAM_STORE_CDN = 'https://media.steampowered.com/steamcommunity/public/images/apps';

// TTLs de caché en segundos
const TTL_GAMES = 3600;         // 1 hora
const TTL_ACHIEVEMENTS = 1800;  // 30 minutos
const TTL_SCHEMA = 86400;       // 24 horas
const TTL_RARITY = 86400;       // 24 horas

// ─── Constantes de batch ───────────────────────────────────────────────────────

const EXPRESS_GAME_LIMIT = 20;
const BATCH_SIZE = 20;

// ─── Tipos internos de la Steam Web API ───────────────────────────────────────

interface SteamOwnedGame {
  appid: number;
  name: string;
  img_icon_url: string;
  has_community_visible_stats?: boolean;
  playtime_forever?: number;
  /** Unix timestamp de la última sesión de juego. 0 si el juego nunca se ha iniciado. */
  rtime_last_played?: number;
}

interface SteamPlayerAchievement {
  apiname: string;
  achieved: number;       // 0 | 1
  unlocktime: number;     // Unix timestamp
}

interface SteamSchemaAchievement {
  name: string;           // Corresponde a apiname
  displayName: string;
  description?: string;
  icon: string;           // Nombre del icono (sin URL base)
  icongray: string;
}

interface SteamGlobalAchievementPercentage {
  name: string;
  percent: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Incrementa el contador diario de llamadas reales a la Steam API.
 * Se llama exclusivamente cuando hay cache miss (dentro del fetcher de cachedFetch).
 * El scheduler de background-sync y el dashboard admin leen esta clave para decidir si continuar.
 */
async function incrementSteamApiCounter(): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  const key = `steam:api:calls:${today}`;
  const newCount = await redis.incr(key);
  if (newCount === 1) {
    // Primera llamada del día — fijar TTL de 48h para no acumular claves indefinidamente
    await redis.expire(key, 48 * 3600);
  }
}

/**
 * Wrapper de caché genérico sobre Redis.
 * Si la clave existe devuelve el valor deserializado; si no, ejecuta el fetcher,
 * guarda el resultado y lo devuelve.
 */
async function cachedFetch<T>(key: string, ttl: number, fetcher: () => Promise<T>): Promise<T> {
  const cached = await redis.get(key);
  if (cached !== null) {
    return JSON.parse(cached) as T;
  }
  const value = await fetcher();
  await redis.setex(key, ttl, JSON.stringify(value));
  return value;
}

// ─── Helpers públicos ─────────────────────────────────────────────────────────

const STEAMID64_REGEX = /^\d{17}$/;

/**
 * Resuelve un username/vanityURL de Steam a SteamID64.
 * Si el input ya es un SteamID64 (17 dígitos), lo devuelve directamente.
 * Si no, llama a ResolveVanityURL con la API key del sistema.
 * Lanza STEAM_USER_NOT_FOUND (404) si el usuario no existe.
 * Lanza STEAM_SYSTEM_NOT_CONFIGURED (503) si STEAM_API_KEY no está configurada.
 */
export async function resolveVanityUrl(usernameOrId: string): Promise<string> {
  if (STEAMID64_REGEX.test(usernameOrId)) {
    return usernameOrId;
  }

  const apiKey = process.env['STEAM_API_KEY'] ?? '';
  if (!apiKey) {
    throw new AppError(
      'Steam API key del sistema no configurada. Configura STEAM_API_KEY en las variables de entorno.',
      'STEAM_SYSTEM_NOT_CONFIGURED',
      503,
    );
  }

  const url = `${STEAM_API_BASE}/ISteamUser/ResolveVanityURL/v1/`;
  const response = await axios.get<{ response: { success: number; steamid?: string } }>(url, {
    params: { key: apiKey, vanityurl: usernameOrId },
    timeout: 10_000,
  });

  const { success, steamid } = response.data.response;
  if (success !== 1 || !steamid) {
    throw new AppError(
      `No se encontró ninguna cuenta de Steam con el username "${usernameOrId}".`,
      'STEAM_USER_NOT_FOUND',
      404,
      { username: usernameOrId },
    );
  }

  return steamid;
}

/**
 * Verifica que el perfil de Steam es público antes de vincularlo.
 * communityvisibilitystate: 1=privado, 3=público.
 * Lanza STEAM_PROFILE_PRIVATE (400) si el perfil no es público.
 * Lanza STEAM_SYSTEM_NOT_CONFIGURED (503) si STEAM_API_KEY no está configurada.
 */
export async function checkSteamProfilePublic(steamId: string): Promise<void> {
  const apiKey = process.env['STEAM_API_KEY'] ?? '';
  if (!apiKey) {
    throw new AppError(
      'Steam API key del sistema no configurada.',
      'STEAM_SYSTEM_NOT_CONFIGURED',
      503,
    );
  }

  const url = `${STEAM_API_BASE}/ISteamUser/GetPlayerSummaries/v2/`;
  const response = await axios.get<{
    response: { players: Array<{ steamid: string; communityvisibilitystate: number }> };
  }>(url, {
    params: { key: apiKey, steamids: steamId },
    timeout: 10_000,
  });

  const player = response.data.response.players[0];
  if (!player || player.communityvisibilitystate !== 3) {
    throw new AppError(
      'El perfil de Steam es privado. Hazlo público en la configuración de Steam para vincularlo.',
      'STEAM_PROFILE_PRIVATE',
      400,
      { steamId },
    );
  }
}

// ─── Steam Adapter ────────────────────────────────────────────────────────────

export class SteamAdapter implements PlatformAdapter {
  readonly platform = 'STEAM' as const;

  // ── getUserAchievements ────────────────────────────────────────────────────

  async getUserAchievements(steamId: string): Promise<Achievement[]> {
    const apiKey = STEAM_SYSTEM_API_KEY;
    // Obtener lista de juegos del usuario
    const games = await this.fetchOwnedGames(steamId, apiKey);

    const allAchievements: Achievement[] = [];

    for (const game of games) {
      const appId = String(game.appid);

      // Solo procesar juegos con estadísticas de comunidad habilitadas
      if (!game.has_community_visible_stats) continue;

      const [playerAchievements, schema, rarityMap] = await Promise.all([
        this.fetchPlayerAchievements(steamId, apiKey, appId),
        this.fetchGameSchema(apiKey, appId),
        this.fetchRarityMap(appId),
      ]);

      // Necesitamos el gameId de nuestra BD — puede no existir aún si aún no se ha sincronizado
      // En getUserAchievements construimos objetos Achievement sin gameId de BD
      const schemaMap = new Map(schema.map((s) => [s.name, s]));

      for (const pa of playerAchievements) {
        const schemaDef = schemaMap.get(pa.apiname);
        const rawRarity = rarityMap.get(pa.apiname) ?? 100;
        const rarityValue = parseFloat(String(rawRarity));
        const normalized = normalizeAchievementPoints(rarityValue);

        allAchievements.push({
          id: `steam:${appId}:${pa.apiname}`,
          gameId: appId,
          platform: 'STEAM',
          externalId: pa.apiname,
          title: schemaDef?.displayName ?? pa.apiname,
          description: schemaDef?.description ?? null,
          iconUrl: schemaDef?.icon
            ? (schemaDef.icon.startsWith('http')
                ? schemaDef.icon
                : `${STEAM_STORE_CDN}/${appId}/${schemaDef.icon}.jpg`)
            : null,
          rawValue: isNaN(rarityValue) ? null : rarityValue,
          normalizedPoints: normalized,
          rarity: isNaN(rarityValue) ? null : rarityValue,
          externalUrl: `https://store.steampowered.com/app/${appId}`,
        });
      }
    }

    return allAchievements;
  }

  // ── getGameInfo ────────────────────────────────────────────────────────────

  async getGameInfo(externalId: string): Promise<Game> {
    // Steam no expone un endpoint público de metadatos de juego sin apiKey,
    // por lo que devolvemos la info del schema almacenado en caché si existe.
    const cacheKey = `steam:schema:${externalId}`;
    const cached = await redis.get(cacheKey);

    if (cached !== null) {
      const schema = JSON.parse(cached) as SteamSchemaAchievement[];
      return {
        id: externalId,
        platform: 'STEAM',
        externalId,
        title: `Steam Game ${externalId}`,
        console: null,
        iconUrl: null,
        headerUrl: `https://cdn.cloudflare.steamstatic.com/steam/apps/${externalId}/header.jpg`,
        totalAchievements: schema.length,
      };
    }

    // Si no hay caché, devolvemos los metadatos mínimos disponibles públicamente
    return {
      id: externalId,
      platform: 'STEAM',
      externalId,
      title: `Steam Game ${externalId}`,
      console: null,
      iconUrl: null,
      headerUrl: `https://cdn.cloudflare.steamstatic.com/steam/apps/${externalId}/header.jpg`,
      totalAchievements: 0,
    };
  }

  // ── syncUser ───────────────────────────────────────────────────────────────

  async syncUser(account: PlatformAccount): Promise<SyncResult> {
    const apiKey = STEAM_SYSTEM_API_KEY;
    const steamId = account.externalId;
    const games = await this.fetchOwnedGames(steamId, apiKey);
    const eligible = games.filter((g) => g.has_community_visible_stats);
    const capped = this.sortEligibleByActivity(eligible).slice(0, STEAM_MAX_GAMES_PER_SYNC);
    const skipped = eligible.length - capped.length;
    if (skipped > 0) {
      logger.info(
        { userId: account.userId, total: eligible.length, syncing: capped.length, skipped },
        '[SteamAdapter] Biblioteca grande: omitidos juegos por STEAM_MAX_GAMES_PER_SYNC — procesando los más recientes',
      );
    }
    return this.processGames(capped, steamId, apiKey, account.userId);
  }

  // ── syncUserExpress ────────────────────────────────────────────────────────

  async syncUserExpress(account: PlatformAccount): Promise<SyncResult> {
    const apiKey = STEAM_SYSTEM_API_KEY;
    const steamId = account.externalId;

    const games = await this.fetchOwnedGames(steamId, apiKey);
    // Los juegos más jugados probablemente importan más al usuario
    const eligible = games
      .filter((g) => g.has_community_visible_stats)
      .sort((a, b) => (b.playtime_forever ?? 0) - (a.playtime_forever ?? 0))
      .slice(0, EXPRESS_GAME_LIMIT);

    return this.processGames(eligible, steamId, apiKey, account.userId);
  }

  // ── syncUserBatched ────────────────────────────────────────────────────────

  async syncUserBatched(account: PlatformAccount, onBatch: SyncBatchCallback): Promise<SyncResult> {
    const apiKey = STEAM_SYSTEM_API_KEY;
    const steamId = account.externalId;

    const games = await this.fetchOwnedGames(steamId, apiKey);
    const eligible = games.filter((g) => g.has_community_visible_stats);
    const capped = this.sortEligibleByActivity(eligible).slice(0, STEAM_MAX_GAMES_PER_SYNC);
    const skipped = eligible.length - capped.length;
    if (skipped > 0) {
      logger.info(
        { userId: account.userId, total: eligible.length, syncing: capped.length, skipped },
        '[SteamAdapter] Biblioteca grande: omitidos juegos por STEAM_MAX_GAMES_PER_SYNC — procesando los más recientes',
      );
    }

    // El total del progreso se calcula sobre los juegos efectivamente procesados,
    // no sobre la biblioteca completa — el cliente verá 100 % al terminar este intento.
    const total = capped.length;

    let achievementsSynced = 0;
    let gamesUpdated = 0;
    let processed = 0;

    for (let i = 0; i < capped.length; i += BATCH_SIZE) {
      const batch = capped.slice(i, i + BATCH_SIZE);
      const batchResult = await this.processGames(batch, steamId, apiKey, account.userId);

      achievementsSynced += batchResult.achievementsSynced;
      gamesUpdated += batchResult.gamesUpdated;
      processed += batch.length;

      await onBatch({
        processed,
        total,
        newGamesCount: batchResult.gamesUpdated,
        newAchievementsCount: batchResult.achievementsSynced,
      });
    }

    return {
      platform: 'STEAM',
      achievementsSynced,
      gamesUpdated,
      syncedAt: new Date().toISOString(),
    };
  }

  // ── Ordenación por actividad reciente ─────────────────────────────────────

  /**
   * Ordena los juegos elegibles priorizando los más jugados recientemente.
   * Señal primaria: rtime_last_played (Unix timestamp de la última sesión, 0 si nunca jugado).
   * Señal secundaria: playtime_forever (horas totales) como desempate cuando rtime es igual.
   * Ambas señales las devuelve GetOwnedGames con include_appinfo=true.
   */
  private sortEligibleByActivity(games: SteamOwnedGame[]): SteamOwnedGame[] {
    return [...games].sort((a, b) => {
      const aTime = a.rtime_last_played ?? 0;
      const bTime = b.rtime_last_played ?? 0;
      if (bTime !== aTime) return bTime - aTime;
      return (b.playtime_forever ?? 0) - (a.playtime_forever ?? 0);
    });
  }

  // ── Lógica de procesamiento compartida ────────────────────────────────────

  private async processGames(
    games: SteamOwnedGame[],
    steamId: string,
    apiKey: string,
    userId: string,
  ): Promise<SyncResult> {
    let achievementsSynced = 0;
    let gamesUpdated = 0;

    for (const steamGame of games) {
      const appId = String(steamGame.appid);

      const [playerAchievements, schema, rarityMap] = await Promise.all([
        this.fetchPlayerAchievements(steamId, apiKey, appId),
        this.fetchGameSchema(apiKey, appId),
        this.fetchRarityMap(appId),
      ]);

      if (schema.length === 0 || playerAchievements.length === 0) continue;

      const schemaMap = new Map(schema.map((s) => [s.name, s]));

      const steamIconUrl = steamGame.img_icon_url
        ? `${STEAM_STORE_CDN}/${appId}/${steamGame.img_icon_url}.jpg`
        : null;

      // Caché de metadatos de juego (24h) — evita un game.upsert por app en cada sync
      let dbGame: { id: string };
      const cachedMeta = await getCachedGameMeta('STEAM', appId);
      if (cachedMeta) {
        dbGame = { id: cachedMeta.id };
      } else {
        dbGame = await prisma.game.upsert({
          where: { platform_externalId: { platform: 'STEAM', externalId: appId } },
          create: {
            platform: 'STEAM',
            externalId: appId,
            title: steamGame.name,
            iconUrl: steamIconUrl,
            headerUrl: `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/header.jpg`,
            totalAchievements: schema.length,
          },
          update: {
            title: steamGame.name,
            totalAchievements: schema.length,
          },
        });
        await setCachedGameMeta('STEAM', appId, {
          id: dbGame.id,
          title: steamGame.name,
          iconUrl: steamIconUrl,
          totalAchievements: schema.length,
          console: null,
        });
      }

      gamesUpdated++;

      for (const pa of playerAchievements) {
        const schemaDef = schemaMap.get(pa.apiname);
        const rawRarity = rarityMap.get(pa.apiname) ?? 100;
        const rarityValue = parseFloat(String(rawRarity));
        const normalized = normalizeAchievementPoints(rarityValue);

        const dbAchievement = await prisma.achievement.upsert({
          where: { platform_gameId_externalId: { platform: 'STEAM', gameId: dbGame.id, externalId: pa.apiname } },
          create: {
            gameId: dbGame.id,
            platform: 'STEAM',
            externalId: pa.apiname,
            title: schemaDef?.displayName ?? pa.apiname,
            description: schemaDef?.description ?? null,
            iconUrl: schemaDef?.icon
              ? (schemaDef.icon.startsWith('http')
                  ? schemaDef.icon
                  : `${STEAM_STORE_CDN}/${appId}/${schemaDef.icon}.jpg`)
              : null,
            rawValue: isNaN(rarityValue) ? null : rarityValue,
            normalizedPoints: normalized,
            rarity: isNaN(rarityValue) ? null : rarityValue,
            externalUrl: `https://store.steampowered.com/app/${appId}`,
          },
          update: {
            title: schemaDef?.displayName ?? pa.apiname,
            description: schemaDef?.description ?? null,
            rawValue: isNaN(rarityValue) ? null : rarityValue,
            normalizedPoints: normalized,
            rarity: isNaN(rarityValue) ? null : rarityValue,
          },
        });

        if (pa.achieved === 1) {
          await prisma.userAchievement.upsert({
            where: { userId_achievementId: { userId, achievementId: dbAchievement.id } },
            create: {
              userId,
              achievementId: dbAchievement.id,
              unlockedAt: new Date(pa.unlocktime * 1000),
            },
            update: { unlockedAt: new Date(pa.unlocktime * 1000) },
          });
          achievementsSynced++;
        }
      }
    }

    return {
      platform: 'STEAM',
      achievementsSynced,
      gamesUpdated,
      syncedAt: new Date().toISOString(),
    };
  }

  // ─── Métodos privados de fetching con caché Redis ─────────────────────────

  /**
   * Obtiene los juegos del usuario desde la Steam Web API.
   * Caché: steam:games:{steamId}, TTL 1 hora.
   */
  private async fetchOwnedGames(steamId: string, apiKey: string): Promise<SteamOwnedGame[]> {
    return cachedFetch<SteamOwnedGame[]>(
      `steam:games:${steamId}`,
      TTL_GAMES,
      async () => {
        await incrementSteamApiCounter();
        const url = `${STEAM_API_BASE}/IPlayerService/GetOwnedGames/v0001/`;
        const response = await axios.get<{
          response: { games?: SteamOwnedGame[] };
        }>(url, {
          params: {
            key: apiKey,
            steamid: steamId,
            include_appinfo: true,
            include_played_free_games: true,
            format: 'json',
          },
          timeout: 10_000,
        });

        const games = response.data.response.games;
        if (!games) {
          // El perfil puede ser privado o el usuario no tener juegos
          throw new AppError(
            'No se pueden obtener los juegos de Steam. Comprueba que el perfil es público.',
            'STEAM_API_ERROR',
            502,
            { steamId },
          );
        }
        return games;
      },
    );
  }

  /**
   * Obtiene los logros del jugador para un juego concreto.
   * Caché: steam:achievements:{steamId}:{appId}, TTL 30 minutos.
   */
  private async fetchPlayerAchievements(
    steamId: string,
    apiKey: string,
    appId: string,
  ): Promise<SteamPlayerAchievement[]> {
    return cachedFetch<SteamPlayerAchievement[]>(
      `steam:achievements:${steamId}:${appId}`,
      TTL_ACHIEVEMENTS,
      async () => {
        await incrementSteamApiCounter();
        const url = `${STEAM_API_BASE}/ISteamUserStats/GetPlayerAchievements/v0001/`;
        try {
          const response = await axios.get<{
            playerstats: {
              success: boolean;
              error?: string;
              achievements?: SteamPlayerAchievement[];
            };
          }>(url, {
            params: {
              appid: appId,
              key: apiKey,
              steamid: steamId,
              format: 'json',
            },
            timeout: 10_000,
          });

          const { playerstats } = response.data;
          if (!playerstats.success || !playerstats.achievements) {
            // Steam devuelve success: false cuando el perfil es privado o el juego no tiene stats
            return [];
          }
          return playerstats.achievements;
        } catch (error) {
          if (axios.isAxiosError(error) && error.response?.status === 403) {
            throw new AppError(
              'Perfil de Steam privado o sin permisos para acceder a los logros.',
              'STEAM_API_ERROR',
              502,
              { steamId, appId },
            );
          }
          // Para otros errores devolvemos lista vacía y conservamos la última caché
          return [];
        }
      },
    );
  }

  /**
   * Obtiene el schema del juego (metadatos de logros) desde la Steam Web API.
   * Solicita los nombres en español — Steam hace fallback a inglés automáticamente si no hay traducción.
   * Caché: steam:schema:{appId}:es, TTL 24 horas.
   */
  private async fetchGameSchema(apiKey: string, appId: string): Promise<SteamSchemaAchievement[]> {
    return cachedFetch<SteamSchemaAchievement[]>(
      `steam:schema:${appId}:es`,
      TTL_SCHEMA,
      async () => {
        await incrementSteamApiCounter();
        const url = `${STEAM_API_BASE}/ISteamUserStats/GetSchemaForGame/v2/`;
        try {
          const response = await axios.get<{
            game?: {
              availableGameStats?: {
                achievements?: SteamSchemaAchievement[];
              };
            };
          }>(url, {
            params: {
              key: apiKey,
              appid: appId,
              l: 'spanish',
              format: 'json',
            },
            timeout: 10_000,
          });

          return response.data.game?.availableGameStats?.achievements ?? [];
        } catch {
          // Si no hay schema disponible, devolvemos lista vacía
          return [];
        }
      },
    );
  }

  /**
   * Obtiene el porcentaje de rareza global de cada logro para un juego.
   * Devuelve un Map de apiname → porcentaje.
   * Caché: steam:rarity:{appId}, TTL 24 horas.
   */
  private async fetchRarityMap(appId: string): Promise<Map<string, number>> {
    const raw = await cachedFetch<SteamGlobalAchievementPercentage[]>(
      `steam:rarity:${appId}`,
      TTL_RARITY,
      async () => {
        await incrementSteamApiCounter();
        const url = `${STEAM_API_BASE}/ISteamUserStats/GetGlobalAchievementPercentagesForApp/v0002/`;
        try {
          const response = await axios.get<{
            achievementpercentages?: {
              achievements?: SteamGlobalAchievementPercentage[];
            };
          }>(url, {
            params: { gameid: appId, format: 'json' },
            timeout: 10_000,
          });
          return response.data.achievementpercentages?.achievements ?? [];
        } catch {
          return [];
        }
      },
    );

    return new Map(raw.map((entry) => [entry.name, entry.percent]));
  }
}

// Exportar instancia singleton del adapter
export const steamAdapter = new SteamAdapter();

// ─── Fetch de definiciones de logros sin progreso de usuario ─────────────────

export interface SteamAchievementDefinition {
  externalId: string;
  title: string;
  description: string | null;
  iconUrl: string | null;
  rarity: number | null;
  normalizedPoints: number;
}

/**
 * Obtiene las definiciones de logros de un juego de Steam sin requerir un usuario vinculado.
 * Usa GetSchemaForGame + GetGlobalAchievementPercentagesForApp con la API key del sistema.
 * Lanza STEAM_SYSTEM_NOT_CONFIGURED (503) si STEAM_API_KEY no está configurada.
 */
export async function fetchSteamAchievementDefinitions(
  appId: string,
): Promise<SteamAchievementDefinition[]> {
  const apiKey = process.env['STEAM_API_KEY'] ?? '';
  if (!apiKey) {
    throw new AppError(
      'Steam API key del sistema no configurada.',
      'STEAM_SYSTEM_NOT_CONFIGURED',
      503,
    );
  }

  const schemaRaw = await cachedFetch<SteamSchemaAchievement[]>(
    `steam:schema:${appId}:es`,
    TTL_SCHEMA,
    async () => {
      await incrementSteamApiCounter();
      const url = `${STEAM_API_BASE}/ISteamUserStats/GetSchemaForGame/v2/`;
      try {
        const response = await axios.get<{
          game?: { availableGameStats?: { achievements?: SteamSchemaAchievement[] } };
        }>(url, {
          params: { key: apiKey, appid: appId, l: 'spanish', format: 'json' },
          timeout: 10_000,
        });
        return response.data.game?.availableGameStats?.achievements ?? [];
      } catch {
        return [];
      }
    },
  );

  if (schemaRaw.length === 0) return [];

  const rarityRaw = await cachedFetch<SteamGlobalAchievementPercentage[]>(
    `steam:rarity:${appId}`,
    TTL_RARITY,
    async () => {
      await incrementSteamApiCounter();
      const url = `${STEAM_API_BASE}/ISteamUserStats/GetGlobalAchievementPercentagesForApp/v0002/`;
      try {
        const response = await axios.get<{
          achievementpercentages?: { achievements?: SteamGlobalAchievementPercentage[] };
        }>(url, { params: { gameid: appId, format: 'json' }, timeout: 10_000 });
        return response.data.achievementpercentages?.achievements ?? [];
      } catch {
        return [];
      }
    },
  );

  const rarityMap = new Map(rarityRaw.map((e) => [e.name, e.percent]));

  return schemaRaw.map((ach) => {
    const rawRarity = rarityMap.get(ach.name) ?? 100;
    const rarityValue = parseFloat(String(rawRarity));
    return {
      externalId: ach.name,
      title: ach.displayName,
      description: ach.description ?? null,
      iconUrl: ach.icon
        ? ach.icon.startsWith('http')
          ? ach.icon
          : `${STEAM_STORE_CDN}/${appId}/${ach.icon}.jpg`
        : null,
      rarity: isNaN(rarityValue) ? null : rarityValue,
      normalizedPoints: normalizeAchievementPoints(rarityValue),
    };
  });
}
