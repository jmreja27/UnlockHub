// Tests de buildAuthWithRefresh (método legacy mantenido para seed-games.ts).
// El sync de usuarios ya no usa tokens de usuario — usa getSystemPsnAuth() (PSN_SYSTEM_NPSSO).

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

import { exchangeRefreshTokenForAuthTokens } from 'psn-api';

const mockExchangeRefresh = exchangeRefreshTokenForAuthTokens as jest.Mock;

// Genera un encryptedToken simulando la estructura PsnStoredTokens
function makeEncryptedToken(opts: {
  accessExpired?: boolean;
  refreshExpired?: boolean;
}): string {
  const now = Date.now();
  const stored = {
    accessToken: 'access-token-abc',
    refreshToken: 'refresh-token-xyz',
    expiresAt: opts.accessExpired
      ? new Date(now - 1000).toISOString()
      : new Date(now + 3600_000).toISOString(),
    refreshTokenExpiresAt: opts.refreshExpired
      ? new Date(now - 1000).toISOString()
      : new Date(now + 5_184_000_000).toISOString(),
  };
  return `enc:${JSON.stringify(stored)}`;
}

const baseAccount = {
  id: 'acc-psn-1',
  userId: 'user-1',
  platform: 'PSN' as const,
  externalId: 'psn-account-id',
  username: 'testpsn',
  encryptedToken: '',
  lastSyncedAt: null,
  syncCooldownUntil: null,
  requiresReauth: false,
  tokenExpiresAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

beforeEach(() => {
  jest.clearAllMocks();
});

// ─── buildAuthWithRefresh: access token válido ────────────────────────────────

describe('PsnAdapter.buildAuthWithRefresh — access token válido', () => {
  it('devuelve el access token sin llamar al refresh endpoint', async () => {
    const account = {
      ...baseAccount,
      encryptedToken: makeEncryptedToken({ accessExpired: false }),
    };

    const { auth, updatedEncryptedToken } = await psnAdapter.buildAuthWithRefresh(account);

    expect(auth.accessToken).toBe('access-token-abc');
    expect(updatedEncryptedToken).toBeNull();
    expect(mockExchangeRefresh).not.toHaveBeenCalled();
  });
});

// ─── buildAuthWithRefresh: access token expirado ──────────────────────────────

describe('PsnAdapter.buildAuthWithRefresh — access token expirado', () => {
  it('renueva el token y devuelve el token cifrado actualizado', async () => {
    const account = {
      ...baseAccount,
      encryptedToken: makeEncryptedToken({ accessExpired: true, refreshExpired: false }),
    };
    mockExchangeRefresh.mockResolvedValue({
      accessToken: 'new-access-token',
      refreshToken: 'new-refresh-token',
      expiresIn: 3600,
      refreshTokenExpiresIn: 5_184_000,
      idToken: '',
    });

    const { auth, updatedEncryptedToken } = await psnAdapter.buildAuthWithRefresh(account);

    expect(mockExchangeRefresh).toHaveBeenCalledWith('refresh-token-xyz');
    expect(auth.accessToken).toBe('new-access-token');
    expect(updatedEncryptedToken).not.toBeNull();

    const stored = JSON.parse((updatedEncryptedToken as string).replace('enc:', '')) as {
      accessToken: string;
      refreshToken: string;
      expiresAt: string;
      refreshTokenExpiresAt: string;
    };
    expect(stored.accessToken).toBe('new-access-token');
    expect(stored.refreshToken).toBe('new-refresh-token');
    expect(new Date(stored.expiresAt).getTime()).toBeGreaterThan(Date.now());
    expect(new Date(stored.refreshTokenExpiresAt).getTime()).toBeGreaterThan(Date.now());
  });
});

// ─── buildAuthWithRefresh: ambos tokens expirados ────────────────────────────

describe('PsnAdapter.buildAuthWithRefresh — refresh token expirado', () => {
  it('lanza PSN_REFRESH_TOKEN_EXPIRED cuando ambos tokens han expirado', async () => {
    const account = {
      ...baseAccount,
      encryptedToken: makeEncryptedToken({ accessExpired: true, refreshExpired: true }),
    };

    await expect(psnAdapter.buildAuthWithRefresh(account)).rejects.toMatchObject({
      code: 'PSN_REFRESH_TOKEN_EXPIRED',
    });
    expect(mockExchangeRefresh).not.toHaveBeenCalled();
  });

  it('el error lanzado es instancia de AppError', async () => {
    const account = {
      ...baseAccount,
      encryptedToken: makeEncryptedToken({ accessExpired: true, refreshExpired: true }),
    };

    await expect(psnAdapter.buildAuthWithRefresh(account)).rejects.toBeInstanceOf(AppError);
  });
});

// ─── buildAuthWithRefresh: token corrupto ────────────────────────────────────

describe('PsnAdapter.buildAuthWithRefresh — token corrupto', () => {
  it('lanza PSN_TOKEN_CORRUPT si encryptedToken no es JSON válido', async () => {
    const account = {
      ...baseAccount,
      encryptedToken: 'enc:not-a-valid-json',
    };

    await expect(psnAdapter.buildAuthWithRefresh(account)).rejects.toMatchObject({
      code: 'PSN_TOKEN_CORRUPT',
      statusCode: 401,
    });
  });
});
