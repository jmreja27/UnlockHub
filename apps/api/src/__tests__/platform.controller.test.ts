// Tests de integración HTTP para los handlers de vinculación de plataformas

jest.mock('../platforms/psn.adapter');
jest.mock('../platforms/steam.adapter');
jest.mock('../platforms/retroachievements.adapter');
jest.mock('../services/platform.service');
jest.mock('../lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: jest.fn().mockResolvedValue({ id: 'u1' }),
    },
  },
}));
jest.mock('../services/sync.service', () => ({
  runExpressThenQueueFull: jest.fn().mockResolvedValue(undefined),
  getSyncStatus: jest.fn(),
  getAggregateSyncStatus: jest.fn(),
}));
jest.mock('../lib/redis', () => ({
  redis: {
    on: jest.fn(),
    zadd: jest.fn(),
    zrevrank: jest.fn(),
    zscore: jest.fn(),
    get: jest.fn().mockResolvedValue(null),
    setex: jest.fn().mockResolvedValue('OK'),
    pipeline: jest.fn().mockReturnValue({ zrem: jest.fn().mockReturnThis(), exec: jest.fn() }),
  },
}));
jest.mock('../middleware/rateLimiter', () => ({
  globalRateLimiter: (_req: unknown, _res: unknown, next: () => void) => next(),
  authRateLimiter: (_req: unknown, _res: unknown, next: () => void) => next(),
  searchRateLimiter: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

import request from 'supertest';

import * as psnAdapter from '../platforms/psn.adapter';
import * as platformService from '../services/platform.service';
import * as syncService from '../services/sync.service';
import app from '../app';
import { signAccessToken } from '../lib/jwt';
import type { PlatformAccount } from '@prisma/client';

const mockGetSystemPsnAuth = psnAdapter.getSystemPsnAuth as jest.Mock;
const mockLookupPsnUser = psnAdapter.lookupPsnUser as jest.Mock;
const mockCheckPsnProfilePrivacy = psnAdapter.checkPsnProfilePrivacy as jest.Mock;
const mockLinkPlatform = platformService.linkPlatform as jest.Mock;
const mockRunExpressThenQueueFull = syncService.runExpressThenQueueFull as jest.Mock;

function makeToken() {
  return signAccessToken({ sub: 'u1', email: 'test@example.com', isPremium: false });
}

const fakeAccount: PlatformAccount = {
  id: 'acct-1',
  userId: 'u1',
  platform: 'PSN',
  externalId: 'psn-account-id-123',
  username: 'PSNUser99',
  encryptedToken: '',
  lastSyncedAt: null,
  syncCooldownUntil: null,
  requiresReauth: false,
  psnProfilePrivate: false,
};

beforeEach(() => {
  jest.clearAllMocks();
  process.env['JWT_ACCESS_SECRET'] = 'test_secret_at_least_32_characters_long_x';
  process.env['JWT_REFRESH_SECRET'] = 'test_refresh_secret_at_least_32_chars_xx';
  process.env['ENCRYPTION_KEY'] = '0'.repeat(64);

  // Por defecto, autenticación PSN del sistema funciona
  mockGetSystemPsnAuth.mockResolvedValue({ accessToken: 'sys-token' });
  mockLookupPsnUser.mockResolvedValue({ accountId: 'psn-account-id-123', onlineId: 'PSNUser99' });
});

// ─── POST /api/v1/platforms/psn/link ─────────────────────────────────────────

describe('POST /api/v1/platforms/psn/link — BUG-4', () => {
  it('BUG-4: devuelve 400 PSN_PROFILE_PRIVATE cuando el perfil es privado', async () => {
    mockCheckPsnProfilePrivacy.mockResolvedValue(true);

    const res = await request(app)
      .post('/api/v1/platforms/psn/link')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ username: 'PrivateUser' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('PSN_PROFILE_PRIVATE');
  });

  it('BUG-4: NO crea PlatformAccount cuando el perfil PSN es privado', async () => {
    mockCheckPsnProfilePrivacy.mockResolvedValue(true);

    await request(app)
      .post('/api/v1/platforms/psn/link')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ username: 'PrivateUser' });

    // linkPlatform no debe haberse llamado
    expect(mockLinkPlatform).not.toHaveBeenCalled();
  });

  it('devuelve 201 y vincula cuando el perfil PSN es público', async () => {
    mockCheckPsnProfilePrivacy.mockResolvedValue(false);
    mockLinkPlatform.mockResolvedValue(fakeAccount);

    const res = await request(app)
      .post('/api/v1/platforms/psn/link')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ username: 'PSNUser99' });

    expect(res.status).toBe(201);
    expect(mockLinkPlatform).toHaveBeenCalledWith('u1', 'PSN', 'psn-account-id-123', 'PSNUser99', '');
  });

  it('201 inmediato — no espera el express sync (fire-and-forget) y llama runExpressThenQueueFull', async () => {
    mockCheckPsnProfilePrivacy.mockResolvedValue(false);
    mockLinkPlatform.mockResolvedValue(fakeAccount);

    const res = await request(app)
      .post('/api/v1/platforms/psn/link')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ username: 'PSNUser99' });

    expect(res.status).toBe(201);
    expect(mockRunExpressThenQueueFull).toHaveBeenCalledWith('u1', 'PSN');
  });
});

// ─── POST /api/v1/platforms/steam/link — fire-and-forget ──────────────────────

describe('POST /api/v1/platforms/steam/link — runExpressThenQueueFull', () => {
  const { resolveVanityUrl, checkSteamProfilePublic } = jest.requireMock('../platforms/steam.adapter') as {
    resolveVanityUrl: jest.Mock;
    checkSteamProfilePublic: jest.Mock;
  };

  it('devuelve 201 y llama runExpressThenQueueFull en fire-and-forget', async () => {
    resolveVanityUrl.mockResolvedValue('76561198000000000');
    checkSteamProfilePublic.mockResolvedValue(undefined);
    mockLinkPlatform.mockResolvedValue({ ...fakeAccount, platform: 'STEAM' });

    const res = await request(app)
      .post('/api/v1/platforms/steam/link')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ username: 'testuser' });

    expect(res.status).toBe(201);
    expect(mockRunExpressThenQueueFull).toHaveBeenCalledWith('u1', 'STEAM');
  });
});

// ─── POST /api/v1/platforms/ra/link — fire-and-forget ─────────────────────────

describe('POST /api/v1/platforms/ra/link — runExpressThenQueueFull', () => {
  const { lookupRaUser } = jest.requireMock('../platforms/retroachievements.adapter') as {
    lookupRaUser: jest.Mock;
  };

  it('devuelve 201 y llama runExpressThenQueueFull en fire-and-forget', async () => {
    lookupRaUser.mockResolvedValue({ username: 'rauser', points: 1000 });
    mockLinkPlatform.mockResolvedValue({ ...fakeAccount, platform: 'RA' });

    const res = await request(app)
      .post('/api/v1/platforms/ra/link')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ username: 'rauser' });

    expect(res.status).toBe(201);
    expect(mockRunExpressThenQueueFull).toHaveBeenCalledWith('u1', 'RA');
  });
});
