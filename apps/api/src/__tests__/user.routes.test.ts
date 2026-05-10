// Tests de integración HTTP para /api/v1/users/*
// Mockea los servicios para aislar la capa de controlador+rutas

jest.mock('../services/user.service');
jest.mock('../lib/redis', () => ({ redis: { on: jest.fn() } }));
jest.mock('../middleware/rateLimiter', () => ({
  globalRateLimiter: (_req: unknown, _res: unknown, next: () => void) => next(),
  authRateLimiter: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

import request from 'supertest';
import * as userService from '../services/user.service';
import app from '../app';
import { signAccessToken } from '../lib/jwt';
import { AppError } from '../middleware/errorHandler';

const mockUserService = userService as jest.Mocked<typeof userService>;

const baseProfile = {
  id: 'user-1',
  username: 'testuser',
  email: 'test@example.com',
  avatar: null,
  banner: null,
  bio: null,
  level: 5,
  xp: 4500,
  streakDays: 3,
  countryCode: 'ES',
  isPremium: false,
  premiumUntil: null,
  lastSyncAt: null,
  createdAt: new Date().toISOString(),
  platformAccounts: [],
};

let validToken: string;

beforeEach(() => {
  jest.clearAllMocks();
  process.env['JWT_ACCESS_SECRET'] = 'test_secret_at_least_32_characters_long_x';
  validToken = signAccessToken({ sub: 'user-1', email: 'test@example.com', isPremium: false });
});

// ─── GET /me ──────────────────────────────────────────────────────────────────

describe('GET /api/v1/users/me', () => {
  it('401 sin token de acceso', async () => {
    const res = await request(app).get('/api/v1/users/me');
    expect(res.status).toBe(401);
  });

  it('200 con perfil completo cuando el token es válido', async () => {
    mockUserService.getProfile.mockResolvedValue(baseProfile as any);

    const res = await request(app)
      .get('/api/v1/users/me')
      .set('Authorization', `Bearer ${validToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: 'user-1', username: 'testuser' });
    expect(mockUserService.getProfile).toHaveBeenCalledWith('user-1');
  });
});

// ─── PATCH /me ────────────────────────────────────────────────────────────────

describe('PATCH /api/v1/users/me', () => {
  it('401 sin token de acceso', async () => {
    const res = await request(app).patch('/api/v1/users/me').send({ bio: 'nueva bio' });
    expect(res.status).toBe(401);
  });

  it('200 con usuario actualizado', async () => {
    mockUserService.updateProfile.mockResolvedValue({ ...baseProfile, bio: 'nueva bio' } as any);

    const res = await request(app)
      .patch('/api/v1/users/me')
      .set('Authorization', `Bearer ${validToken}`)
      .send({ bio: 'nueva bio' });

    expect(res.status).toBe(200);
    expect(res.body.bio).toBe('nueva bio');
    expect(mockUserService.updateProfile).toHaveBeenCalledWith('user-1', { bio: 'nueva bio' });
  });

  it('400 VALIDATION_ERROR con datos inválidos', async () => {
    const res = await request(app)
      .patch('/api/v1/users/me')
      .set('Authorization', `Bearer ${validToken}`)
      .send({ countryCode: 'DEMASIADO_LARGO' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(mockUserService.updateProfile).not.toHaveBeenCalled();
  });
});

// ─── GET /me/games ────────────────────────────────────────────────────────────

describe('GET /api/v1/users/me/games', () => {
  const gamesResponse = {
    data: [
      {
        id: 'game-1',
        title: 'Portal',
        platform: 'STEAM',
        iconUrl: null,
        totalAchievements: 4,
        earnedAchievements: 2,
        completionPct: 50,
        lastSyncedAt: null,
      },
    ],
    total: 1,
  };

  it('401 sin token de acceso', async () => {
    const res = await request(app).get('/api/v1/users/me/games');
    expect(res.status).toBe(401);
  });

  it('200 con la lista de juegos del usuario', async () => {
    mockUserService.getMyGames.mockResolvedValue(gamesResponse as any);

    const res = await request(app)
      .get('/api/v1/users/me/games')
      .set('Authorization', `Bearer ${validToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.total).toBe(1);
    expect(mockUserService.getMyGames).toHaveBeenCalledWith('user-1', undefined);
  });

  it('pasa el filtro de plataforma al servicio cuando se especifica', async () => {
    mockUserService.getMyGames.mockResolvedValue({ data: [], total: 0 });

    const res = await request(app)
      .get('/api/v1/users/me/games?platform=STEAM')
      .set('Authorization', `Bearer ${validToken}`);

    expect(res.status).toBe(200);
    expect(mockUserService.getMyGames).toHaveBeenCalledWith('user-1', 'STEAM');
  });

  it('400 VALIDATION_ERROR con plataforma inválida', async () => {
    const res = await request(app)
      .get('/api/v1/users/me/games?platform=INVALID')
      .set('Authorization', `Bearer ${validToken}`);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(mockUserService.getMyGames).not.toHaveBeenCalled();
  });

  it('200 con lista vacía para usuario sin logros', async () => {
    mockUserService.getMyGames.mockResolvedValue({ data: [], total: 0 });

    const res = await request(app)
      .get('/api/v1/users/me/games')
      .set('Authorization', `Bearer ${validToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(0);
    expect(res.body.total).toBe(0);
  });
});

// ─── DELETE /me ───────────────────────────────────────────────────────────────

describe('DELETE /api/v1/users/me', () => {
  it('401 sin token de acceso', async () => {
    const res = await request(app).delete('/api/v1/users/me');
    expect(res.status).toBe(401);
  });

  it('200 y limpia cookie cuando el token es válido', async () => {
    mockUserService.deleteAccount.mockResolvedValue(undefined);

    const res = await request(app)
      .delete('/api/v1/users/me')
      .set('Authorization', `Bearer ${validToken}`);

    expect(res.status).toBe(200);
    expect(res.body.message).toBeDefined();
    expect(mockUserService.deleteAccount).toHaveBeenCalledWith('user-1');
  });

  it('404 USER_NOT_FOUND si el usuario no existe', async () => {
    mockUserService.deleteAccount.mockRejectedValue(
      new AppError('Usuario no encontrado', 'USER_NOT_FOUND', 404),
    );

    const res = await request(app)
      .delete('/api/v1/users/me')
      .set('Authorization', `Bearer ${validToken}`);

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('USER_NOT_FOUND');
  });
});

// ─── GET /:username ───────────────────────────────────────────────────────────

describe('GET /api/v1/users/:username', () => {
  it('200 con el perfil público del usuario', async () => {
    mockUserService.getPublicProfile.mockResolvedValue(baseProfile as any);

    const res = await request(app).get('/api/v1/users/testuser');

    expect(res.status).toBe(200);
    expect(res.body.username).toBe('testuser');
    expect(mockUserService.getPublicProfile).toHaveBeenCalledWith('testuser');
  });

  it('404 USER_NOT_FOUND si el usuario no existe', async () => {
    mockUserService.getPublicProfile.mockRejectedValue(
      new AppError('Usuario no encontrado', 'USER_NOT_FOUND', 404),
    );

    const res = await request(app).get('/api/v1/users/noexiste');

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('USER_NOT_FOUND');
  });
});
