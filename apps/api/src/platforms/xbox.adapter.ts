import axios from 'axios';
import type { PlatformAccount } from '@prisma/client';
import type { Achievement, Game, SyncResult } from '@unlockhub/types';

import { encrypt, decrypt } from '../lib/crypto';
import { prisma } from '../lib/prisma';
import { redis } from '../lib/redis';
import { AppError } from '../middleware/errorHandler';

import type { PlatformAdapter } from './platform.interface';

// ─── Constantes ────────────────────────────────────────────────────────────────

const MS_TOKEN_URL = 'https://login.microsoftonline.com/consumers/oauth2/v2.0/token';
const XBL_AUTH_URL = 'https://user.auth.xboxlive.com/user/authenticate';
const XSTS_AUTH_URL = 'https://xsts.auth.xboxlive.com/xsts/authorize';
const XBOX_PROFILE_URL = 'https://profile.xboxlive.com/users/me/profile/settings';
const XBOX_ACHIEVEMENTS_URL = (xuid: string) =>
  `https://achievements.xboxlive.com/users/xuid(${xuid})/achievements`;

const TTL_ACHIEVEMENTS = 1800; // 30 minutos

// ─── Tipos internos ───────────────────────────────────────────────────────────

interface XboxStoredTokens {
  msRefreshToken: string;
  msAccessToken: string;
  msTokenExpiresAt: string; // ISO 8601
}

interface MsTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

interface XblTokenResponse {
  Token: string;
  DisplayClaims: { xui: Array<{ uhs: string }> };
}

interface XstsTokenResponse {
  Token: string;
  DisplayClaims: { xui: Array<{ uhs: string; xid: string }> };
}

interface XboxProfileResponse {
  profileUsers: Array<{
    id: string;
    settings: Array<{ id: string; value: string }>;
  }>;
}

interface XboxAchievement {
  id: string;
  name: string;
  description?: string;
  lockedDescription?: string;
  productId?: string;
  titleAssociations: Array<{ name: string; id: number }>;
  progressState: 'Achieved' | 'InProgress' | 'NotStarted';
  progression: {
    achievementState: string;
    timeUnlocked: string; // ISO 8601 o ""
  };
  mediaAssets: Array<{ name: string; type: string; url: string }>;
  isSecret: boolean;
  rewards: Array<{
    name: string | null;
    value: string;
    type: string; // "Gamerscore" | "Art" | ...
    valueType: string;
  }>;
}

