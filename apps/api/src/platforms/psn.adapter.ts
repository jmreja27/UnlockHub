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
import { getCachedGameMeta, setCachedGameMeta } from './game-cache';
import { normalizePsnAchievementPoints } from './achievement-points';

// ─── Constantes ────────────────────────────────────────────────────────────────

const EXPRESS_TITLE_LIMIT = 10;
const BATCH_SIZE = 10;
const PSN_PROCESS_CONCURRENCY = 5;   // títulos procesados en paralelo dentro de cada lote

const TTL_TITLE_TROPHIES = 86400;    // 24 horas — metadatos de trofeos raramente cambian
const TTL_USER_TITLES   = 3600;     // 1 hora — lista de juegos del usuario
const TTL_SYSTEM_TOKEN  = 55 * 60;  // 55 minutos — tokens PSN expiran en 60 min

// Timeout de aplicación para todas las llamadas a psn-api.
// psn-api usa fetch internamente pero no expone AbortSignal en sus params públicos,
// por lo que el timeout se implementa vía Promise.race.
// Sin timeout, PSN colgada bloquea un slot de worker BullMQ hasta lockDuration (5 min).
const PSN_REQUEST_TIMEOUT_MS = 15_000;

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
  let payload: { sub?: string };
  try {
    payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as { sub?: string };
  } catch {
    throw new AppError('idToken PSN malformado (payload no es JSON válido)', 'PSN_AUTH_ERROR', 502);
  }

  if (!payload.sub) {
    throw new AppError('No se encontró accountId en el idToken PSN', 'PSN_AUTH_ERROR', 502);
  }
  return payload.sub;
}

/**
 * Envuelve una llamada a psn-api con un timeout de aplicación.
 * psn-api no expone AbortSignal en sus parámetros públicos, así que se usa Promise.race.
 * Si PSN no responde en PSN_REQUEST_TIMEOUT_MS ms, rechaza y libera el slot de worker BullMQ.
 */
function withPsnTimeout<T>(fn: () => Promise<T>): Promise<T> {
  return Promise.race([
    fn(),
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error(`PSN request timeout after ${PSN_REQUEST_TIMEOUT_MS}ms`)),
        PSN_REQUEST_TIMEOUT_MS,
      ),
    ),
  ]);
}

/**
 * Wrapper de caché genérico sobre Redis.
 */
