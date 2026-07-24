// Tests HTTP para achievement-challenge — crear/aceptar/rechazar/listar retos 1v1 por logro

jest.mock('../services/achievement-challenge.service');
jest.mock('../lib/prisma', () => ({
  prisma: {
    user: { findUnique: jest.fn().mockResolvedValue({ id: 'u1', deletedAt: null }) },
  },
}));
jest.mock('../lib/redis', () => ({
  redis: {
    on: jest.fn(),
    get: jest.fn().mockResolvedValue(null),
    setex: jest.fn().mockResolvedValue('OK'),
  },
}));
jest.mock('../middleware/rateLimiter', () => ({
  globalRateLimiter: (_req: unknown, _res: unknown, next: () => void) => next(),
  authRateLimiter: (_req: unknown, _res: unknown, next: () => void) => next(),
  searchRateLimiter: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

import request from 'supertest';

import * as achievementChallengeService from '../services/achievement-challenge.service';
import { AppError } from '../middleware/errorHandler';
import app from '../app';
import { signAccessToken } from '../lib/jwt';

const mockCreate = achievementChallengeService.createChallenge as jest.Mock;
const mockAccept = achievementChallengeService.acceptChallenge as jest.Mock;
const mockReject = achievementChallengeService.rejectChallenge as jest.Mock;
const mockList = achievementChallengeService.listMyChallenges as jest.Mock;

const ACHIEVEMENT_ID = 'cachievement1';
const CHALLENGED_ID = 'cchallenged1';
const CHALLENGE_ID = 'cchallengerow1';

function makeToken() {
  return signAccessToken({ sub: 'u1', email: 'test@example.com', isPremium: false });
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env['JWT_ACCESS_SECRET'] = 'test_secret_at_least_32_characters_long_x';
  process.env['JWT_REFRESH_SECRET'] = 'test_refresh_secret_at_least_32_chars_xx';
  process.env['ENCRYPTION_KEY'] = '0'.repeat(64);
});

describe('POST /api/v1/achievements/:id/challenge', () => {
  it('devuelve 200 y el reto creado', async () => {
    mockCreate.mockResolvedValue({ id: CHALLENGE_ID, status: 'PENDING' });

    const res = await request(app)
      .post(`/api/v1/achievements/${ACHIEVEMENT_ID}/challenge`)
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ challengedUserId: CHALLENGED_ID });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: CHALLENGE_ID, status: 'PENDING' });
    expect(mockCreate).toHaveBeenCalledWith('u1', CHALLENGED_ID, ACHIEVEMENT_ID);
  });

  it('devuelve 400 si challengedUserId no es un CUID válido', async () => {
    const res = await request(app)
      .post(`/api/v1/achievements/${ACHIEVEMENT_ID}/challenge`)
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ challengedUserId: 'not-a-cuid' });

    expect(res.status).toBe(400);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('devuelve 409 cuando el servicio lanza CHALLENGE_ALREADY_ACTIVE', async () => {
    mockCreate.mockRejectedValue(new AppError('Ya hay un reto activo', 'CHALLENGE_ALREADY_ACTIVE', 409));

    const res = await request(app)
      .post(`/api/v1/achievements/${ACHIEVEMENT_ID}/challenge`)
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ challengedUserId: CHALLENGED_ID });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('CHALLENGE_ALREADY_ACTIVE');
  });

  it('devuelve 401 sin token', async () => {
    const res = await request(app)
      .post(`/api/v1/achievements/${ACHIEVEMENT_ID}/challenge`)
      .send({ challengedUserId: CHALLENGED_ID });

    expect(res.status).toBe(401);
  });
});

describe('POST /api/v1/achievement-challenges/:id/accept', () => {
  it('devuelve 200 con el reto aceptado', async () => {
    mockAccept.mockResolvedValue({ id: CHALLENGE_ID, status: 'ACCEPTED' });

    const res = await request(app)
      .post(`/api/v1/achievement-challenges/${CHALLENGE_ID}/accept`)
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(mockAccept).toHaveBeenCalledWith(CHALLENGE_ID, 'u1');
  });

  it('devuelve 403 cuando el servicio lanza FORBIDDEN', async () => {
    mockAccept.mockRejectedValue(new AppError('Solo el usuario retado puede aceptar', 'FORBIDDEN', 403));

    const res = await request(app)
      .post(`/api/v1/achievement-challenges/${CHALLENGE_ID}/accept`)
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(403);
  });

  it('devuelve 400 si :id no es un CUID válido', async () => {
    const res = await request(app)
      .post('/api/v1/achievement-challenges/not-a-cuid/accept')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(400);
    expect(mockAccept).not.toHaveBeenCalled();
  });
});

describe('POST /api/v1/achievement-challenges/:id/reject', () => {
  it('devuelve 200 con el reto rechazado', async () => {
    mockReject.mockResolvedValue({ id: CHALLENGE_ID, status: 'REJECTED' });

    const res = await request(app)
      .post(`/api/v1/achievement-challenges/${CHALLENGE_ID}/reject`)
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(mockReject).toHaveBeenCalledWith(CHALLENGE_ID, 'u1');
  });

  it('devuelve 409 cuando el servicio lanza CHALLENGE_NOT_PENDING', async () => {
    mockReject.mockRejectedValue(new AppError('Ya no está pendiente', 'CHALLENGE_NOT_PENDING', 409));

    const res = await request(app)
      .post(`/api/v1/achievement-challenges/${CHALLENGE_ID}/reject`)
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(409);
  });
});

describe('GET /api/v1/achievement-challenges/me', () => {
  it('devuelve 200 con la lista paginada', async () => {
    mockList.mockResolvedValue({ data: [], total: 0, page: 1, limit: 20 });

    const res = await request(app)
      .get('/api/v1/achievement-challenges/me')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: [], total: 0, page: 1, limit: 20 });
    expect(mockList).toHaveBeenCalledWith('u1', undefined, 1, 20);
  });

  it('pasa el filtro de status y la paginación de query string', async () => {
    mockList.mockResolvedValue({ data: [], total: 0, page: 2, limit: 5 });

    const res = await request(app)
      .get('/api/v1/achievement-challenges/me?status=ACCEPTED&page=2&limit=5')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(mockList).toHaveBeenCalledWith('u1', 'ACCEPTED', 2, 5);
  });

  it('devuelve 400 con un status inválido', async () => {
    const res = await request(app)
      .get('/api/v1/achievement-challenges/me?status=NOT_A_STATUS')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(400);
    expect(mockList).not.toHaveBeenCalled();
  });

  it('devuelve 401 sin token', async () => {
    const res = await request(app).get('/api/v1/achievement-challenges/me');
    expect(res.status).toBe(401);
  });
});
