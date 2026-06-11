// Tests de integración HTTP para el handler GET /api/v1/rankings/me
// Verifica que el parámetro ?platform se lee y se pasa correctamente a getUserRank

jest.mock('../services/ranking.service', () => ({
  getGlobalRanking: jest.fn(),
  getPlatformRanking: jest.fn(),
  getUserRank: jest.fn(),
  upsertUserScore: jest.fn(),
  removeUserFromRankings: jest.fn(),
  takeRankingSnapshot: jest.fn(),
  seedRankingsFromDb: jest.fn(),
}));

jest.mock('../lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: jest.fn().mockResolvedValue({ id: 'u1', deletedAt: null }),
    },
  },
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

import * as rankingService from '../services/ranking.service';
import app from '../app';
import { signAccessToken } from '../lib/jwt';

const mockGetUserRank = rankingService.getUserRank as jest.Mock;
const mockGetGlobalRanking = rankingService.getGlobalRanking as jest.Mock;
const mockGetPlatformRanking = rankingService.getPlatformRanking as jest.Mock;

function makeToken() {
  return signAccessToken({ sub: 'u1', email: 'test@example.com', isPremium: false });
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env['JWT_ACCESS_SECRET'] = 'test_secret_at_least_32_characters_long_x';
  process.env['JWT_REFRESH_SECRET'] = 'test_refresh_secret_at_least_32_chars_xx';
  process.env['ENCRYPTION_KEY'] = '0'.repeat(64);

  // Defaults para evitar errores en tests de lista
  mockGetGlobalRanking.mockResolvedValue({ data: [], total: 0, page: 1, limit: 50 });
  mockGetPlatformRanking.mockResolvedValue({ data: [], total: 0, page: 1, limit: 50 });
});

// ─── GET /api/v1/rankings/me ─────────────────────────────────────────────────

describe('GET /api/v1/rankings/me', () => {
  it('devuelve 401 sin token de autenticación', async () => {
    const res = await request(app).get('/api/v1/rankings/me');
    expect(res.status).toBe(401);
  });

  it('sin ?platform llama a getUserRank con platform=undefined — lee de ranking:global', async () => {
    mockGetUserRank.mockResolvedValue({ rank: 1, xp: 5000 });

    const res = await request(app)
      .get('/api/v1/rankings/me')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(mockGetUserRank).toHaveBeenCalledWith('u1', undefined);
    expect(res.body).toEqual({ rank: 1, xp: 5000 });
  });

  it('con ?platform=PSN llama a getUserRank con platform="PSN" — lee de ranking:platform:psn, NO de ranking:global', async () => {
    // BUG original: se llamaba getUserRank(userId) sin platform → siempre devolvía XP global
    // Fix: se pasa platform='PSN' → getUserRank lee ZSCORE de ranking:platform:psn
    mockGetUserRank.mockResolvedValue({ rank: 3, xp: 1200 });

    const res = await request(app)
      .get('/api/v1/rankings/me?platform=PSN')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    // El controlador DEBE pasar 'PSN' — antes del fix siempre pasaba undefined
    expect(mockGetUserRank).toHaveBeenCalledWith('u1', 'PSN');
    expect(res.body).toEqual({ rank: 3, xp: 1200 });
  });

  it('con ?platform=RA llama a getUserRank con platform="RA"', async () => {
    mockGetUserRank.mockResolvedValue({ rank: 10, xp: 450 });

    const res = await request(app)
      .get('/api/v1/rankings/me?platform=RA')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(mockGetUserRank).toHaveBeenCalledWith('u1', 'RA');
    expect(res.body.xp).toBe(450);
  });

  it('con ?platform=STEAM llama a getUserRank con platform="STEAM"', async () => {
    mockGetUserRank.mockResolvedValue({ rank: 2, xp: 3500 });

    const res = await request(app)
      .get('/api/v1/rankings/me?platform=STEAM')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(mockGetUserRank).toHaveBeenCalledWith('u1', 'STEAM');
    expect(res.body.xp).toBe(3500);
  });

  it('el XP devuelto es el del sorted set (Redis ZSCORE), no user.xp de PostgreSQL', async () => {
    // El usuario tiene 367_155 XP total, pero solo 1_520 XP en RA
    const USER_TOTAL_XP = 367_155;
    const USER_RA_XP = 1_520;

    // getUserRank con platform=RA devuelve XP específico de RA desde Redis
    mockGetUserRank.mockImplementation((_userId: string, platform?: string) => {
      if (platform === 'RA') return Promise.resolve({ rank: 5, xp: USER_RA_XP });
      return Promise.resolve({ rank: 1, xp: USER_TOTAL_XP });
    });

    // Filtro RA: debe mostrar USER_RA_XP, no USER_TOTAL_XP
    const resPsn = await request(app)
      .get('/api/v1/rankings/me?platform=RA')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(resPsn.body.xp).toBe(USER_RA_XP);
    expect(resPsn.body.xp).not.toBe(USER_TOTAL_XP);

    // Sin filtro: debe mostrar USER_TOTAL_XP
    const resGlobal = await request(app)
      .get('/api/v1/rankings/me')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(resGlobal.body.xp).toBe(USER_TOTAL_XP);
  });

  it('plataforma en minúsculas se convierte a mayúsculas antes de llamar a getUserRank', async () => {
    mockGetUserRank.mockResolvedValue({ rank: 1, xp: 100 });

    await request(app)
      .get('/api/v1/rankings/me?platform=psn')
      .set('Authorization', `Bearer ${makeToken()}`);

    // El controlador hace toUpperCase() antes de pasar a getUserRank
    expect(mockGetUserRank).toHaveBeenCalledWith('u1', 'PSN');
  });

  it('devuelve rank=null cuando el usuario no está en el sorted set', async () => {
    mockGetUserRank.mockResolvedValue({ rank: null, xp: 0 });

    const res = await request(app)
      .get('/api/v1/rankings/me?platform=PSN')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.rank).toBeNull();
    expect(res.body.xp).toBe(0);
  });

  it('rechaza plataforma desconocida con 400 VALIDATION_ERROR', async () => {
    const res = await request(app)
      .get('/api/v1/rankings/me?platform=INVALID_PLATFORM')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(mockGetUserRank).not.toHaveBeenCalled();
  });
});
