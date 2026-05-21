import {
  exchangeNpssoForAccessCode,
  exchangeAccessCodeForAuthTokens,
  exchangeRefreshTokenForAuthTokens,
  getProfileFromAccountId,
  getProfileFromUserName,
  getUserTitles,
  getTitleTrophies,
  getUserTrophiesEarnedForTitle,
} from 'psn-api';
import type {
  AuthorizationPayload,
  TrophyTitle,
  Trophy,
  UserThinTrophy,
} from 'psn-api';
import type { PlatformAccount } from '@prisma/client';
import type { Achievement, Game, SyncResult } from '@unlockhub/types';

import { encrypt, decrypt } from '../lib/crypto';
import { prisma } from '../lib/prisma';
import { redis } from '../lib/redis';
import { AppError } from '../middleware/errorHandler';

import type { PlatformAdapter, SyncBatchCallback } from './platform.interface';

// ─── Constantes ────────────────────────────────────────────────────────────────

const EXPRESS_TITLE_LIMIT = 10;
const BATCH_SIZE = 10;

const TTL_TITLE_TROPHIES = 86400;    // 24 horas — metadatos de trofeos raramente cambian
const TTL_USER_TITLES   = 3600;     // 1 hora — lista de juegos del usuario
const TTL_SYSTEM_TOKEN  = 55 * 60;  // 55 minutos — tokens PSN expiran en 60 min

// Puntos normalizados por tipo de trofeo PSN
const TROPHY_POINTS: Record<string, number> = {
  bronze:   15,
  silver:   30,
  gold:     90,
  platinum: 300,
};

// Clave Redis del access token del sistema
const REDIS_SYSTEM_TOKEN_KEY = 'psn:system:access_token';

// ─── Tipos internos ───────────────────────────────────────────────────────────

interface PsnStoredTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;          // ISO 8601
  refreshTokenExpiresAt: string; // ISO 8601
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Extrae el accountId numérico del idToken JWT (claim `sub`).
 * No se verifica la firma — el token procede directamente de PSN.
 */
function extractAccountIdFromIdToken(idToken: string): string {
  const parts = idToken.split('.');
  if (parts.length !== 3 || !parts[1]) {
    throw new AppError('idToken PSN inválido', 'PSN_AUTH_ERROR', 502);
  }
  const payload = JSON.parse(
    Buffer.from(parts[1], 'base64url').toString('utf8'),
  ) as { sub?: string };

  if (!payload.sub) {
    throw new AppError('No se encontró accountId en el idToken PSN', 'PSN_AUTH_ERROR', 502);
  }
  return payload.sub;
}

/**
 * Devuelve puntos normalizados en función del tipo de trofeo y la rareza.
 */
function normalizePoints(trophyType: string, earnedRate?: string): number {
  const base = TROPHY_POINTS[trophyType.toLowerCase()] ?? 15;
  if (!earnedRate) return base;
  const rarity = parseFloat(earnedRate);
  if (isNaN(rarity) || rarity < 0 || rarity > 100) return base;
  const multiplier = 1 + (1 - rarity / 100);
  return Math.round(base * multiplier);
}

/**
 * Wrapper de caché genérico sobre Redis.
 */
async function cachedFetch<T>(key: string, ttl: number, fetcher: () => Promise<T>): Promise<T> {
  const cached = await redis.get(key);
  if (cached !== null) return JSON.parse(cached) as T;
  const value = await fetcher();
  await redis.setex(key, ttl, JSON.stringify(value));
  return value;
}

// ─── Auth del sistema ─────────────────────────────────────────────────────────

/**
 * Devuelve el AuthorizationPayload usando las credenciales del sistema (PSN_SYSTEM_NPSSO).
 * El access token se cachea en Redis con TTL de 55 min para reutilizarlo entre llamadas.
 * Si el token no está en caché, lo obtiene intercambiando el NPSSO del sistema.
 */
