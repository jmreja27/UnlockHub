// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('psn-api', () => ({
  exchangeNpssoForAccessCode: jest.fn(),
  exchangeAccessCodeForAuthTokens: jest.fn(),
  exchangeRefreshTokenForAuthTokens: jest.fn(),
  getProfileFromAccountId: jest.fn(),
  getUserTitles: jest.fn(),
  getTitleTrophies: jest.fn(),
  getUserTrophiesEarnedForTitle: jest.fn(),
}));

jest.mock('../lib/redis', () => ({
  redis: {
    get: jest.fn(),
    setex: jest.fn(),
    del: jest.fn(),
  },
}));

jest.mock('../lib/prisma', () => ({
  prisma: {
    game: { upsert: jest.fn() },
    achievement: { upsert: jest.fn() },
    userAchievement: { upsert: jest.fn() },
    platformAccount: { update: jest.fn() },
  },
}));

jest.mock('../lib/crypto', () => ({
  encrypt: jest.fn((v: string) => `enc:${v}`),
  decrypt: jest.fn((v: string) => v.replace(/^enc:/, '')),
}));

// ─── Imports (después de los mocks) ──────────────────────────────────────────

import * as psnApi from 'psn-api';

import { redis } from '../lib/redis';
import { prisma } from '../lib/prisma';

import { PsnAdapter, exchangeNpssoForPsnTokens } from './psn.adapter';

const mocked = {
  exchangeNpssoForAccessCode: psnApi.exchangeNpssoForAccessCode as jest.MockedFunction<typeof psnApi.exchangeNpssoForAccessCode>,
  exchangeAccessCodeForAuthTokens: psnApi.exchangeAccessCodeForAuthTokens as jest.MockedFunction<typeof psnApi.exchangeAccessCodeForAuthTokens>,
  exchangeRefreshTokenForAuthTokens: psnApi.exchangeRefreshTokenForAuthTokens as jest.MockedFunction<typeof psnApi.exchangeRefreshTokenForAuthTokens>,
  getProfileFromAccountId: psnApi.getProfileFromAccountId as jest.MockedFunction<typeof psnApi.getProfileFromAccountId>,
  getUserTitles: psnApi.getUserTitles as jest.MockedFunction<typeof psnApi.getUserTitles>,
  getTitleTrophies: psnApi.getTitleTrophies as jest.MockedFunction<typeof psnApi.getTitleTrophies>,
  getUserTrophiesEarnedForTitle: psnApi.getUserTrophiesEarnedForTitle as jest.MockedFunction<typeof psnApi.getUserTrophiesEarnedForTitle>,
  redis: redis as jest.Mocked<typeof redis>,
  prisma: prisma as jest.Mocked<typeof prisma>,
};

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const ACCOUNT_ID = '1234567890987654321';
const ONLINE_ID = 'TestUser_PSN';
const ACCESS_TOKEN = 'test-psn-access-token';
const REFRESH_TOKEN = 'test-psn-refresh-token';
const FRESH_ACCESS_TOKEN = 'fresh-psn-access-token';
const FRESH_REFRESH_TOKEN = 'fresh-psn-refresh-token';

// JWT con claim sub = ACCOUNT_ID (base64url del payload JSON)
const makeIdToken = (sub: string): string => {
  const payload = Buffer.from(JSON.stringify({ sub })).toString('base64url');
  return `header.${payload}.signature`;
};

// Fechas reales para que el código que usa `new Date()` funcione correctamente
const FUTURE_EXPIRY = new Date(Date.now() + 10 * 3600 * 1000).toISOString(); // 10h desde ahora
const PAST_EXPIRY = new Date(Date.now() - 3600 * 1000).toISOString();        // hace 1h
const FAR_FUTURE_REFRESH = new Date(Date.now() + 90 * 86400 * 1000).toISOString(); // 90 días

function makeStoredTokens(expiresAt: string, refreshExpiresAt?: string) {
  return JSON.stringify({
    accessToken: ACCESS_TOKEN,
    refreshToken: REFRESH_TOKEN,
    expiresAt,
    refreshTokenExpiresAt: refreshExpiresAt ?? FAR_FUTURE_REFRESH,
  });
}