interface XboxAchievementsResponse {
  achievements: XboxAchievement[];
  pagingInfo?: { continuationToken?: string };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Normaliza el Gamerscore de Xbox al rango de puntos de UnlockHub.
 * Fórmula: Gamerscore / 10, mínimo 1.
 */
function normalizePoints(gamerscore: number): number {
  return Math.max(1, Math.round(gamerscore / 10));
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

// ─── Funciones públicas de autenticación Xbox ─────────────────────────────────

/**
 * Intercambia el código OAuth2 PKCE por tokens de MS + perfil Xbox.
 * Llamado desde el controller al vincular la cuenta.
 */
export async function exchangeXboxCodeForTokens(
  code: string,
  codeVerifier: string,
  redirectUri: string,
): Promise<{
  tokenJson: string;
  xuid: string;
  gamertag: string;
}> {
  const clientId = process.env['XBOX_CLIENT_ID'];
  if (!clientId) {
    throw new AppError('XBOX_CLIENT_ID no configurado', 'XBOX_CONFIG_ERROR', 500);
  }

  // 1. Intercambiar código por tokens de Microsoft
  const msTokens = await exchangeCodeForMsTokens(code, codeVerifier, redirectUri, clientId);

  // 2. Obtener XBL token
  const xblTokenData = await getMsToXblToken(msTokens.access_token);

  // 3. Obtener XSTS token
  const xstsTokenData = await getXblToXstsToken(xblTokenData.Token);
  const uhs = xstsTokenData.DisplayClaims.xui[0]?.uhs ?? '';
  const xuid = xstsTokenData.DisplayClaims.xui[0]?.xid ?? '';

  if (!xuid || !uhs) {
    throw new AppError(
      'No se pudo obtener el XUID de Xbox. Asegúrate de que la cuenta tiene Xbox Live.',
      'XBOX_XUID_ERROR',
      502,
    );
  }

  // 4. Obtener Gamertag del perfil
  const gamertag = await fetchGamertag(xuid, xstsTokenData.Token, uhs);

  const stored: XboxStoredTokens = {
    msRefreshToken: msTokens.refresh_token,
    msAccessToken: msTokens.access_token,
    msTokenExpiresAt: new Date(Date.now() + msTokens.expires_in * 1000).toISOString(),
  };

  return {
    tokenJson: JSON.stringify(stored), // sin cifrar — linkPlatform aplica encrypt() una sola vez
    xuid,
    gamertag,
  };
}

// ─── Funciones de token internas ───────────────────────────────────────────────

async function exchangeCodeForMsTokens(
  code: string,
  codeVerifier: string,
  redirectUri: string,
  clientId: string,
): Promise<MsTokenResponse> {
  const params = new URLSearchParams({
    client_id: clientId,
    code,
    code_verifier: codeVerifier,
    grant_type: 'authorization_code',
    redirect_uri: redirectUri,
    scope: 'XboxLive.signin XboxLive.offline_access',
  });

  const clientSecret = process.env['XBOX_CLIENT_SECRET'];
  if (clientSecret) params.set('client_secret', clientSecret);

  try {
    const response = await axios.post<MsTokenResponse>(MS_TOKEN_URL, params.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    return response.data;
  } catch {
    throw new AppError(
      'No se pudo intercambiar el código OAuth2 de Xbox. Inténtalo de nuevo.',
      'XBOX_TOKEN_EXCHANGE_ERROR',
      502,
    );
  }
}

async function refreshMsAccessToken(
  refreshToken: string,
  clientId: string,
): Promise<MsTokenResponse> {
  const params = new URLSearchParams({
    client_id: clientId,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
    scope: 'XboxLive.signin XboxLive.offline_access',
  });

  const clientSecret = process.env['XBOX_CLIENT_SECRET'];
  if (clientSecret) params.set('client_secret', clientSecret);

  try {
    const response = await axios.post<MsTokenResponse>(MS_TOKEN_URL, params.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    return response.data;
  } catch {
    throw new AppError(
      'No se pudo refrescar el token de Microsoft Xbox. Reconecta tu cuenta.',
      'XBOX_REFRESH_ERROR',
      502,
    );
  }
}

async function getMsToXblToken(msAccessToken: string): Promise<XblTokenResponse> {
  const response = await axios.post<XblTokenResponse>(
    XBL_AUTH_URL,
    {
      Properties: {
        AuthMethod: 'RPS',
        SiteName: 'user.auth.xboxlive.com',
        RpsTicket: `d=${msAccessToken}`,
      },
      RelyingParty: 'http://auth.xboxlive.com',
      TokenType: 'JWT',
    },
    {
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    },
  );
  return response.data;
}

async function getXblToXstsToken(xblToken: string): Promise<XstsTokenResponse> {
  const response = await axios.post<XstsTokenResponse>(
    XSTS_AUTH_URL,
    {
      Properties: {
        SandboxId: 'RETAIL',
        UserTokens: [xblToken],
      },
      RelyingParty: 'http://xboxlive.com',
      TokenType: 'JWT',
    },
    {
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    },
  );
  return response.data;
}

async function fetchGamertag(xuid: string, xstsToken: string, uhs: string): Promise<string> {
  try {
    const response = await axios.get<XboxProfileResponse>(
      `${XBOX_PROFILE_URL}?settings=GameDisplayName,UniqueModernGamertag`,
      {
        headers: {
          Authorization: `XBL3.0 x=${uhs};${xstsToken}`,
          'x-xbl-contract-version': '3',
          Accept: 'application/json',
        },
      },
    );
    const user = response.data.profileUsers[0];
    const gamertag =
      user?.settings.find((s) => s.id === 'UniqueModernGamertag')?.value ??
      user?.settings.find((s) => s.id === 'GameDisplayName')?.value ??
      xuid;
    return gamertag;
  } catch {
    // Si no podemos obtener el Gamertag, usamos el XUID como fallback
    return xuid;
  }
}

async function fetchXboxAchievements(
  xuid: string,
  xstsToken: string,
  uhs: string,
): Promise<XboxAchievement[]> {
  return cachedFetch<XboxAchievement[]>(
    `xbox:achievements:${xuid}`,
    TTL_ACHIEVEMENTS,
    async () => {
      const allAchievements: XboxAchievement[] = [];
      let continuationToken: string | undefined;
      const maxItems = 1000;

      do {
        const params = new URLSearchParams({ unlockedOnly: 'false', maxItems: String(maxItems) });
        if (continuationToken) params.set('continuationToken', continuationToken);
        const url = `${XBOX_ACHIEVEMENTS_URL(xuid)}?${params.toString()}`;

        const response = await axios.get<XboxAchievementsResponse>(url, {
          headers: {
            Authorization: `XBL3.0 x=${uhs};${xstsToken}`,
            'x-xbl-contract-version': '4',
            Accept: 'application/json',
          },
        });

        allAchievements.push(...response.data.achievements);
        continuationToken = response.data.pagingInfo?.continuationToken;
      } while (continuationToken);

      return allAchievements;
    },
  );
}

// ─── Xbox Adapter ─────────────────────────────────────────────────────────────

export class XboxAdapter implements PlatformAdapter {
  readonly platform = 'XBOX' as const;

  // ── getUserAchievements ────────────────────────────────────────────────────

  async getUserAchievements(xuid: string, encryptedTokenJson: string): Promise<Achievement[]> {
    const { xstsToken, uhs } = await this.buildXstsAuth(encryptedTokenJson);
    const rawAchievements = await fetchXboxAchievements(xuid, xstsToken, uhs);
    return rawAchievements.map((a) => this.mapToAchievement(a, xuid));
  }

  // ── getGameInfo ────────────────────────────────────────────────────────────

  async getGameInfo(titleId: string): Promise<Game> {
    return {
      id: titleId,
      platform: 'XBOX',
      externalId: titleId,
      title: `Xbox Game ${titleId}`,
      console: null,
      iconUrl: null,
      headerUrl: null,
      totalAchievements: 0,
    };
  }

  // ── syncUser ───────────────────────────────────────────────────────────────

  async syncUser(account: PlatformAccount): Promise<SyncResult> {
    const { xstsToken, uhs, updatedEncryptedToken } = await this.buildXstsAuthWithRefresh(account);

    if (updatedEncryptedToken) {
      await prisma.platformAccount.upsert({
        where: { userId_platform: { userId: account.userId, platform: account.platform } },
        update: { encryptedToken: updatedEncryptedToken },
        create: {
          userId: account.userId,
          platform: account.platform,
          externalId: account.externalId,
          username: account.username,
          encryptedToken: updatedEncryptedToken,
        },
      });
    }

    // Invalidar caché de logros para forzar datos frescos en cada sync
    await redis.del(`xbox:achievements:${account.externalId}`);

    const rawAchievements = await fetchXboxAchievements(account.externalId, xstsToken, uhs);

    let achievementsSynced = 0;
    let gamesUpdated = 0;

    // Agrupar logros por juego para hacer un upsert de juego por título
    const byTitle = new Map<string, { name: string; achievements: XboxAchievement[] }>();
    for (const a of rawAchievements) {
      const assoc = a.titleAssociations[0];
      if (!assoc) continue;
      const titleId = String(assoc.id);
      const existing = byTitle.get(titleId);
      if (existing) {
        existing.achievements.push(a);
      } else {
        byTitle.set(titleId, { name: assoc.name, achievements: [a] });
      }
    }

    for (const [titleId, { name, achievements }] of byTitle) {
      const dbGame = await prisma.game.upsert({
        where: { platform_externalId: { platform: 'XBOX', externalId: titleId } },
        create: {
          platform: 'XBOX',
          externalId: titleId,
          title: name,
          iconUrl: null,
          headerUrl: null,
          totalAchievements: achievements.length,
        },
        update: {
          title: name,
          totalAchievements: achievements.length,
        },
      });

      gamesUpdated++;

      for (const a of achievements) {
        const gamerscore = this.extractGamerscore(a);
        const iconAsset = a.mediaAssets.find(
          (m) => m.type === 'Icon' || m.name.toLowerCase() === 'default',
        );

        const dbAchievement = await prisma.achievement.upsert({
          where: { platform_gameId_externalId: { platform: 'XBOX', gameId: dbGame.id, externalId: a.id } },
          create: {
            gameId: dbGame.id,
            platform: 'XBOX',
            externalId: a.id,
            title: a.name,
            description: a.description ?? a.lockedDescription ?? null,
            iconUrl: iconAsset?.url ?? null,
            rawValue: gamerscore,
            normalizedPoints: normalizePoints(gamerscore),
            rarity: null,
            externalUrl: `https://account.xbox.com/en-us/GameClip?gamerTag=${account.username}`,
          },
          update: {
            title: a.name,
            description: a.description ?? a.lockedDescription ?? null,
            rawValue: gamerscore,
            normalizedPoints: normalizePoints(gamerscore),
          },
        });

        if (a.progressState === 'Achieved' && a.progression.timeUnlocked) {
          const unlockedAt = new Date(a.progression.timeUnlocked);
          if (!isNaN(unlockedAt.getTime())) {
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
                unlockedAt,
              },
              update: { unlockedAt },
            });
            achievementsSynced++;
          }
        }
      }
    }

    return { platform: 'XBOX', achievementsSynced, gamesUpdated, syncedAt: new Date().toISOString() };
  }

  // ─── Métodos privados ─────────────────────────────────────────────────────

  private extractGamerscore(achievement: XboxAchievement): number {
    const reward = achievement.rewards.find((r) => r.type === 'Gamerscore');
    return reward ? parseInt(reward.value, 10) || 0 : 0;
  }

  private mapToAchievement(a: XboxAchievement, xuid: string): Achievement {
    const assoc = a.titleAssociations[0];
    const gamerscore = this.extractGamerscore(a);
    const iconAsset = a.mediaAssets.find(
      (m) => m.type === 'Icon' || m.name.toLowerCase() === 'default',
    );

    return {
      id: `xbox:${a.id}`,
      gameId: assoc ? String(assoc.id) : 'unknown',
      platform: 'XBOX',
      externalId: a.id,
      title: a.name,
      description: a.description ?? a.lockedDescription ?? null,
      iconUrl: iconAsset?.url ?? null,
      rawValue: gamerscore,
      normalizedPoints: normalizePoints(gamerscore),
      rarity: null,
      externalUrl: `https://account.xbox.com/en-us/GameClip?gamerTag=${xuid}`,
    };
  }

  /**
   * Refresca el MS access token si es necesario y devuelve los tokens XSTS.
   * Para llamadas ad-hoc (getUserAchievements), sin persistir el refresh.
   */
  private async buildXstsAuth(
    encryptedTokenJson: string,
  ): Promise<{ xstsToken: string; uhs: string }> {
    let stored: XboxStoredTokens;
    try {
      stored = JSON.parse(decrypt(encryptedTokenJson)) as XboxStoredTokens;
    } catch {
      throw new AppError('Token Xbox corrupto o inválido', 'XBOX_TOKEN_CORRUPT', 401);
    }
    const clientId = this.requireClientId();

    const msAccessToken =
      new Date(stored.msTokenExpiresAt) > new Date()
        ? stored.msAccessToken
        : (await refreshMsAccessToken(stored.msRefreshToken, clientId)).access_token;

    const xblData = await getMsToXblToken(msAccessToken);
    const xstsData = await getXblToXstsToken(xblData.Token);
    const uhs = xstsData.DisplayClaims.xui[0]?.uhs ?? '';
    if (!uhs) throw new AppError('No se pudo obtener UHS de Xbox', 'XBOX_AUTH_ERROR', 502);
    return { xstsToken: xstsData.Token, uhs };
  }

  /**
   * Refresca el MS access token si es necesario y devuelve los tokens XSTS.
   * Persiste el token actualizado si fue refrescado.
   */
  private async buildXstsAuthWithRefresh(
    account: PlatformAccount,
  ): Promise<{ xstsToken: string; uhs: string; updatedEncryptedToken: string | null }> {
    let stored: XboxStoredTokens;
    try {
      stored = JSON.parse(decrypt(account.encryptedToken)) as XboxStoredTokens;
    } catch {
      throw new AppError('Token Xbox corrupto o inválido', 'XBOX_TOKEN_CORRUPT', 401);
    }
    const clientId = this.requireClientId();

    let msAccessToken = stored.msAccessToken;
    let updatedEncryptedToken: string | null = null;

    if (new Date(stored.msTokenExpiresAt) <= new Date()) {
      const fresh = await refreshMsAccessToken(stored.msRefreshToken, clientId);
      msAccessToken = fresh.access_token;
      const newStored: XboxStoredTokens = {
        msRefreshToken: fresh.refresh_token,
        msAccessToken: fresh.access_token,
        msTokenExpiresAt: new Date(Date.now() + fresh.expires_in * 1000).toISOString(),
      };
      updatedEncryptedToken = encrypt(JSON.stringify(newStored));
    }

    const xblData = await getMsToXblToken(msAccessToken);
    const xstsData = await getXblToXstsToken(xblData.Token);
    const uhs = xstsData.DisplayClaims.xui[0]?.uhs ?? '';
    if (!uhs) throw new AppError('No se pudo obtener UHS de Xbox', 'XBOX_AUTH_ERROR', 502);

    return { xstsToken: xstsData.Token, uhs, updatedEncryptedToken };
  }

  private requireClientId(): string {
    const clientId = process.env['XBOX_CLIENT_ID'];
    if (!clientId) {
      throw new AppError('XBOX_CLIENT_ID no configurado en el servidor', 'XBOX_CONFIG_ERROR', 500);
    }
    return clientId;
  }
}

export const xboxAdapter = new XboxAdapter();