export async function getSystemPsnAuth(): Promise<AuthorizationPayload> {
  const npsso = process.env.PSN_SYSTEM_NPSSO;
  if (!npsso) {
    throw new AppError(
      'PSN_SYSTEM_NPSSO no está configurado. Configúrala en Railway Variables para habilitar el sync de PSN.',
      'PSN_SYSTEM_NOT_CONFIGURED',
      503,
    );
  }

  const cached = await redis.get(REDIS_SYSTEM_TOKEN_KEY);
  if (cached) return { accessToken: cached };

  let code: string;
  try {
    code = await exchangeNpssoForAccessCode(npsso);
  } catch {
    throw new AppError(
      'El PSN_SYSTEM_NPSSO ha expirado. Renuévalo en Railway Variables (my.playstation.com → F12 → ssocookie).',
      'PSN_SYSTEM_NPSSO_EXPIRED',
      503,
    );
  }

  const tokens = await exchangeAccessCodeForAuthTokens(code);
  await redis.setex(REDIS_SYSTEM_TOKEN_KEY, TTL_SYSTEM_TOKEN, tokens.accessToken);

  return { accessToken: tokens.accessToken };
}

/**
 * Resuelve un username de PSN a su accountId numérico y onlineId canónico.
 * Lanza PSN_USER_NOT_FOUND solo si el usuario no existe.
 * Perfiles privados tienen éxito aquí — la privacidad se detecta en checkPsnProfilePrivacy().
 */
export async function lookupPsnUser(
  auth: AuthorizationPayload,
  username: string,
): Promise<{ accountId: string; onlineId: string }> {
  let result: Awaited<ReturnType<typeof getProfileFromUserName>>;
  try {
    result = await getProfileFromUserName(auth, username);
  } catch {
    throw new AppError(
      'No se encontró ninguna cuenta de PSN con ese username. Comprueba que el nombre de usuario es correcto.',
      'PSN_USER_NOT_FOUND',
      404,
    );
  }

  return {
    accountId: result.profile.accountId,
    onlineId: result.profile.onlineId,
  };
}

/**
 * Comprueba si el perfil PSN de un accountId tiene los trofeos accesibles públicamente.
 * Devuelve true si el perfil es privado (getUserTitles lanza), false si es público.
 * Conservador: cualquier error al obtener títulos se trata como perfil privado.
 */
export async function checkPsnProfilePrivacy(
  auth: AuthorizationPayload,
  accountId: string,
): Promise<boolean> {
  try {
    await getUserTitles(auth, accountId, { limit: 1, offset: 0 });
    return false;
  } catch {
    return true;
  }
}

// ─── Funciones legacy de autenticación de usuario ────────────────────────────
// Mantenidas para compatibilidad con scripts/seed-games.ts que gestiona su propio NPSSO.

/**
 * Intercambia un NPSSO por tokens cifrados y accountId.
 * Solo se usa en el seed script — en producción el sistema usa PSN_SYSTEM_NPSSO.
 */
export async function exchangeNpssoForPsnTokens(npsso: string): Promise<{
  encryptedTokenJson: string;
  accountId: string;
  onlineId: string;
}> {
  let code: string;
  try {
    code = await exchangeNpssoForAccessCode(npsso);
  } catch {
    throw new AppError(
      'NPSSO inválido o expirado. Obtén un nuevo token desde ca.account.sony.com',
      'PSN_NPSSO_INVALID',
      400,
    );
  }

  let tokens: Awaited<ReturnType<typeof exchangeAccessCodeForAuthTokens>>;
  try {
    tokens = await exchangeAccessCodeForAuthTokens(code);
  } catch {
    throw new AppError(
      'No se pudo obtener el access token de PSN. Inténtalo de nuevo.',
      'PSN_TOKEN_EXCHANGE_ERROR',
      502,
    );
  }

  const accountId = extractAccountIdFromIdToken(tokens.idToken);

  const auth: AuthorizationPayload = { accessToken: tokens.accessToken };
  let profile: Awaited<ReturnType<typeof getProfileFromAccountId>>;
  try {
    profile = await getProfileFromAccountId(auth, 'me');
  } catch {
    throw new AppError(
      'No se pudo obtener el perfil de PSN.',
      'PSN_PROFILE_ERROR',
      502,
    );
  }

  const stored: PsnStoredTokens = {
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    expiresAt: new Date(Date.now() + tokens.expiresIn * 1000).toISOString(),
    refreshTokenExpiresAt: new Date(
      Date.now() + tokens.refreshTokenExpiresIn * 1000,
    ).toISOString(),
  };

  return {
    encryptedTokenJson: encrypt(JSON.stringify(stored)),
    accountId,
    onlineId: profile.onlineId,
  };
}