const mockPlatformAccount = {
  id: 'acct-1',
  userId: 'user-1',
  platform: 'PSN' as const,
  externalId: ACCOUNT_ID,
  username: ONLINE_ID,
  encryptedToken: makeStoredTokens(FUTURE_EXPIRY),
  lastSyncedAt: null,
  syncCooldownUntil: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockAuthTokensResponse = {
  accessToken: ACCESS_TOKEN,
  refreshToken: REFRESH_TOKEN,
  expiresIn: 3600,
  refreshTokenExpiresIn: 5184000, // 60 días
  idToken: makeIdToken(ACCOUNT_ID),
  scope: 'psn:clientapp',
  tokenType: 'bearer',
};

const mockTitle = {
  npServiceName: 'trophy2' as const,
  npCommunicationId: 'NPWR12345_00',
  trophySetVersion: '01.00',
  trophyTitleName: 'TestGame PS5',
  trophyTitleIconUrl: 'https://example.com/icon.png',
  trophyTitlePlatform: 'PS5',
  hasTrophyGroups: false,
  definedTrophies: { bronze: 10, silver: 5, gold: 2, platinum: 1 },
  progress: 50,
  earnedTrophies: { bronze: 5, silver: 2, gold: 0, platinum: 0 },
  hiddenFlag: false,
  lastUpdatedDateTime: '2025-01-01T00:00:00Z',
};

const mockTitleTrophies = {
  trophySetVersion: '01.00',
  hasTrophyGroups: false,
  totalItemCount: 2,
  trophies: [
    {
      trophyId: 1,
      trophyHidden: false,
      trophyType: 'bronze',
      trophyName: 'First Bronze',
      trophyDetail: 'Earn your first bronze',
      trophyIconUrl: 'https://example.com/trophy1.png',
      trophyEarnedRate: '75.5',
      trophyGroupId: 'default',
    },
    {
      trophyId: 2,
      trophyHidden: false,
      trophyType: 'platinum',
      trophyName: 'Platinum Trophy',
      trophyDetail: 'Earn all trophies',
      trophyIconUrl: 'https://example.com/trophy2.png',
      trophyEarnedRate: '5.2',
      trophyGroupId: 'default',
    },
  ],
};

const mockEarnedTrophies = {
  trophySetVersion: '01.00',
  hasTrophyGroups: false,
  totalItemCount: 2,
  lastUpdatedDateTime: '2025-01-01T00:00:00Z',
  trophies: [
    {
      trophyId: 1,
      trophyHidden: false,
      trophyType: 'bronze' as const,
      earned: true,
      earnedDateTime: '2025-01-01T10:00:00Z',
      trophyEarnedRate: '75.5',
    },
    {
      trophyId: 2,
      trophyHidden: false,
      trophyType: 'platinum' as const,
      earned: false,
      earnedDateTime: undefined,
      trophyEarnedRate: '5.2',
    },
  ],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function setupNoCache(): void {
  mocked.redis.get.mockResolvedValue(null);
  (mocked.redis.setex as jest.Mock).mockResolvedValue('OK');
}

// ─── Tests: exchangeNpssoForPsnTokens ─────────────────────────────────────────

describe('exchangeNpssoForPsnTokens', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('intercambia NPSSO por tokens y devuelve accountId y onlineId', async () => {
    mocked.exchangeNpssoForAccessCode.mockResolvedValue('v3.access-code');
    mocked.exchangeAccessCodeForAuthTokens.mockResolvedValue(mockAuthTokensResponse);
    mocked.getProfileFromAccountId.mockResolvedValue({
      onlineId: ONLINE_ID,
      aboutMe: '',
      avatars: [],
      languages: [],
      isPlus: false,
      isOfficiallyVerified: false,
      isMe: true,
    });

    const result = await exchangeNpssoForPsnTokens('valid-npsso-token');

    expect(result.accountId).toBe(ACCOUNT_ID);
    expect(result.onlineId).toBe(ONLINE_ID);
    expect(result.encryptedTokenJson).toContain('enc:');
    expect(mocked.exchangeNpssoForAccessCode).toHaveBeenCalledWith('valid-npsso-token');
    expect(mocked.exchangeAccessCodeForAuthTokens).toHaveBeenCalledWith('v3.access-code');
  });

  it('lanza AppError con código PSN_NPSSO_INVALID si exchangeNpssoForAccessCode falla', async () => {
    mocked.exchangeNpssoForAccessCode.mockRejectedValue(new Error('Invalid NPSSO'));

    await expect(exchangeNpssoForPsnTokens('bad-npsso')).rejects.toMatchObject({
      code: 'PSN_NPSSO_INVALID',
      statusCode: 400,
    });
  });

  it('lanza AppError con código PSN_TOKEN_EXCHANGE_ERROR si exchangeAccessCodeForAuthTokens falla', async () => {
    mocked.exchangeNpssoForAccessCode.mockResolvedValue('v3.code');
    mocked.exchangeAccessCodeForAuthTokens.mockRejectedValue(new Error('Token exchange failed'));

    await expect(exchangeNpssoForPsnTokens('npsso')).rejects.toMatchObject({
      code: 'PSN_TOKEN_EXCHANGE_ERROR',
      statusCode: 502,
    });
  });
});

// ─── Tests: PsnAdapter.syncUser ────────────────────────────────────────────────

describe('PsnAdapter.syncUser', () => {
  let adapter: PsnAdapter;

  beforeEach(() => {
    jest.clearAllMocks();
    adapter = new PsnAdapter();
    setupNoCache();

    (mocked.prisma.game.upsert as jest.Mock).mockResolvedValue({ id: 'db-game-1' });
    (mocked.prisma.achievement.upsert as jest.Mock).mockResolvedValue({ id: 'db-ach-1' });
    (mocked.prisma.userAchievement.upsert as jest.Mock).mockResolvedValue({});
    (mocked.prisma.platformAccount.update as jest.Mock).mockResolvedValue({});
  });

  it('sincroniza juegos y trofeos ganados correctamente', async () => {
    mocked.getUserTitles.mockResolvedValue({
      trophyTitles: [mockTitle],
      totalItemCount: 1,
    });
    mocked.getTitleTrophies.mockResolvedValue(mockTitleTrophies);
    mocked.getUserTrophiesEarnedForTitle.mockResolvedValue(mockEarnedTrophies);

    const result = await adapter.syncUser(mockPlatformAccount);

    expect(result.platform).toBe('PSN');
    expect(result.achievementsSynced).toBe(1); // Solo el trofeo con earned: true
    expect(result.gamesUpdated).toBe(1);
    expect(mocked.prisma.game.upsert).toHaveBeenCalledTimes(1);
    expect(mocked.prisma.achievement.upsert).toHaveBeenCalledTimes(2); // bronze + platinum
    expect(mocked.prisma.userAchievement.upsert).toHaveBeenCalledTimes(1); // solo el ganado
  });

  it('refresca el access token cuando ha expirado', async () => {
    const expiredAccount = {
      ...mockPlatformAccount,
      encryptedToken: makeStoredTokens(PAST_EXPIRY),
    };

    mocked.exchangeRefreshTokenForAuthTokens.mockResolvedValue({
      ...mockAuthTokensResponse,
      accessToken: FRESH_ACCESS_TOKEN,
      refreshToken: FRESH_REFRESH_TOKEN,
    });
    mocked.getUserTitles.mockResolvedValue({ trophyTitles: [], totalItemCount: 0 });

    await adapter.syncUser(expiredAccount);

    expect(mocked.exchangeRefreshTokenForAuthTokens).toHaveBeenCalledWith(REFRESH_TOKEN);
    expect(mocked.prisma.platformAccount.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'acct-1' },
        data: expect.objectContaining({ encryptedToken: expect.stringContaining('enc:') }),
      }),
    );
  });

  it('lanza AppError si el refresh token también ha expirado', async () => {
    const fullyExpiredAccount = {
      ...mockPlatformAccount,
      encryptedToken: makeStoredTokens(PAST_EXPIRY, PAST_EXPIRY),
    };

    await expect(adapter.syncUser(fullyExpiredAccount)).rejects.toMatchObject({
      code: 'PSN_REFRESH_TOKEN_EXPIRED',
      statusCode: 401,
    });
    expect(mocked.exchangeRefreshTokenForAuthTokens).not.toHaveBeenCalled();
  });

  it('no persiste token si el access token no ha expirado', async () => {
    mocked.getUserTitles.mockResolvedValue({ trophyTitles: [], totalItemCount: 0 });

    await adapter.syncUser(mockPlatformAccount);

    expect(mocked.exchangeRefreshTokenForAuthTokens).not.toHaveBeenCalled();
    expect(mocked.prisma.platformAccount.update).not.toHaveBeenCalled();
  });

  it('devuelve SyncResult con platform PSN y syncedAt como string ISO', async () => {
    mocked.getUserTitles.mockResolvedValue({ trophyTitles: [], totalItemCount: 0 });

    const result = await adapter.syncUser(mockPlatformAccount);

    expect(result.platform).toBe('PSN');
    expect(typeof result.syncedAt).toBe('string');
    expect(new Date(result.syncedAt).toISOString()).toBe(result.syncedAt);
  });
});

// ─── Tests: PsnAdapter.getGameInfo ────────────────────────────────────────────

describe('PsnAdapter.getGameInfo', () => {
  let adapter: PsnAdapter;

  beforeEach(() => {
    jest.clearAllMocks();
    adapter = new PsnAdapter();
    (mocked.redis.get as jest.Mock).mockResolvedValue(null);
  });

  it('devuelve un objeto Game con la plataforma PSN', async () => {
    const game = await adapter.getGameInfo('NPWR12345_00');
    expect(game.platform).toBe('PSN');
    expect(game.externalId).toBe('NPWR12345_00');
  });
});
