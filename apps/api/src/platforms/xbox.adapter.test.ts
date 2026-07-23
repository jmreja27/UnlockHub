// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('axios');
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
    platformAccount: { upsert: jest.fn() },
  },
}));
jest.mock('../lib/crypto', () => ({
  encrypt: jest.fn((v: string) => `enc:${v}`),
  decrypt: jest.fn((v: string) => v.replace(/^enc:/, '')),
}));

// ─── Imports (después de los mocks) ──────────────────────────────────────────

import axios from 'axios';

import { redis } from '../lib/redis';
import { prisma } from '../lib/prisma';

import { XboxAdapter, exchangeXboxCodeForTokens } from './xbox.adapter';

const mockedAxios = axios as jest.Mocked<typeof axios>;
const mockedRedis = redis as jest.Mocked<typeof redis>;
const mockedPrisma = prisma as jest.Mocked<typeof prisma>;

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const XUID = '2535412345678901';
const GAMERTAG = 'XboxTestUser';
const MS_ACCESS_TOKEN = 'ms-access-token';
const MS_REFRESH_TOKEN = 'ms-refresh-token';
const XBL_TOKEN = 'xbl-token-value';
const XSTS_TOKEN = 'xsts-token-value';
const UHS = 'uhs-value';

const FUTURE_EXPIRY = new Date(Date.now() + 10 * 3600 * 1000).toISOString();
const PAST_EXPIRY = new Date(Date.now() - 3600 * 1000).toISOString();

process.env['XBOX_CLIENT_ID'] = 'test-client-id';

function makeStoredTokens(expiresAt: string) {
  return JSON.stringify({
    msRefreshToken: MS_REFRESH_TOKEN,
    msAccessToken: MS_ACCESS_TOKEN,
    msTokenExpiresAt: expiresAt,
  });
}