// ─── PSN Adapter ──────────────────────────────────────────────────────────────

export class PsnAdapter implements PlatformAdapter {
  readonly platform = 'PSN' as const;

  // ── getUserAchievements ────────────────────────────────────────────────────

  async getUserAchievements(accountId: string): Promise<Achievement[]> {
    const auth = await getSystemPsnAuth();
    const titles = await this.fetchUserTitles(auth, accountId);
    const results: Achievement[] = [];

    for (const title of titles) {
      const trophies = await this.fetchMergedTrophies(auth, title, accountId);
      for (const t of trophies) {
        results.push({
          id: `psn:${title.npCommunicationId}:${t.trophyId}`,
          gameId: title.npCommunicationId,
          platform: 'PSN',
          externalId: String(t.trophyId),
          title: t.trophyName ?? String(t.trophyId),
          description: t.trophyDetail ?? null,
          iconUrl: t.trophyIconUrl ?? null,
          rawValue: t.trophyEarnedRate ? parseFloat(t.trophyEarnedRate) : null,
          normalizedPoints: normalizePoints(t.trophyType, t.trophyEarnedRate),
          rarity: t.trophyEarnedRate ? parseFloat(t.trophyEarnedRate) : null,
          externalUrl: null,
        });
      }
    }

    return results;
  }

  // ── getGameInfo ────────────────────────────────────────────────────────────

  async getGameInfo(npCommunicationId: string): Promise<Game> {
    const cacheKey = `psn:gameinfo:${npCommunicationId}`;
    const cached = await redis.get(cacheKey);
    if (cached !== null) return JSON.parse(cached) as Game;

    const game: Game = {
      id: npCommunicationId,
      platform: 'PSN',
      externalId: npCommunicationId,
      title: `PSN Game ${npCommunicationId}`,
      console: null,
      iconUrl: null,
      headerUrl: null,
      totalAchievements: 0,
    };

    await redis.setex(cacheKey, TTL_TITLE_TROPHIES, JSON.stringify(game));
    return game;
  }

  // ── syncUser ───────────────────────────────────────────────────────────────

  async syncUser(account: PlatformAccount): Promise<SyncResult> {
    const auth = await getSystemPsnAuth();
    const titles = await this.fetchUserTitles(auth, account.externalId);
    return this.processTitles(titles, auth, account);
  }

  // ── syncUserExpress ────────────────────────────────────────────────────────

  async syncUserExpress(account: PlatformAccount): Promise<SyncResult> {
    const auth = await getSystemPsnAuth();
    // PSN devuelve títulos ordenados por última actividad — los primeros N son los más recientes
    const titles = (await this.fetchUserTitles(auth, account.externalId)).slice(0, EXPRESS_TITLE_LIMIT);
    return this.processTitles(titles, auth, account);
  }

  // ── syncUserBatched ────────────────────────────────────────────────────────

  async syncUserBatched(account: PlatformAccount, onBatch: SyncBatchCallback): Promise<SyncResult> {
    const auth = await getSystemPsnAuth();
    const titles = await this.fetchUserTitles(auth, account.externalId);
    const total = titles.length;
    let achievementsSynced = 0;
    let gamesUpdated = 0;
    let processed = 0;

    for (let i = 0; i < titles.length; i += BATCH_SIZE) {
      const batch = titles.slice(i, i + BATCH_SIZE);
      const batchResult = await this.processTitles(batch, auth, account);

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
      platform: 'PSN',
      achievementsSynced,
      gamesUpdated,
      syncedAt: new Date().toISOString(),
    };
  }

  // ── Lógica de procesamiento compartida ────────────────────────────────────

