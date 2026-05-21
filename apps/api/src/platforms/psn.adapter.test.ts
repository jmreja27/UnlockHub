// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('psn-api', () => ({
  exchangeNpssoForAccessCode: jest.fn(),
  exchangeAccessCodeForAuthTokens: jest.fn(),
  exchangeRefreshTokenForAuthTokens: jest.fn(),
  getProfileFromAccountId: jest.fn(),
  getProfileFromUserName: jest.fn(),
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

import { PsnAdapter, getSystemPsnAuth, lookupPsnUser, checkPsnProfilePrivacy, exchangeNpssoForPsnTokens } from './psn.adapter';

const mocked = {
  exchangeNpssoForAccessCode: psnApi.exchangeNpssoForAccessCode as jest.MockedFunction<typeof psnApi.exchangeNpssoForAccessCode>,
  exchangeAccessCodeForAuthTokens: psnApi.exchangeAccessCodeForAuthTokens as jest.MockedFunction<typeof psnApi.exchangeAccessCodeForAuthTokens>,
  exchangeRefreshTokenForAuthTokens: psnApi.exchangeRefreshTokenForAuthTokens as jest.MockedFunction<typeof psnApi.exchangeRefreshTokenForAuthTokens>,
  getProfileFromAccountId: psnApi.getProfileFromAccountId as jest.MockedFunction<typeof psnApi.getProfileFromAccountId>,
  getProfileFromUserName: psnApi.getProfileFromUserName as jest.MockedFunction<typeof psnApi.getProfileFromUserName>,
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
const SYSTEM_ACCESS_TOKEN = 'system-psn-access-token';

const makeIdToken = (sub: string): string => {
  const payload = Buffer.from(JSON.stringify({ sub })).toString('base64url');
  return `header.${payload}.signature`;
};

const mockAuthTokensResponse = {
  accessToken: ACCESS_TOKEN,
  refreshToken: 'test-refresh-token',
  expiresIn: 3600,
  refreshTokenExpiresIn: 5184000,
  idToken: makeIdToken(ACCOUNT_ID),
  scope: 'psn:clientapp',
  tokenType: 'bearer',
};

const mockSystemAuthTokensResponse = {
  ...mockAuthTokensResponse,
  accessToken: SYSTEM_ACCESS_TOKEN,
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

const mockPlatformAccount = {
  id: 'acct-1',
  userId: 'user-1',
  platform: 'PSN' as const,
  externalId: ACCOUNT_ID,
  username: ONLINE_ID,
  encryptedToken: '',
  lastSyncedAt: null,
  syncCooldownUntil: null,
  requiresReauth: false,
  psnProfilePrivate: false,
  tokenExpiresAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function setupSystemTokenCached(): void {
  // Simula que el access token del sistema ya está en Redis
  (mocked.redis.get as jest.Mock).mockImplementation((key: string) => {
    if (key === 'psn:system:access_token') return Promise.resolve(SYSTEM_ACCESS_TOKEN);
    return Promise.resolve(null);
  });
  (mocked.redis.setex as jest.Mock).mockResolvedValue('OK');
}

function setupSystemTokenExpired(): void {
  // Simula que no hay token en caché — se necesita obtener uno nuevo
  (mocked.redis.get as jest.Mock).mockResolvedValue(null);
  (mocked.redis.setex as jest.Mock).mockResolvedValue('OK');
}

// ─── Tests: getSystemPsnAuth ──────────────────────────────────────────────────

describe('getSystemPsnAuth', () => {
  const ORIGINAL_NPSSO = process.env.PSN_SYSTEM_NPSSO;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.PSN_SYSTEM_NPSSO = 'test-system-npsso-token';
  });

  afterEach(() => {
    process.env.PSN_SYSTEM_NPSSO = ORIGINAL_NPSSO;
  });

  it('devuelve el token desde Redis si está en caché', async () => {
    setupSystemTokenCached();

    const auth = await getSystemPsnAuth();

    expect(auth.accessToken).toBe(SYSTEM_ACCESS_TOKEN);
    expect(mocked.exchangeNpssoForAccessCode).not.toHaveBeenCalled();
  });

  it('obtiene y cachea un nuevo token si Redis no tiene el token', async () => {
    setupSystemTokenExpired();
    mocked.exchangeNpssoForAccessCode.mockResolvedValue('v3.system-access-code');
    mocked.exchangeAccessCodeForAuthTokens.mockResolvedValue(mockSystemAuthTokensResponse);

    const auth = await getSystemPsnAuth();

    expect(auth.accessToken).toBe(SYSTEM_ACCESS_TOKEN);
    expect(mocked.exchangeNpssoForAccessCode).toHaveBeenCalledWith('test-system-npsso-token');
    expect(mocked.redis.setex).toHaveBeenCalledWith(
      'psn:system:access_token',
      55 * 60,
      SYSTEM_ACCESS_TOKEN,
    );
  });

  it('lanza PSN_SYSTEM_NOT_CONFIGURED si PSN_SYSTEM_NPSSO no está definido', async () => {
    delete process.env.PSN_SYSTEM_NPSSO;

    await expect(getSystemPsnAuth()).rejects.toMatchObject({
      code: 'PSN_SYSTEM_NOT_CONFIGURED',
      statusCode: 503,
    });
  });

  it('lanza PSN_SYSTEM_NPSSO_EXPIRED si el NPSSO del sistema ha expirado', async () => {
    setupSystemTokenExpired();
    mocked.exchangeNpssoForAccessCode.mockRejectedValue(new Error('Invalid NPSSO'));

    await expect(getSystemPsnAuth()).rejects.toMatchObject({
      code: 'PSN_SYSTEM_NPSSO_EXPIRED',
      statusCode: 503,
    });
  });
});

// ─── Tests: lookupPsnUser ────────────────────────────────────────────────────

describe('lookupPsnUser', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('devuelve accountId y onlineId cuando el usuario existe', async () => {
    mocked.getProfileFromUserName.mockResolvedValue({
      profile: {
        accountId: ACCOUNT_ID,
        onlineId: ONLINE_ID,
        npId: 'test-np-id',
        avatarUrls: [],
        plus: 0,
        aboutMe: '',
        languagesUsed: [],
        trophySummary: { level: 1, progress: 0, earnedTrophies: { bronze: 0, silver: 0, gold: 0, platinum: 0 } },
        isOfficiallyVerified: false,
        personalDetail: { firstName: '', lastName: '', profilePictureUrls: [] },
        personalDetailSharing: 'no',
        personalDetailSharingRequestMessageFlag: false,
        primaryOnlineStatus: 'offline',
        presences: [],
        friendRelation: 'no',
        requestMessageFlag: false,
        blocking: false,
        following: false,
        consoleAvailability: { availabilityStatus: 'unavailable' },
      },
    });

    const result = await lookupPsnUser({ accessToken: SYSTEM_ACCESS_TOKEN }, ONLINE_ID);

    expect(result.accountId).toBe(ACCOUNT_ID);
    expect(result.onlineId).toBe(ONLINE_ID);
    expect(mocked.getProfileFromUserName).toHaveBeenCalledWith(
      { accessToken: SYSTEM_ACCESS_TOKEN },
      ONLINE_ID,
    );
  });

  it('lanza PSN_USER_NOT_FOUND si el usuario no existe', async () => {
    mocked.getProfileFromUserName.mockRejectedValue(new Error('User not found'));

    await expect(
      lookupPsnUser({ accessToken: SYSTEM_ACCESS_TOKEN }, 'usuario_inexistente'),
    ).rejects.toMatchObject({
      code: 'PSN_USER_NOT_FOUND',
      statusCode: 404,
    });
  });
});