const mockPlatformAccount = {
  id: 'acct-xbox-1',
  userId: 'user-1',
  platform: 'XBOX' as const,
  externalId: XUID,
  username: GAMERTAG,
  encryptedToken: makeStoredTokens(FUTURE_EXPIRY),
  lastSyncedAt: null,
  syncCooldownUntil: null,
  requiresReauth: false,
  psnProfilePrivate: false,
  tokenExpiresAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockMsTokenResponse = {
  access_token: MS_ACCESS_TOKEN,
  refresh_token: MS_REFRESH_TOKEN,
  expires_in: 3600,
};

const mockXblResponse = {
  data: {
    Token: XBL_TOKEN,
    DisplayClaims: { xui: [{ uhs: UHS }] },
  },
};

const mockXstsResponse = {
  data: {
    Token: XSTS_TOKEN,
    DisplayClaims: { xui: [{ uhs: UHS, xid: XUID }] },
  },
};

const mockProfileResponse = {
  data: {
    profileUsers: [{
      id: XUID,
      settings: [
        { id: 'UniqueModernGamertag', value: GAMERTAG },
      ],
    }],
  },
};

const mockAchievement = {
  id: 'ach-001',
  name: 'First Achievement',
  description: 'Complete the tutorial',
  lockedDescription: 'Unknown',
  productId: 'prod-1',
  titleAssociations: [{ name: 'TestGame Xbox', id: 12345 }],
  progressState: 'Achieved' as const,
  progression: { achievementState: 'Achieved', timeUnlocked: '2025-01-01T10:00:00.0000000Z' },
  mediaAssets: [{ name: 'default', type: 'Icon', url: 'https://example.com/ach1.png' }],
  isSecret: false,
  rewards: [{ name: null, value: '10', type: 'Gamerscore', valueType: 'Int' }],
};

const mockAchievementNotEarned = {
  ...mockAchievement,
  id: 'ach-002',
  name: 'Second Achievement',
  progressState: 'NotStarted' as const,
  progression: { achievementState: 'NotStarted', timeUnlocked: '' },
  rewards: [{ name: null, value: '50', type: 'Gamerscore', valueType: 'Int' }],
};

const mockAchievementsResponse = {
  data: {
    achievements: [mockAchievement, mockAchievementNotEarned],
    pagingInfo: {},
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function setupCommonAxiosMocks() {
  mockedAxios.post.mockImplementation((url: string) => {
    if (String(url).includes('xsts.auth.xboxlive.com')) return Promise.resolve(mockXstsResponse);
    if (String(url).includes('user.auth.xboxlive.com')) return Promise.resolve(mockXblResponse);
    return Promise.resolve({ data: mockMsTokenResponse });
  });
  mockedAxios.get.mockResolvedValue(mockAchievementsResponse);
  mockedRedis.get.mockResolvedValue(null);
  (mockedRedis.setex as jest.Mock).mockResolvedValue('OK');
  (mockedRedis.del as jest.Mock).mockResolvedValue(1);
}

// ─── Tests: exchangeXboxCodeForTokens ─────────────────────────────────────────

describe('exchangeXboxCodeForTokens', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedAxios.post.mockImplementation((url: string) => {
      if (String(url).includes('xsts.auth.xboxlive.com')) return Promise.resolve(mockXstsResponse);
      if (String(url).includes('user.auth.xboxlive.com')) return Promise.resolve(mockXblResponse);
      return Promise.resolve({ data: mockMsTokenResponse });
    });
    mockedAxios.get.mockResolvedValue(mockProfileResponse);
  });

  it('intercambia código OAuth2 por tokens y devuelve xuid y gamertag', async () => {
    const result = await exchangeXboxCodeForTokens('auth-code', 'code-verifier-value', 'https://app/redirect');

    expect(result.xuid).toBe(XUID);
    expect(result.gamertag).toBe(GAMERTAG);
    expect(result.tokenJson).toBeDefined();
    expect(() => JSON.parse(result.tokenJson)).not.toThrow();
  });

  it('llama a los endpoints de MS, XBL y XSTS en orden correcto', async () => {
    await exchangeXboxCodeForTokens('auth-code', 'code-verifier', 'https://redirect');

    // MS token endpoint
    expect(mockedAxios.post).toHaveBeenCalledWith(
      expect.stringContaining('microsoftonline.com'),
      expect.stringContaining('authorization_code'),
      expect.any(Object),
    );
    // XBL endpoint
    expect(mockedAxios.post).toHaveBeenCalledWith(
      expect.stringContaining('user.auth.xboxlive.com'),
      expect.any(Object),
      expect.any(Object),
    );
    // XSTS endpoint
    expect(mockedAxios.post).toHaveBeenCalledWith(
      expect.stringContaining('xsts.auth.xboxlive.com'),
      expect.any(Object),
      expect.any(Object),
    );
  });

  it('lanza AppError si el intercambio de código MS falla', async () => {
    mockedAxios.post.mockRejectedValueOnce(new Error('MS token exchange failed'));

    await expect(
      exchangeXboxCodeForTokens('bad-code', 'verifier', 'https://redirect'),
    ).rejects.toMatchObject({ code: 'XBOX_TOKEN_EXCHANGE_ERROR', statusCode: 502 });
  });
});

// ─── Tests: XboxAdapter.syncUser ──────────────────────────────────────────────