  private async processTitles(
    titles: TrophyTitle[],
    auth: AuthorizationPayload,
    account: PlatformAccount,
  ): Promise<SyncResult> {
    let achievementsSynced = 0;
    let gamesUpdated = 0;

    for (const title of titles) {
      const trophies = await this.fetchMergedTrophies(auth, title, account.externalId);
      if (trophies.length === 0) continue;

      const dbGame = await prisma.game.upsert({
        where: { platform_externalId: { platform: 'PSN', externalId: title.npCommunicationId } },
        create: {
          platform: 'PSN',
          externalId: title.npCommunicationId,
          title: title.trophyTitleName,
          console: title.trophyTitlePlatform ?? null,
          iconUrl: title.trophyTitleIconUrl ?? null,
          headerUrl: null,
          totalAchievements: title.definedTrophies.bronze +
            title.definedTrophies.silver +
            title.definedTrophies.gold +
            (title.definedTrophies.platinum ?? 0),
        },
        update: {
          title: title.trophyTitleName,
          console: title.trophyTitlePlatform ?? null,
          iconUrl: title.trophyTitleIconUrl ?? null,
          totalAchievements: title.definedTrophies.bronze +
            title.definedTrophies.silver +
            title.definedTrophies.gold +
            (title.definedTrophies.platinum ?? 0),
        },
      });

      gamesUpdated++;

      for (const t of trophies) {
        const dbAchievement = await prisma.achievement.upsert({
          where: { platform_gameId_externalId: { platform: 'PSN', gameId: dbGame.id, externalId: `${title.npCommunicationId}:${t.trophyId}` } },
          create: {
            gameId: dbGame.id,
            platform: 'PSN',
            externalId: `${title.npCommunicationId}:${t.trophyId}`,
            title: t.trophyName ?? String(t.trophyId),
            description: t.trophyDetail ?? null,
            iconUrl: t.trophyIconUrl ?? null,
            rawValue: t.trophyEarnedRate ? parseFloat(t.trophyEarnedRate) : null,
            normalizedPoints: normalizePoints(t.trophyType, t.trophyEarnedRate),
            rarity: t.trophyEarnedRate ? parseFloat(t.trophyEarnedRate) : null,
            externalUrl: `https://psnprofiles.com/${account.username}`,
          },
          update: {
            title: t.trophyName ?? String(t.trophyId),
            description: t.trophyDetail ?? null,
            rawValue: t.trophyEarnedRate ? parseFloat(t.trophyEarnedRate) : null,
            normalizedPoints: normalizePoints(t.trophyType, t.trophyEarnedRate),
            rarity: t.trophyEarnedRate ? parseFloat(t.trophyEarnedRate) : null,
          },
        });

        if (t.earned && t.earnedDateTime) {
          await prisma.userAchievement.upsert({
            where: { userId_achievementId: { userId: account.userId, achievementId: dbAchievement.id } },
            create: {
              userId: account.userId,
              achievementId: dbAchievement.id,
              unlockedAt: new Date(t.earnedDateTime),
            },
            update: { unlockedAt: new Date(t.earnedDateTime) },
          });
          achievementsSynced++;
        }
      }
    }

    return { platform: 'PSN', achievementsSynced, gamesUpdated, syncedAt: new Date().toISOString() };
  }

  // ─── Métodos privados ─────────────────────────────────────────────────────

  /**
   * Obtiene la lista de títulos con trofeos del usuario identificado por accountId.
   * Pagina automáticamente hasta el límite de 800 resultados.
   * Lanza PSN_PROFILE_PRIVATE si PSN deniega el acceso (perfil privado).
   */
  private async fetchUserTitles(
    auth: AuthorizationPayload,
    accountId: string,
  ): Promise<TrophyTitle[]> {
    return cachedFetch<TrophyTitle[]>(
      `psn:titles:${accountId}`,
      TTL_USER_TITLES,
      async () => {
        const allTitles: TrophyTitle[] = [];
        let offset = 0;
        const limit = 800;

        try {
          // eslint-disable-next-line no-constant-condition
          while (true) {
            const response = await getUserTitles(auth, accountId, { limit, offset });
            allTitles.push(...response.trophyTitles);
            if (allTitles.length >= response.totalItemCount || !response.nextOffset) break;
            offset = response.nextOffset;
          }
        } catch {
          // PSN lanza un error al intentar leer trofeos de un perfil privado
          throw new AppError(
            'El perfil PSN tiene los trofeos configurados como privados.',
            'PSN_PROFILE_PRIVATE',
            403,
          );
        }

        return allTitles;
      },
    );
  }

