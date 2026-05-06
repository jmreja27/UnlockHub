import axios from 'axios';
import type { PlatformAccount } from '@prisma/client';
import type { Achievement, Game, SyncResult } from '@unlockhub/types';

import type { PlatformAdapter } from './platform.interface';
import { decrypt } from '../lib/crypto';
import { prisma } from '../lib/prisma';
import { redis } from '../lib/redis';
import { AppError } from '../middleware/errorHandler';

// ─── Constantes ────────────────────────────────────────────────────────────────

const STEAM_API_BASE = 'https://api.steampowered.com';
const STEAM_STORE_CDN = 'https://media.steampowered.com/steamcommunity/public/images/apps';

// TTLs de caché en segundos
const TTL_GAMES = 3600;         // 1 hora
const TTL_ACHIEVEMENTS = 1800;  // 30 minutos
const TTL_SCHEMA = 86400;       // 24 horas
const TTL_RARITY = 86400;       // 24 horas

// ─── Tipos internos de la Steam Web API ───────────────────────────────────────

interface SteamOwnedGame {
  appid: number;
  name: string;
  img_icon_url: string;
  has_community_visible_stats?: boolean;
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
 * Normaliza los puntos de un logro en función de su rareza.
 * Fórmula: Math.round((1 - rarity/100) * 100), mínimo 1, máximo 100.
 */
function normalizePoints(rarityPercent: number): number {
  const raw = Math.round((1 - rarityPercent / 100) * 100);
  return Math.max(1, Math.min(100, raw));
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

// ─── Steam Adapter ────────────────────────────────────────────────────────────

export class SteamAdapter implements PlatformAdapter {
  readonly platform = 'STEAM' as const;

  // ── getUserAchievements ────────────────────────────────────────────────────

  async getUserAchievements(steamId: string, apiKey: string): Promise<Achievement[]> {
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
        const rarityPercent = rarityMap.get(pa.apiname) ?? 100;
        const normalized = normalizePoints(rarityPercent);

        allAchievements.push({
          id: `steam:${appId}:${pa.apiname}`,
          gameId: appId,
          platform: 'STEAM',
          externalId: pa.apiname,
          title: schemaDef?.displayName ?? pa.apiname,
          description: schemaDef?.description ?? null,
          iconUrl: schemaDef?.icon
            ? `${STEAM_STORE_CDN}/${appId}/${schemaDef.icon}.jpg`
            : null,
          rawValue: rarityPercent,
          normalizedPoints: normalized,
          rarity: rarityPercent,
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
      iconUrl: null,
      headerUrl: `https://cdn.cloudflare.steamstatic.com/steam/apps/${externalId}/header.jpg`,
      totalAchievements: 0,
    };
  }

  // ── syncUser ───────────────────────────────────────────────────────────────

  async syncUser(account: PlatformAccount): Promise<SyncResult> {
    // 1. Desencriptar el token para obtener la API key de Steam
    const apiKey = decrypt(account.encryptedToken);
    const steamId = account.externalId;

    // 2. Obtener juegos del usuario
    const games = await this.fetchOwnedGames(steamId, apiKey);

    let achievementsSynced = 0;
    let gamesUpdated = 0;

    for (const steamGame of games) {
      const appId = String(steamGame.appid);

      if (!steamGame.has_community_visible_stats) continue;

      // 3. Obtener logros, schema y rareza en paralelo para cada juego
      const [playerAchievements, schema, rarityMap] = await Promise.all([
        this.fetchPlayerAchievements(steamId, apiKey, appId),
        this.fetchGameSchema(apiKey, appId),
        this.fetchRarityMap(appId),
      ]);

      const schemaMap = new Map(schema.map((s) => [s.name, s]));

      // 4. Upsert del juego en la BD
      const dbGame = await prisma.game.upsert({
        where: { platform_externalId: { platform: 'STEAM', externalId: appId } },
        create: {
          platform: 'STEAM',
          externalId: appId,
          title: steamGame.name,
          iconUrl: steamGame.img_icon_url
            ? `${STEAM_STORE_CDN}/${appId}/${steamGame.img_icon_url}.jpg`
            : null,
          headerUrl: `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/header.jpg`,
          totalAchievements: schema.length,
        },
        update: {
          title: steamGame.name,
          totalAchievements: schema.length,
        },
      });

      gamesUpdated++;

      // 5. Upsert de cada logro y de UserAchievement si está desbloqueado
      for (const pa of playerAchievements) {
        const schemaDef = schemaMap.get(pa.apiname);
        const rarityPercent = rarityMap.get(pa.apiname) ?? 100;
        const normalized = normalizePoints(rarityPercent);

        const dbAchievement = await prisma.achievement.upsert({
          where: { platform_externalId: { platform: 'STEAM', externalId: pa.apiname } },
          create: {
            gameId: dbGame.id,
            platform: 'STEAM',
            externalId: pa.apiname,
            title: schemaDef?.displayName ?? pa.apiname,
            description: schemaDef?.description ?? null,
            iconUrl: schemaDef?.icon
              ? `${STEAM_STORE_CDN}/${appId}/${schemaDef.icon}.jpg`
              : null,
            rawValue: rarityPercent,
            normalizedPoints: normalized,
            rarity: rarityPercent,
            externalUrl: `https://store.steampowered.com/app/${appId}`,
          },
          update: {
            title: schemaDef?.displayName ?? pa.apiname,
            description: schemaDef?.description ?? null,
            rawValue: rarityPercent,
            normalizedPoints: normalized,
            rarity: rarityPercent,
          },
        });

        // 6. Upsert de UserAchievement solo si el logro está desbloqueado
        if (pa.achieved === 1) {
          await prisma.userAchievement.upsert({
            where: {
              userId_achievementId: {
                userId: account.userId,
                achievementId: dbAchievement.id,
              },
            },
            create: {
              userId: account.userId,
              achievementId: dbAchievement.id,
              unlockedAt: new Date(pa.unlocktime * 1000),
            },
            update: {
              unlockedAt: new Date(pa.unlocktime * 1000),
            },
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
   * Caché: steam:schema:{appId}, TTL 24 horas.
   */
  private async fetchGameSchema(apiKey: string, appId: string): Promise<SteamSchemaAchievement[]> {
    return cachedFetch<SteamSchemaAchievement[]>(
      `steam:schema:${appId}`,
      TTL_SCHEMA,
      async () => {
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
              format: 'json',
            },
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
        const url = `${STEAM_API_BASE}/ISteamUserStats/GetGlobalAchievementPercentagesForApp/v0002/`;
        try {
          const response = await axios.get<{
            achievementpercentages?: {
              achievements?: SteamGlobalAchievementPercentage[];
            };
          }>(url, {
            params: { gameid: appId, format: 'json' },
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