async function cachedFetch<T>(key: string, ttl: number, fetcher: () => Promise<T>): Promise<T> {
  const cached = await redis.get(key);
  if (cached !== null) {
    try {
      return JSON.parse(cached) as T;
    } catch {
      // Caché corrupto — borrar y volver a fetchear
      await redis.del(key);
    }
  }
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
    code = await withPsnTimeout(() => exchangeNpssoForAccessCode(npsso));
  } catch {
    throw new AppError(
      'El PSN_SYSTEM_NPSSO ha expirado. Renuévalo en Railway Variables (my.playstation.com → F12 → ssocookie).',
      'PSN_SYSTEM_NPSSO_EXPIRED',
      503,
    );
  }

  const tokens = await withPsnTimeout(() => exchangeAccessCodeForAuthTokens(code));
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
    result = await withPsnTimeout(() => getProfileFromUserName(auth, username));
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
    await withPsnTimeout(() => getUserTitles(auth, accountId, { limit: 1, offset: 0 }));
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
    code = await withPsnTimeout(() => exchangeNpssoForAccessCode(npsso));
  } catch {
    throw new AppError(
      'NPSSO inválido o expirado. Obtén un nuevo token desde ca.account.sony.com',
      'PSN_NPSSO_INVALID',
      400,
    );
  }

  let tokens: Awaited<ReturnType<typeof exchangeAccessCodeForAuthTokens>>;
  try {
    tokens = await withPsnTimeout(() => exchangeAccessCodeForAuthTokens(code));
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
    profile = await withPsnTimeout(() => getProfileFromAccountId(auth, 'me'));
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
        const rarityValue = t.trophyEarnedRate ? parseFloat(t.trophyEarnedRate) : NaN;
        results.push({
          id: `psn:${title.npCommunicationId}:${t.trophyId}`,
          gameId: title.npCommunicationId,
          platform: 'PSN',
          externalId: String(t.trophyId),
          title: t.trophyName ?? String(t.trophyId),
          description: t.trophyDetail ?? null,
          iconUrl: t.trophyIconUrl ?? null,
          rawValue: isNaN(rarityValue) ? null : rarityValue,
          normalizedPoints: normalizePsnAchievementPoints(rarityValue, t.trophyType),
          rarity: isNaN(rarityValue) ? null : rarityValue,
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

  /**
   * Procesa un único título PSN: descarga trofeos, hace upsert de Game + Achievement + UserAchievement.
   * El try/catch externo garantiza que un fallo en este título no cancele el lote completo.
   */
  private async processSingleTitle(
    title: TrophyTitle,
    auth: AuthorizationPayload,
    account: PlatformAccount,
  ): Promise<{ achievementsSynced: number; gamesUpdated: number }> {
    const trophies = await this.fetchMergedTrophies(auth, title, account.externalId);
    if (trophies.length === 0) return { achievementsSynced: 0, gamesUpdated: 0 };

    const totalAchievements =
      title.definedTrophies.bronze +
      title.definedTrophies.silver +
      title.definedTrophies.gold +
      (title.definedTrophies.platinum ?? 0);

    // Caché de metadatos de juego (24h) — evita un game.upsert por título en cada sync
    let dbGame: { id: string };
    const cachedMeta = await getCachedGameMeta('PSN', title.npCommunicationId);
    if (cachedMeta) {
      dbGame = { id: cachedMeta.id };
    } else {
      dbGame = await prisma.game.upsert({
        where: { platform_externalId: { platform: 'PSN', externalId: title.npCommunicationId } },
        create: {
          platform: 'PSN',
          externalId: title.npCommunicationId,
          title: title.trophyTitleName,
          console: title.trophyTitlePlatform ?? null,
          iconUrl: title.trophyTitleIconUrl ?? null,
          headerUrl: null,
          totalAchievements,
        },
        update: {
          title: title.trophyTitleName,
          console: title.trophyTitlePlatform ?? null,
          iconUrl: title.trophyTitleIconUrl ?? null,
          totalAchievements,
        },
      });
      await setCachedGameMeta('PSN', title.npCommunicationId, {
        id: dbGame.id,
        title: title.trophyTitleName,
        iconUrl: title.trophyTitleIconUrl ?? null,
        totalAchievements,
        console: title.trophyTitlePlatform ?? null,
      });
    }

    let achievementsSynced = 0;

    for (const t of trophies) {
      const rarityValue = t.trophyEarnedRate ? parseFloat(t.trophyEarnedRate) : NaN;
      const normalized = normalizePsnAchievementPoints(rarityValue, t.trophyType);
      const dbAchievement = await prisma.achievement.upsert({
        where: { platform_gameId_externalId: { platform: 'PSN', gameId: dbGame.id, externalId: `${title.npCommunicationId}:${t.trophyId}` } },
        create: {
          gameId: dbGame.id,
          platform: 'PSN',
          externalId: `${title.npCommunicationId}:${t.trophyId}`,
          title: t.trophyName ?? String(t.trophyId),
          description: t.trophyDetail ?? null,
          iconUrl: t.trophyIconUrl ?? null,
          rawValue: isNaN(rarityValue) ? null : rarityValue,
          normalizedPoints: normalized,
          rarity: isNaN(rarityValue) ? null : rarityValue,
          externalUrl: `https://psnprofiles.com/${account.username}`,
          trophyType: t.trophyType ?? null,
        },
        update: {
          title: t.trophyName ?? String(t.trophyId),
          description: t.trophyDetail ?? null,
          rawValue: isNaN(rarityValue) ? null : rarityValue,
          normalizedPoints: normalized,
          rarity: isNaN(rarityValue) ? null : rarityValue,
          trophyType: t.trophyType ?? null,
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

    return { achievementsSynced, gamesUpdated: 1 };
  }

  /**
   * Procesa un lote de títulos en paralelo (máx. PSN_PROCESS_CONCURRENCY simultáneos).
   * Cada título tiene aislamiento de fallos: un error en un título no cancela el resto.
   */
  private async processTitles(
    titles: TrophyTitle[],
    auth: AuthorizationPayload,
    account: PlatformAccount,
  ): Promise<SyncResult> {
    let achievementsSynced = 0;
    let gamesUpdated = 0;

    for (let i = 0; i < titles.length; i += PSN_PROCESS_CONCURRENCY) {
      const chunk = titles.slice(i, i + PSN_PROCESS_CONCURRENCY);
      const results = await Promise.allSettled(
        chunk.map((title) => this.processSingleTitle(title, auth, account)),
      );

      for (const result of results) {
        if (result.status === 'fulfilled') {
          achievementsSynced += result.value.achievementsSynced;
          gamesUpdated += result.value.gamesUpdated;
        }
        // título rechazado: el fallo queda aislado y no cancela el lote
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

        // Límite de páginas como failsafe — PSN reporta hasta ~800 títulos; 10 páginas × 800 = amplio margen.
        const MAX_PAGES = 10;
        let pages = 0;
        try {
          // eslint-disable-next-line no-constant-condition
          while (true) {
            const response = await withPsnTimeout(() => getUserTitles(auth, accountId, { limit, offset }));
            allTitles.push(...response.trophyTitles);
            pages++;
            if (allTitles.length >= response.totalItemCount || !response.nextOffset || pages >= MAX_PAGES) break;
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
        () => withPsnTimeout(() => getTitleTrophies(auth, npCommunicationId, 'all', opts)),
      ),
      withPsnTimeout(() => getUserTrophiesEarnedForTitle(auth, accountId, npCommunicationId, 'all', opts)),
    ]);

    // Indexar estado ganado por trophyId para merge O(1)
    // ?? [] como defensa ante respuestas malformadas de PSN (tipo tipeado pero runtime puede diferir)
    const earnedMap = new Map<number, UserThinTrophy>();
    for (const ut of (earnedRes.trophies ?? [])) {
      earnedMap.set(ut.trophyId, ut);
    }

    return (titleTrophiesRes.trophies ?? []).map((t) => {
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
      const fresh = await withPsnTimeout(() => exchangeRefreshTokenForAuthTokens(stored.refreshToken));
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

    const fresh = await withPsnTimeout(() => exchangeRefreshTokenForAuthTokens(stored.refreshToken));
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
