// Tests de renovación de tokens PSN en buildAuthWithRefresh (syncUser)
// Se centra en los casos de token expirado que afectan al sync real de usuarios.

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
    get: jest.fn().mockResolvedValue(null),
    setex: jest.fn().mockResolvedValue('OK'),
    set: jest.fn().mockResolvedValue('OK'),
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
  encrypt: jest.fn((s: string) => `enc:${s}`),
  decrypt: jest.fn((s: string) => s.replace('enc:', '')),
}));

import { psnAdapter } from '../platforms/psn.adapter';
import { AppError } from '../middleware/errorHandler';
import { prisma } from '../lib/prisma';

import {
  exchangeRefreshTokenForAuthTokens,
  getUserTitles,
  getTitleTrophies,
  getUserTrophiesEarnedForTitle,
} from 'psn-api';

const mockExchangeRefresh = exchangeRefreshTokenForAuthTokens as jest.Mock;
const mockGetUserTitles = getUserTitles as jest.Mock;
const mockGetTitleTrophies = getTitleTrophies as jest.Mock;
const mockGetUserTrophiesEarned = getUserTrophiesEarnedForTitle as jest.Mock;
const mockPrisma = prisma as jest.Mocked<typeof prisma>;

// Genera un token cifrado simulando la estructura PsnStoredTokens
function makeEncryptedToken(opts: {
  accessExpired?: boolean;
  refreshExpired?: boolean;
}): string {
  const now = Date.now();
  const stored = {
    accessToken: 'access-token-abc',
    refreshToken: 'refresh-token-xyz',
    expiresAt: opts.accessExpired
      ? new Date(now - 1000).toISOString()   // ya expirado
      : new Date(now + 3600_000).toISOString(), // válido 1h
    refreshTokenExpiresAt: opts.refreshExpired
      ? new Date(now - 1000).toISOString()   // ya expirado
      : new Date(now + 5_184_000_000).toISOString(), // válido 60 días
  };
  return `enc:${JSON.stringify(stored)}`;
}

const baseAccount = {
  id: 'acc-psn-1',
  userId: 'user-1',
  platform: 'PSN' as const,
  externalId: 'psn-account-id',
  username: 'testpsn',
  lastSyncedAt: null,
  syncCooldownUntil: null,
  requiresReauth: false,
  tokenExpiresAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const emptyTitlesResponse = { trophyTitles: [], totalItemCount: 0, nextOffset: undefined };

beforeEach(() => {
  jest.clearAllMocks();
  mockGetUserTitles.mockResolvedValue(emptyTitlesResponse);
  mockGetTitleTrophies.mockResolvedValue({ trophies: [] });
  mockGetUserTrophiesEarned.mockResolvedValue({ trophies: [] });
  (mockPrisma.platformAccount.update as jest.Mock).mockResolvedValue({});
});

// ─── Test 1: Token de acceso válido — sync sin llamada a refresh ──────────────

describe('PsnAdapter.syncUser — token de acceso válido', () => {
  it('usa el access token directamente sin llamar al refresh endpoint', async () => {
    const account = {
      ...baseAccount,
      encryptedToken: makeEncryptedToken({ accessExpired: false, refreshExpired: false }),
    };

    const result = await psnAdapter.syncUser(account);

    expect(mockExchangeRefresh).not.toHaveBeenCalled();
    expect(result.platform).toBe('PSN');
    expect(mockPrisma.platformAccount.update).not.toHaveBeenCalled();
  });
});

// ─── Test 2: Access Token expirado — se renueva con Refresh Token ─────────────

describe('PsnAdapter.syncUser — access token expirado', () => {
  it('llama a exchangeRefreshTokenForAuthTokens y persiste el nuevo token cifrado', async () => {
    const account = {
      ...baseAccount,
      encryptedToken: makeEncryptedToken({ accessExpired: true, refreshExpired: false }),
    };

    const freshTokens = {
      accessToken: 'new-access-token',
      refreshToken: 'new-refresh-token',
      expiresIn: 3600,
      refreshTokenExpiresIn: 5_184_000,
      idToken: '',
    };
    mockExchangeRefresh.mockResolvedValue(freshTokens);

    const result = await psnAdapter.syncUser(account);

    expect(mockExchangeRefresh).toHaveBeenCalledWith('refresh-token-xyz');
    // El token cifrado actualizado debe persistirse
    expect(mockPrisma.platformAccount.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'acc-psn-1' },
        data: expect.objectContaining({ encryptedToken: expect.stringContaining('enc:') }),
      }),
    );
    expect(result.platform).toBe('PSN');
    // Verifica que el nuevo token cifrado contiene el nuevo access token
    const updateCall = (mockPrisma.platformAccount.update as jest.Mock).mock.calls[0][0] as {
      data: { encryptedToken: string };
    };
    const decrypted = JSON.parse(updateCall.data.encryptedToken.replace('enc:', '')) as {
      accessToken: string;
    };
    expect(decrypted.accessToken).toBe('new-access-token');
  });
});

// ─── Test 3: Ambos tokens expirados — lanza PSN_REQUIRES_REAUTH ───────────────

describe('PsnAdapter.syncUser — refresh token expirado', () => {
  it('lanza AppError PSN_REFRESH_TOKEN_EXPIRED cuando el refresh token también ha expirado', async () => {
    const account = {
      ...baseAccount,
      encryptedToken: makeEncryptedToken({ accessExpired: true, refreshExpired: true }),
    };

    await expect(psnAdapter.syncUser(account)).rejects.toMatchObject({
      code: 'PSN_REFRESH_TOKEN_EXPIRED',
    });

    expect(mockExchangeRefresh).not.toHaveBeenCalled();
  });

  it('el error lanzado es instancia de AppError', async () => {
    const account = {
      ...baseAccount,
      encryptedToken: makeEncryptedToken({ accessExpired: true, refreshExpired: true }),
    };

    await expect(psnAdapter.syncUser(account)).rejects.toBeInstanceOf(AppError);
  });
});

// ─── Test 4: PlatformAccount se actualiza con los nuevos tokens ───────────────

describe('PsnAdapter.syncUser — persistencia del token renovado', () => {
  it('el encryptedToken persistido incluye nuevo refreshToken y refreshTokenExpiresAt actualizado', async () => {
    const account = {
      ...baseAccount,
      encryptedToken: makeEncryptedToken({ accessExpired: true, refreshExpired: false }),
    };

    const freshTokens = {
      accessToken: 'access-v2',
      refreshToken: 'refresh-v2',
      expiresIn: 3600,
      refreshTokenExpiresIn: 5_184_000,
      idToken: '',
    };
    mockExchangeRefresh.mockResolvedValue(freshTokens);

    await psnAdapter.syncUser(account);

    const updateCall = (mockPrisma.platformAccount.update as jest.Mock).mock.calls[0][0] as {
      data: { encryptedToken: string };
    };
    const stored = JSON.parse(updateCall.data.encryptedToken.replace('enc:', '')) as {
      accessToken: string;
      refreshToken: string;
      expiresAt: string;
      refreshTokenExpiresAt: string;
    };

    expect(stored.accessToken).toBe('access-v2');
    expect(stored.refreshToken).toBe('refresh-v2');
    // expiresAt debe ser en el futuro (~1h)
    expect(new Date(stored.expiresAt).getTime()).toBeGreaterThan(Date.now());
    // refreshTokenExpiresAt debe ser en el futuro (~60 días)
    expect(new Date(stored.refreshTokenExpiresAt).getTime()).toBeGreaterThan(Date.now());
  });
});