// ─── Tests: PsnAdapter.syncUser ────────────────────────────────────────────────

describe('PsnAdapter.syncUser', () => {
  let adapter: PsnAdapter;

  beforeEach(() => {
    jest.clearAllMocks();
    adapter = new PsnAdapter();
    process.env.PSN_SYSTEM_NPSSO = 'test-system-npsso';

    setupSystemTokenCached();

    (mocked.prisma.game.upsert as jest.Mock).mockResolvedValue({ id: 'db-game-1' });
    (mocked.prisma.achievement.upsert as jest.Mock).mockResolvedValue({ id: 'db-ach-1' });
    (mocked.prisma.userAchievement.upsert as jest.Mock).mockResolvedValue({});
  });

  afterEach(() => {
    delete process.env.PSN_SYSTEM_NPSSO;
  });

  it('sincroniza juegos y trofeos usando el token del sistema', async () => {
    mocked.getUserTitles.mockResolvedValue({
      trophyTitles: [mockTitle],
      totalItemCount: 1,
    });
    mocked.getTitleTrophies.mockResolvedValue(mockTitleTrophies);
    mocked.getUserTrophiesEarnedForTitle.mockResolvedValue(mockEarnedTrophies);

    const result = await adapter.syncUser(mockPlatformAccount);

    expect(result.platform).toBe('PSN');
    expect(result.achievementsSynced).toBe(1);
    expect(result.gamesUpdated).toBe(1);
    // Usa el accountId del usuario (externalId), no 'me'
    expect(mocked.getUserTitles).toHaveBeenCalledWith(
      { accessToken: SYSTEM_ACCESS_TOKEN },
      ACCOUNT_ID,
      expect.anything(),
    );
    expect(mocked.getUserTrophiesEarnedForTitle).toHaveBeenCalledWith(
      { accessToken: SYSTEM_ACCESS_TOKEN },
      ACCOUNT_ID,
      mockTitle.npCommunicationId,
      'all',
      expect.anything(),
    );
  });

  it('no actualiza encryptedToken en BD (el sistema gestiona su propio token)', async () => {
    mocked.getUserTitles.mockResolvedValue({ trophyTitles: [], totalItemCount: 0 });

    await adapter.syncUser(mockPlatformAccount);

    expect(mocked.prisma.platformAccount.update).not.toHaveBeenCalled();
  });

  it('devuelve SyncResult con platform PSN y syncedAt como string ISO', async () => {
    mocked.getUserTitles.mockResolvedValue({ trophyTitles: [], totalItemCount: 0 });

    const result = await adapter.syncUser(mockPlatformAccount);

    expect(result.platform).toBe('PSN');
    expect(typeof result.syncedAt).toBe('string');
    expect(new Date(result.syncedAt).toISOString()).toBe(result.syncedAt);
  });

  it('lanza PSN_SYSTEM_NOT_CONFIGURED si PSN_SYSTEM_NPSSO no está definido', async () => {
    delete process.env.PSN_SYSTEM_NPSSO;

    await expect(adapter.syncUser(mockPlatformAccount)).rejects.toMatchObject({
      code: 'PSN_SYSTEM_NOT_CONFIGURED',
      statusCode: 503,
    });
  });
});

