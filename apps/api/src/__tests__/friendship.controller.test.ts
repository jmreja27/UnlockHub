// Tests HTTP para friendship controller — getFriendshipStatus y sendRequest con username

jest.mock('../services/friendship.service');
jest.mock('../repositories/user.repository');
jest.mock('../lib/prisma', () => ({
  prisma: {
    user: { findUnique: jest.fn().mockResolvedValue({ id: 'u1', deletedAt: null }) },
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

import * as friendshipService from '../services/friendship.service';
import * as userRepo from '../repositories/user.repository';
import app from '../app';
import { signAccessToken } from '../lib/jwt';

const mockGetStatus = friendshipService.getFriendshipStatus as jest.Mock;
const mockSendRequest = friendshipService.sendFriendRequest as jest.Mock;
const mockFindUser = userRepo.findUserByUsername as jest.Mock;

function makeToken() {
  return signAccessToken({ sub: 'u1', email: 'test@example.com', isPremium: false });
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env['JWT_ACCESS_SECRET'] = 'test_secret_at_least_32_characters_long_x';
  process.env['JWT_REFRESH_SECRET'] = 'test_refresh_secret_at_least_32_chars_xx';
  process.env['ENCRYPTION_KEY'] = '0'.repeat(64);
});

describe('GET /api/v1/friends/status/:username', () => {
  it('devuelve 200 con status none cuando no hay relación', async () => {
    mockGetStatus.mockResolvedValue({ status: 'none' });
    const res = await request(app)
      .get('/api/v1/friends/status/otherUser')
      .set('Authorization', `Bearer ${makeToken()}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'none' });
  });

  it('devuelve 200 con pending_sent', async () => {
    mockGetStatus.mockResolvedValue({ status: 'pending_sent', friendshipId: 'f1' });
    const res = await request(app)
      .get('/api/v1/friends/status/otherUser')
      .set('Authorization', `Bearer ${makeToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('pending_sent');
  });

  it('devuelve 200 con accepted', async () => {
    mockGetStatus.mockResolvedValue({ status: 'accepted', friendshipId: 'f2' });
    const res = await request(app)
      .get('/api/v1/friends/status/otherUser')
      .set('Authorization', `Bearer ${makeToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('accepted');
  });

  it('devuelve 404 si el usuario no existe', async () => {
    const { AppError } = await import('../middleware/errorHandler');
    mockGetStatus.mockRejectedValue(new AppError('Usuario no encontrado.', 'USER_NOT_FOUND', 404));
    const res = await request(app)
      .get('/api/v1/friends/status/ghost')
      .set('Authorization', `Bearer ${makeToken()}`);
    expect(res.status).toBe(404);
  });

  it('devuelve 401 sin token', async () => {
    const res = await request(app).get('/api/v1/friends/status/otherUser');
    expect(res.status).toBe(401);
  });
});

describe('POST /api/v1/friends con username', () => {
  it('envía solicitud por username y devuelve 201', async () => {
    mockFindUser.mockResolvedValue({ id: 'targetId', deletedAt: null });
    mockSendRequest.mockResolvedValue({ id: 'f1', status: 'PENDING', senderId: 'u1', receiverId: 'targetId', createdAt: new Date().toISOString() });
    const res = await request(app)
      .post('/api/v1/friends')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ username: 'targetUser' });
    expect(res.status).toBe(201);
    expect(mockFindUser).toHaveBeenCalledWith('targetUser');
  });

  it('devuelve 404 si el username no existe al enviar solicitud', async () => {
    mockFindUser.mockResolvedValue(null);
    const res = await request(app)
      .post('/api/v1/friends')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ username: 'ghost' });
    expect(res.status).toBe(404);
  });

  it('envía solicitud por receiverId (comportamiento existente)', async () => {
    mockSendRequest.mockResolvedValue({ id: 'f1', status: 'PENDING', senderId: 'u1', receiverId: 'clq123456789012345678901234', createdAt: new Date().toISOString() });
    const res = await request(app)
      .post('/api/v1/friends')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ receiverId: 'clq123456789012345678901234' });
    expect(res.status).toBe(201);
    expect(mockFindUser).not.toHaveBeenCalled();
  });
});
