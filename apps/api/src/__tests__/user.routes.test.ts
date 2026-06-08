// Tests de integración HTTP para /api/v1/users/*
// Mockea los servicios para aislar la capa de controlador+rutas

jest.mock('../services/user.service');
jest.mock('../lib/cloudinary', () => ({ cloudinary: { uploader: { upload: jest.fn() } } }));
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
    mockUserService.getProfile.mockResolvedValue(baseProfile as unknown as never);

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
    mockUserService.updateProfile.mockResolvedValue({ ...baseProfile, bio: 'nueva bio' } as unknown as never);

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
    mockUserService.getMyGames.mockResolvedValue(gamesResponse as unknown as never);

    const res = await request(app)
      .get('/api/v1/users/me/games')
      .set('Authorization', `Bearer ${validToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.total).toBe(1);
    expect(mockUserService.getMyGames).toHaveBeenCalledWith('user-1', undefined, 1, 20);
  });

  it('pasa el filtro de plataforma al servicio cuando se especifica', async () => {
    mockUserService.getMyGames.mockResolvedValue({ data: [], total: 0 });

    const res = await request(app)
      .get('/api/v1/users/me/games?platform=STEAM')
      .set('Authorization', `Bearer ${validToken}`);

    expect(res.status).toBe(200);
    expect(mockUserService.getMyGames).toHaveBeenCalledWith('user-1', 'STEAM', 1, 20);
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
    mockUserService.getPublicProfile.mockResolvedValue(baseProfile as unknown as never);

    const res = await request(app).get('/api/v1/users/testuser');

    expect(res.status).toBe(200);
    expect(res.body.username).toBe('testuser');
    // authenticateOptional: sin token, requestingUserId es undefined
    expect(mockUserService.getPublicProfile).toHaveBeenCalledWith('testuser', undefined);
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

// ─── POST /me/avatar ──────────────────────────────────────────────────────────

describe('POST /api/v1/users/me/avatar', () => {
  const updatedProfile = { ...baseProfile, avatar: 'https://res.cloudinary.com/x/image/upload/avatar.jpg' };

  it('401 sin token de acceso', async () => {
    const res = await request(app)
      .post('/api/v1/users/me/avatar')
      .attach('avatar', Buffer.from('fake-image'), { filename: 'avatar.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(401);
  });

  it('400 cuando no se adjunta ningún archivo', async () => {
    const res = await request(app)
      .post('/api/v1/users/me/avatar')
      .set('Authorization', `Bearer ${validToken}`);

    expect(res.status).toBe(400);
  });

  it('400 cuando el tipo de archivo no está permitido', async () => {
    const res = await request(app)
      .post('/api/v1/users/me/avatar')
      .set('Authorization', `Bearer ${validToken}`)
      .attach('avatar', Buffer.from('fake-gif'), { filename: 'avatar.gif', contentType: 'image/gif' });

    expect(res.status).toBe(400);
  });

  it('200 con avatar URL cuando la subida es exitosa', async () => {
    mockUserService.uploadAvatar.mockResolvedValue(updatedProfile);

    const res = await request(app)
      .post('/api/v1/users/me/avatar')
      .set('Authorization', `Bearer ${validToken}`)
      .attach('avatar', Buffer.from('fake-png'), { filename: 'avatar.png', contentType: 'image/png' });

    expect(res.status).toBe(200);
    expect(res.body.avatar).toBe(updatedProfile.avatar);
  });

  it('propaga errores del servicio', async () => {
    mockUserService.uploadAvatar.mockRejectedValue(
      new AppError('Error al subir imagen', 'UPLOAD_ERROR', 500),
    );

    const res = await request(app)
      .post('/api/v1/users/me/avatar')
      .set('Authorization', `Bearer ${validToken}`)
      .attach('avatar', Buffer.from('fake-png'), { filename: 'avatar.png', contentType: 'image/png' });

    expect(res.status).toBe(500);
    expect(res.body.code).toBe('UPLOAD_ERROR');
  });
});

// ─── POST /me/banner ──────────────────────────────────────────────────────────

describe('POST /api/v1/users/me/banner', () => {
  const updatedProfile = { ...baseProfile, banner: 'https://res.cloudinary.com/x/image/upload/banner.jpg' };

  it('401 sin token de acceso', async () => {
    const res = await request(app)
      .post('/api/v1/users/me/banner')
      .attach('banner', Buffer.from('fake-image'), { filename: 'banner.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(401);
  });

  it('400 cuando no se adjunta ningún archivo', async () => {
    const res = await request(app)
      .post('/api/v1/users/me/banner')
      .set('Authorization', `Bearer ${validToken}`);

    expect(res.status).toBe(400);
  });

  it('400 cuando el tipo de archivo no está permitido', async () => {
    const res = await request(app)
      .post('/api/v1/users/me/banner')
      .set('Authorization', `Bearer ${validToken}`)
      .attach('banner', Buffer.from('fake-gif'), { filename: 'banner.gif', contentType: 'image/gif' });

    expect(res.status).toBe(400);
  });

  it('200 con banner URL cuando la subida es exitosa', async () => {
    mockUserService.uploadBanner.mockResolvedValue(updatedProfile);

    const res = await request(app)
      .post('/api/v1/users/me/banner')
      .set('Authorization', `Bearer ${validToken}`)
      .attach('banner', Buffer.from('fake-png'), { filename: 'banner.png', contentType: 'image/png' });

    expect(res.status).toBe(200);
    expect(res.body.banner).toBe(updatedProfile.banner);
  });

  it('propaga errores del servicio', async () => {
    mockUserService.uploadBanner.mockRejectedValue(
      new AppError('Error al subir banner', 'UPLOAD_ERROR', 500),
    );

    const res = await request(app)
      .post('/api/v1/users/me/banner')
      .set('Authorization', `Bearer ${validToken}`)
      .attach('banner', Buffer.from('fake-png'), { filename: 'banner.png', contentType: 'image/png' });

    expect(res.status).toBe(500);
    expect(res.body.code).toBe('UPLOAD_ERROR');
  });
});

// ─── GET /:username/games (F21) ───────────────────────────────────────────────

describe('GET /api/v1/users/:username/games', () => {
  const gamesResponse = {
    data: [{ id: 'g1', title: 'Portal', platform: 'STEAM', iconUrl: null, totalAchievements: 4, earnedAchievements: 2, completionPct: 50, lastSyncedAt: null, lastActivityAt: null, hasPlatinum: false, platinumEarned: false, isCompleted: false }],
    total: 1, page: 1, limit: 20, totalEarnedAchievements: 2, totalAvailableAchievements: 4, totalGames: 1, totalCompletedGames: 0,
  };

  it('200 devuelve la biblioteca pública del usuario', async () => {
    mockUserService.getUserGames.mockResolvedValue(gamesResponse as unknown as never);

    const res = await request(app).get('/api/v1/users/testuser/games');

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(mockUserService.getUserGames).toHaveBeenCalledWith('testuser', undefined, undefined, 1, 20);
  });

  it('200 pasa requestingUserId cuando hay token válido', async () => {
    mockUserService.getUserGames.mockResolvedValue({ ...gamesResponse, data: [] } as unknown as never);

    await request(app)
      .get('/api/v1/users/testuser/games')
      .set('Authorization', `Bearer ${validToken}`);

    expect(mockUserService.getUserGames).toHaveBeenCalledWith('testuser', 'user-1', undefined, 1, 20);
  });

  it('404 USER_NOT_FOUND si el perfil es PRIVATE', async () => {
    mockUserService.getUserGames.mockRejectedValue(new AppError('no encontrado', 'USER_NOT_FOUND', 404));

    const res = await request(app).get('/api/v1/users/secretuser/games');

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('USER_NOT_FOUND');
  });

  it('403 PROFILE_FRIENDS_ONLY si el perfil es FRIENDS_ONLY sin sesión', async () => {
    mockUserService.getUserGames.mockRejectedValue(new AppError('friends only', 'PROFILE_FRIENDS_ONLY', 403));

    const res = await request(app).get('/api/v1/users/friendsonly/games');

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('PROFILE_FRIENDS_ONLY');
  });
});

// ─── GET /:username/games/:gameId/achievements (F21) ─────────────────────────

describe('GET /api/v1/users/:username/games/:gameId/achievements', () => {
  const achievementsResponse = {
    game: { id: 'g1', title: 'Portal', iconUrl: null, platform: 'STEAM', totalAchievements: 2, earnedAchievements: 1, completionPct: 50 },
    achievements: [
      { id: 'ach-1', title: 'Logro A', description: null, iconUrl: null, rarity: 0.5, normalizedPoints: 50, platform: 'STEAM', externalId: 'A', externalUrl: null, isUnlocked: true, unlockedAt: '2024-01-01T00:00:00.000Z', isUnlockedByMe: null },
    ],
    earnedCount: 1,
    totalCount: 2,
  };

  it('200 devuelve achievements con isUnlocked del usuario visitado', async () => {
    mockUserService.getUserGameAchievements.mockResolvedValue(achievementsResponse as unknown as never);

    const res = await request(app).get('/api/v1/users/testuser/games/g1/achievements');

    expect(res.status).toBe(200);
    expect(res.body.game.title).toBe('Portal');
    expect(res.body.achievements[0].isUnlocked).toBe(true);
    expect(mockUserService.getUserGameAchievements).toHaveBeenCalledWith('testuser', 'g1', undefined);
  });

  it('200 pasa requestingUserId cuando hay token — habilita modo comparación', async () => {
    mockUserService.getUserGameAchievements.mockResolvedValue({ ...achievementsResponse, achievements: [{ ...achievementsResponse.achievements[0], isUnlockedByMe: false }] } as unknown as never);

    await request(app)
      .get('/api/v1/users/testuser/games/g1/achievements')
      .set('Authorization', `Bearer ${validToken}`);

    expect(mockUserService.getUserGameAchievements).toHaveBeenCalledWith('testuser', 'g1', 'user-1');
  });

  it('404 GAME_NOT_FOUND si el juego no existe', async () => {
    mockUserService.getUserGameAchievements.mockRejectedValue(new AppError('no encontrado', 'GAME_NOT_FOUND', 404));

    const res = await request(app).get('/api/v1/users/testuser/games/nope/achievements');

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('GAME_NOT_FOUND');
  });
});