// ─── Tests: checkPsnProfilePrivacy ───────────────────────────────────────────

describe('checkPsnProfilePrivacy', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('devuelve false cuando getUserTitles responde correctamente (perfil público)', async () => {
    mocked.getUserTitles.mockResolvedValue({ trophyTitles: [], totalItemCount: 0 });

    const isPrivate = await checkPsnProfilePrivacy({ accessToken: SYSTEM_ACCESS_TOKEN }, ACCOUNT_ID);

    expect(isPrivate).toBe(false);
    expect(mocked.getUserTitles).toHaveBeenCalledWith(
      { accessToken: SYSTEM_ACCESS_TOKEN },
      ACCOUNT_ID,
      { limit: 1, offset: 0 },
    );
  });

  it('devuelve true cuando getUserTitles lanza (perfil privado)', async () => {
    mocked.getUserTitles.mockRejectedValue(new Error('Privacy error'));

    const isPrivate = await checkPsnProfilePrivacy({ accessToken: SYSTEM_ACCESS_TOKEN }, ACCOUNT_ID);

    expect(isPrivate).toBe(true);
  });
});

// ─── Tests: PsnAdapter.syncUser — perfil privado ──────────────────────────────

describe('PsnAdapter.syncUser — perfil privado', () => {
  let adapter: PsnAdapter;

  beforeEach(() => {
    jest.clearAllMocks();
    adapter = new PsnAdapter();
    process.env.PSN_SYSTEM_NPSSO = 'test-system-npsso';
    setupSystemTokenCached();
  });

  afterEach(() => {
    delete process.env.PSN_SYSTEM_NPSSO;
  });

  it('lanza PSN_PROFILE_PRIVATE cuando getUserTitles falla durante el sync', async () => {
    mocked.getUserTitles.mockRejectedValue(new Error('Access denied'));

    await expect(adapter.syncUser(mockPlatformAccount)).rejects.toMatchObject({
      code: 'PSN_PROFILE_PRIVATE',
      statusCode: 403,
    });
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

// ─── Tests: exchangeNpssoForPsnTokens (legacy — usado por seed script) ────────

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