describe('XboxAdapter.syncUser', () => {
  let adapter: XboxAdapter;

  beforeEach(() => {
    jest.clearAllMocks();
    adapter = new XboxAdapter();
    setupCommonAxiosMocks();
    (mockedPrisma.game.upsert as jest.Mock).mockResolvedValue({ id: 'db-game-xbox-1' });
    (mockedPrisma.achievement.upsert as jest.Mock).mockResolvedValue({ id: 'db-ach-xbox-1' });
    (mockedPrisma.userAchievement.upsert as jest.Mock).mockResolvedValue({});
    (mockedPrisma.platformAccount.upsert as jest.Mock).mockResolvedValue({});
  });

  it('sincroniza logros y juegos de Xbox correctamente', async () => {
    const result = await adapter.syncUser(mockPlatformAccount);

    expect(result.platform).toBe('XBOX');
    expect(result.achievementsSynced).toBe(1); // Solo el logro con progressState: 'Achieved'
    expect(result.gamesUpdated).toBe(1);
    expect(mockedPrisma.game.upsert).toHaveBeenCalledTimes(1);
    expect(mockedPrisma.achievement.upsert).toHaveBeenCalledTimes(2);
    expect(mockedPrisma.userAchievement.upsert).toHaveBeenCalledTimes(1);
  });

  it('normaliza Gamerscore a normalizedPoints correctamente', async () => {
    const result = await adapter.syncUser(mockPlatformAccount);
    expect(result.achievementsSynced).toBe(1);

    // ach-001 tiene 10G → normalizedPoints = max(1, round(10/10)) = 1
    expect(mockedPrisma.achievement.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ normalizedPoints: 1 }),
      }),
    );
  });

  it('refresca el MS access token cuando ha expirado', async () => {
    const expiredAccount = {
      ...mockPlatformAccount,
      encryptedToken: makeStoredTokens(PAST_EXPIRY),
    };

    // Primer post es el refresh de MS tokens
    mockedAxios.post.mockImplementation((url: string) => {
      if (String(url).includes('xsts.auth.xboxlive.com')) return Promise.resolve(mockXstsResponse);
      if (String(url).includes('user.auth.xboxlive.com')) return Promise.resolve(mockXblResponse);
      // MS token refresh
      return Promise.resolve({ data: { ...mockMsTokenResponse, access_token: 'new-access-token' } });
    });

    await adapter.syncUser(expiredAccount);

    expect(mockedPrisma.platformAccount.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId_platform: { userId: 'user-1', platform: 'XBOX' } } }),
    );
  });

  it('no refresca el token si el MS access token no ha expirado', async () => {
    await adapter.syncUser(mockPlatformAccount);

    // MS token refresh POST no debería haberse llamado para refresh
    // Solo deben haberse llamado XBL y XSTS
    const msPosts = mockedAxios.post.mock.calls.filter((c) =>
      String(c[0]).includes('microsoftonline.com'),
    );
    expect(msPosts).toHaveLength(0);
    expect(mockedPrisma.platformAccount.upsert).not.toHaveBeenCalled();
  });

  it('invalida la caché de Redis antes de sincronizar', async () => {
    await adapter.syncUser(mockPlatformAccount);
    expect(mockedRedis.del).toHaveBeenCalledWith(`xbox:achievements:${XUID}`);
  });

  it('devuelve SyncResult con platform XBOX y syncedAt como ISO string', async () => {
    const result = await adapter.syncUser(mockPlatformAccount);
    expect(result.platform).toBe('XBOX');
    expect(new Date(result.syncedAt).toISOString()).toBe(result.syncedAt);
  });
});

// ─── Tests: XboxAdapter.getGameInfo ───────────────────────────────────────────

describe('XboxAdapter.getGameInfo', () => {
  it('devuelve un objeto Game con la plataforma XBOX', async () => {
    const adapter = new XboxAdapter();
    const game = await adapter.getGameInfo('12345');
    expect(game.platform).toBe('XBOX');
    expect(game.externalId).toBe('12345');
  });
});

// ─── Tests: normalizePoints ───────────────────────────────────────────────────

describe('normalizePoints (via logros de Xbox)', () => {
  let adapter: XboxAdapter;

  beforeEach(() => {
    jest.clearAllMocks();
    adapter = new XboxAdapter();
    setupCommonAxiosMocks();
    (mockedPrisma.game.upsert as jest.Mock).mockResolvedValue({ id: 'db-game-1' });
    (mockedPrisma.achievement.upsert as jest.Mock).mockResolvedValue({ id: 'db-ach-1' });
    (mockedPrisma.userAchievement.upsert as jest.Mock).mockResolvedValue({});
    (mockedPrisma.platformAccount.upsert as jest.Mock).mockResolvedValue({});
  });

  it('normaliza Gamerscore 0 a mínimo de 1 punto', async () => {
    const zeroGsAchievement = {
      ...mockAchievement,
      rewards: [{ name: null, value: '0', type: 'Gamerscore', valueType: 'Int' }],
    };
    mockedAxios.get.mockResolvedValue({
      data: { achievements: [zeroGsAchievement], pagingInfo: {} },
    });

    await adapter.syncUser(mockPlatformAccount);

    expect(mockedPrisma.achievement.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ normalizedPoints: 1 }),
      }),
    );
  });

  it('normaliza Gamerscore 1000 a 100 puntos', async () => {
    const bigGsAchievement = {
      ...mockAchievement,
      rewards: [{ name: null, value: '1000', type: 'Gamerscore', valueType: 'Int' }],
    };
    mockedAxios.get.mockResolvedValue({
      data: { achievements: [bigGsAchievement], pagingInfo: {} },
    });

    await adapter.syncUser(mockPlatformAccount);

    expect(mockedPrisma.achievement.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ normalizedPoints: 100 }),
      }),
    );
  });
});