  /**
   * Obtiene los metadatos de trofeos y el estado ganado del usuario para un título,
   * y los fusiona en un único array por trophyId.
   */
  private async fetchMergedTrophies(
    auth: AuthorizationPayload,
    title: TrophyTitle,
    accountId: string,
  ): Promise<Array<Trophy & Pick<UserThinTrophy, 'earned' | 'earnedDateTime'>>> {
    const { npCommunicationId, npServiceName } = title;
    const opts = { npServiceName };

    const [titleTrophiesRes, earnedRes] = await Promise.all([
      cachedFetch(
        `psn:trophies:${npCommunicationId}:${npServiceName}`,
        TTL_TITLE_TROPHIES,
        () => getTitleTrophies(auth, npCommunicationId, 'all', opts),
      ),
      getUserTrophiesEarnedForTitle(auth, accountId, npCommunicationId, 'all', opts),
    ]);

    // Indexar estado ganado por trophyId para merge O(1)
    const earnedMap = new Map<number, UserThinTrophy>();
    for (const ut of earnedRes.trophies) {
      earnedMap.set(ut.trophyId, ut);
    }

    return titleTrophiesRes.trophies.map((t) => {
      const earned = earnedMap.get(t.trophyId);
      return {
        ...t,
        earned: earned?.earned ?? false,
        earnedDateTime: earned?.earnedDateTime,
      };
    });
  }

  // ─── Métodos legacy — mantenidos para scripts/seed-games.ts ───────────────

  /**
   * Construye AuthorizationPayload desde el token cifrado almacenado.
   * No persiste el token actualizado — solo para uso puntual.
   */
  async buildAuth(encryptedTokenJson: string): Promise<AuthorizationPayload> {
    let stored: PsnStoredTokens;
    try {
      stored = JSON.parse(decrypt(encryptedTokenJson)) as PsnStoredTokens;
    } catch {
      throw new AppError('Token PSN corrupto o inválido', 'PSN_TOKEN_CORRUPT', 401);
    }
    if (new Date(stored.expiresAt) <= new Date()) {
      const fresh = await exchangeRefreshTokenForAuthTokens(stored.refreshToken);
      return { accessToken: fresh.accessToken };
    }
    return { accessToken: stored.accessToken };
  }

  /**
   * Construye AuthorizationPayload con renovación automática del access token.
   * Devuelve el token cifrado actualizado para persistirlo si hubo renovación.
   * Mantenido para compatibilidad con seed-games.ts — el sync de usuarios usa getSystemPsnAuth().
   */
  async buildAuthWithRefresh(
    account: PlatformAccount,
  ): Promise<{ auth: AuthorizationPayload; updatedEncryptedToken: string | null }> {
    let stored: PsnStoredTokens;
    try {
      stored = JSON.parse(decrypt(account.encryptedToken)) as PsnStoredTokens;
    } catch {
      throw new AppError('Token PSN corrupto o inválido', 'PSN_TOKEN_CORRUPT', 401);
    }

    if (new Date(stored.expiresAt) > new Date()) {
      return { auth: { accessToken: stored.accessToken }, updatedEncryptedToken: null };
    }

    if (new Date(stored.refreshTokenExpiresAt) <= new Date()) {
      throw new AppError(
        'El refresh token de PSN ha expirado.',
        'PSN_REFRESH_TOKEN_EXPIRED',
        401,
      );
    }

    const fresh = await exchangeRefreshTokenForAuthTokens(stored.refreshToken);
    const newStored: PsnStoredTokens = {
      accessToken: fresh.accessToken,
      refreshToken: fresh.refreshToken,
      expiresAt: new Date(Date.now() + fresh.expiresIn * 1000).toISOString(),
      refreshTokenExpiresAt: new Date(
        Date.now() + fresh.refreshTokenExpiresIn * 1000,
      ).toISOString(),
    };

    return {
      auth: { accessToken: fresh.accessToken },
      updatedEncryptedToken: encrypt(JSON.stringify(newStored)),
    };
  }
}

export const psnAdapter = new PsnAdapter();
