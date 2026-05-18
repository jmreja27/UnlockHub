import {
  exchangeNpssoForAccessCode,
  exchangeAccessCodeForAuthTokens,
  exchangeRefreshTokenForAuthTokens,
  getProfileFromAccountId,
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

import type { PlatformAdapter } from './platform.interface';

// ─── Constantes ────────────────────────────────────────────────────────────────

const TTL_TITLE_TROPHIES = 86400;    // 24 horas — metadatos de trofeos raramente cambian
const TTL_USER_TITLES   = 3600;     // 1 hora — lista de juegos del usuario

// Puntos normalizados por tipo de trofeo PSN
const TROPHY_POINTS: Record<string, number> = {
  bronze:   15,
  silver:   30,
  gold:     90,
  platinum: 300,
};

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
 * Los puntos base del tipo de trofeo se ajustan con un multiplicador de rareza.
 */
function normalizePoints(trophyType: string, earnedRate?: string): number {
  const base = TROPHY_POINTS[trophyType.toLowerCase()] ?? 15;
  if (!earnedRate) return base;
  const rarity = parseFloat(earnedRate);
  if (isNaN(rarity) || rarity < 0 || rarity > 100) return base;
  // Rareza como multiplicador: trofeos más raros valen hasta 2x los puntos base
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

// ─── Funciones públicas de autenticación PSN ──────────────────────────────────

/**
 * Intercambia un NPSSO por un objeto con access token, refresh token y accountId.
 * Llamado desde el controller al vincular la cuenta — nunca desde el worker.
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
      'No se pudo obtener el perfil de PSN. Comprueba que el perfil es público.',
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

  async getUserAchievements(onlineId: string, encryptedTokenJson: string): Promise<Achievement[]> {
    const auth = await this.buildAuth(encryptedTokenJson);
    const titles = await this.fetchUserTitles(auth, onlineId);
    const results: Achievement[] = [];

    for (const title of titles) {
      const trophies = await this.fetchMergedTrophies(auth, title);
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
          externalUrl: `https://psnprofiles.com/${onlineId}`,
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
    const { auth, updatedEncryptedToken } = await this.buildAuthWithRefresh(account);

    // Si el token fue refrescado, persiste el nuevo token cifrado
    if (updatedEncryptedToken) {
      await prisma.platformAccount.update({
        where: { id: account.id },
        data: { encryptedToken: updatedEncryptedToken },
      });
    }

    const titles = await this.fetchUserTitles(auth, account.username);
    let achievementsSynced = 0;
    let gamesUpdated = 0;

    for (const title of titles) {
      const trophies = await this.fetchMergedTrophies(auth, title);

      // Nunca persistir juegos sin trofeos (DLC sin soporte, demo packs, etc.)
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
            where: {
              userId_achievementId: {
                userId: account.userId,
                achievementId: dbAchievement.id,
              },
            },
            create: {
              userId: account.userId,
              achievementId: dbAchievement.id,
              unlockedAt: new Date(t.earnedDateTime),
            },
            update: {
              unlockedAt: new Date(t.earnedDateTime),
            },
          });
          achievementsSynced++;
        }
      }
    }

    return { platform: 'PSN', achievementsSynced, gamesUpdated, syncedAt: new Date().toISOString() };
  }

  // ─── Métodos privados ─────────────────────────────────────────────────────

  /**
   * Construye el AuthorizationPayload desde el token cifrado.
   * Solo se usa en casos donde no necesitamos persistir el token refrescado.
   */
  private async buildAuth(encryptedTokenJson: string): Promise<AuthorizationPayload> {
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
   * Construye el AuthorizationPayload desde la cuenta en BD.
   * Si el access token expiró, usa el refresh token para obtener uno nuevo
   * y devuelve el token cifrado actualizado para persistirlo.
   */
  private async buildAuthWithRefresh(
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
        'El refresh token de PSN ha expirado. El usuario debe volver a vincular su cuenta.',
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

  /**
   * Obtiene la lista de títulos con trofeos del usuario.
   * Pagina automáticamente hasta el límite de 800 resultados.
   */
  private async fetchUserTitles(
    auth: AuthorizationPayload,
    onlineId: string,
  ): Promise<TrophyTitle[]> {
    return cachedFetch<TrophyTitle[]>(
      `psn:titles:${onlineId}`,
      TTL_USER_TITLES,
      async () => {
        const allTitles: TrophyTitle[] = [];
        let offset = 0;
        const limit = 800;

        // eslint-disable-next-line no-constant-condition
        while (true) {
          const response = await getUserTitles(auth, 'me', { limit, offset });
          allTitles.push(...response.trophyTitles);
          if (allTitles.length >= response.totalItemCount || !response.nextOffset) break;
          offset = response.nextOffset;
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
  ): Promise<Array<Trophy & Pick<UserThinTrophy, 'earned' | 'earnedDateTime'>>> {
    const { npCommunicationId, npServiceName } = title;
    const opts = { npServiceName };

    const [titleTrophiesRes, earnedRes] = await Promise.all([
      cachedFetch(
        `psn:trophies:${npCommunicationId}:${npServiceName}`,
        TTL_TITLE_TROPHIES,
        () => getTitleTrophies(auth, npCommunicationId, 'all', opts),
      ),
      getUserTrophiesEarnedForTitle(auth, 'me', npCommunicationId, 'all', opts),
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
}

export const psnAdapter = new PsnAdapter();
