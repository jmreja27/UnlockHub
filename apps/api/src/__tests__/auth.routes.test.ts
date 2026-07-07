// Tests de integración HTTP para /api/v1/auth/*
// Mockea los servicios para aislar la capa de controlador+rutas

jest.mock('../services/auth.service');
jest.mock('../services/user.service');
jest.mock('../lib/redis', () => ({ redis: { on: jest.fn() } }));
jest.mock('../middleware/rateLimiter', () => ({
  globalRateLimiter: (_req: unknown, _res: unknown, next: () => void) => next(),
  authRateLimiter: (_req: unknown, _res: unknown, next: () => void) => next(),
}));
jest.mock('../lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: jest.fn().mockResolvedValue({ id: 'user-1' }),
    },
  },
}));

import request from 'supertest';

import * as authService from '../services/auth.service';
import * as userService from '../services/user.service';
import app from '../app';
import { signAccessToken } from '../lib/jwt';
import { prisma } from '../lib/prisma';

const mockAuthService = authService as jest.Mocked<typeof authService>;
const mockUserService = userService as jest.Mocked<typeof userService>;
const mockUserFindUnique = prisma.user.findUnique as jest.Mock;

const baseUser = {
  id: 'user-1',
  username: 'testuser',
  email: 'test@example.com',
  isPremium: false,
  level: 1,
  xp: 0,
  createdAt: new Date().toISOString(),
};

beforeEach(() => {
  jest.clearAllMocks();
  process.env['JWT_ACCESS_SECRET'] = 'test_secret_at_least_32_characters_long_x';
  process.env['JWT_REFRESH_SECRET'] = 'test_refresh_secret_at_least_32_chars_xx';
  process.env['ENCRYPTION_KEY'] = '0'.repeat(64);
  // Por defecto el usuario existe en BD (no está eliminado)
  mockUserFindUnique.mockResolvedValue({ id: 'user-1' });
});

// ─── POST /register ───────────────────────────────────────────────────────────

describe('POST /api/v1/auth/register', () => {
  it('201 con accessToken y refreshToken en body cuando los datos son válidos', async () => {
    mockAuthService.register.mockResolvedValue({
      user: baseUser as unknown as never,
      accessToken: 'access-tok',
      refreshToken: 'refresh-tok',
    });

    const res = await request(app).post('/api/v1/auth/register').send({
      username: 'testuser',
      email: 'test@example.com',
      password: 'Password1!',
      birthDate: '1995-06-15',
    });

    expect(res.status).toBe(201);
    expect(res.body.accessToken).toBe('access-tok');
    expect(res.body.refreshToken).toBe('refresh-tok');
    expect(res.body.user).toMatchObject({ id: 'user-1', username: 'testuser' });
  });

  it('400 VALIDATION_ERROR con body inválido', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ username: '', email: 'no-es-email', password: '123' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(mockAuthService.register).not.toHaveBeenCalled();
  });

  it('409 EMAIL_TAKEN si el servicio lanza ese error', async () => {
    const { AppError } = await import('../middleware/errorHandler');
    mockAuthService.register.mockRejectedValue(new AppError('Email ya en uso', 'EMAIL_TAKEN', 409));

    const res = await request(app).post('/api/v1/auth/register').send({
      username: 'nuevo',
      email: 'existe@example.com',
      password: 'Password1!',
      birthDate: '1995-06-15',
    });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('EMAIL_TAKEN');
  });
});

// ─── POST /login ──────────────────────────────────────────────────────────────

describe('POST /api/v1/auth/login', () => {
  it('200 con accessToken y refreshToken en body cuando las credenciales son válidas', async () => {
    mockAuthService.login.mockResolvedValue({
      user: baseUser as unknown as never,
      accessToken: 'access-tok',
      refreshToken: 'refresh-tok',
    });

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'test@example.com', password: 'Password1!' });

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBe('access-tok');
    expect(res.body.refreshToken).toBe('refresh-tok');
    expect(res.body.user).toMatchObject({ id: 'user-1' });
  });

  it('400 con body vacío', async () => {
    const res = await request(app).post('/api/v1/auth/login').send({});
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('401 INVALID_CREDENTIALS si el servicio lo indica', async () => {
    const { AppError } = await import('../middleware/errorHandler');
    mockAuthService.login.mockRejectedValue(
      new AppError('Credenciales inválidas', 'INVALID_CREDENTIALS', 401),
    );

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'x@x.com', password: 'Wrong1234!' });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('INVALID_CREDENTIALS');
  });
});

// ─── POST /refresh ────────────────────────────────────────────────────────────

describe('POST /api/v1/auth/refresh', () => {
  it('401 si no se envía refreshToken en body', async () => {
    const res = await request(app).post('/api/v1/auth/refresh').send({});
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('MISSING_REFRESH_TOKEN');
  });

  it('200 con nuevos tokens cuando el refresh token es válido', async () => {
    mockAuthService.refresh.mockResolvedValue({
      accessToken: 'nuevo-access',
      refreshToken: 'nuevo-refresh',
    });

    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: 'valid-raw-token' });

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBe('nuevo-access');
    expect(res.body.refreshToken).toBe('nuevo-refresh');
  });
});

// ─── POST /logout ─────────────────────────────────────────────────────────────

describe('POST /api/v1/auth/logout', () => {
  it('200 cuando se envía refreshToken en body', async () => {
    mockAuthService.logout.mockResolvedValue(undefined);

    const res = await request(app)
      .post('/api/v1/auth/logout')
      .send({ refreshToken: 'tok' });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(mockAuthService.logout).toHaveBeenCalledWith('tok');
  });

  it('200 aunque no se envíe refreshToken', async () => {
    const res = await request(app).post('/api/v1/auth/logout').send({});
    expect(res.status).toBe(200);
    expect(mockAuthService.logout).not.toHaveBeenCalled();
  });
});

// ─── GET /me ──────────────────────────────────────────────────────────────────

describe('GET /api/v1/auth/me', () => {
  it('401 sin token de acceso', async () => {
    const res = await request(app).get('/api/v1/auth/me');
    expect(res.status).toBe(401);
  });

  it('200 con el perfil completo cuando el token es válido en Authorization header', async () => {
    mockUserService.getProfile.mockResolvedValue({
      id: 'user-1',
      username: 'testuser',
      email: 'test@example.com',
      isPremium: false,
      level: 1,
      xp: 0,
      streakDays: 0,
      streakShields: 0,
      countryCode: null,
      avatar: null,
      banner: null,
      bio: null,
      premiumUntil: null,
      lastSyncAt: null,
      profileVisibility: 'PUBLIC',
      createdAt: new Date().toISOString(),
      platformAccounts: [],
    } as never);

    const token = signAccessToken({ sub: 'user-1', email: 'test@example.com', isPremium: false });

    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: 'user-1', email: 'test@example.com', platformAccounts: [] });
  });
});

// ─── Soft delete — T50 ───────────────────────────────────────────────────────
// Verifica que un usuario con soft delete no puede refrescar sesión ni acceder
// a endpoints protegidos. El fix de sesión 53 revoca todos los RefreshTokens
// en deleteAccount, por lo que findValidRefreshToken devuelve null.

describe('autenticación con usuario eliminado (soft delete)', () => {
  it('POST /refresh 401 cuando el refresh token fue revocado por deleteAccount', async () => {
    const { AppError } = await import('../middleware/errorHandler');
    // deleteAccount revocó todos los tokens (revokedAt seteado) →
    // findValidRefreshToken devuelve null → authService.refresh lanza 401
    mockAuthService.refresh.mockRejectedValue(
      new AppError('Refresh token inválido o expirado', 'INVALID_REFRESH_TOKEN', 401),
    );

    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: 'token-revocado-por-soft-delete' });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('INVALID_REFRESH_TOKEN');
  });

  it('GET /me 401 cuando el access token pertenece a un usuario con soft delete', async () => {
    // El middleware authenticate llama prisma.user.findUnique({ where: { id, deletedAt: null } })
    // Para un usuario soft-deleted, deletedAt != null → findUnique devuelve null → 401
    const token = signAccessToken({ sub: 'deleted-user-1', email: 'borrado@example.com', isPremium: false });
    mockUserFindUnique.mockResolvedValueOnce(null);

    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('ACCOUNT_DELETED');
  });
});

// ─── GET /reset-redirect — T115 ───────────────────────────────────────────────
// Página intermedia https:// que dispara el deep link unlockhub://reset-password?token=...
// No requiere auth (público, de un solo uso vía el token) ni toca authService.resetPassword.

describe('GET /api/v1/auth/reset-redirect', () => {
  const validToken = 'a'.repeat(64); // crypto.randomBytes(32).toString('hex') → 64 hex chars

  it('200 con HTML que embebe el deep link unlockhub:// cuando el token es hex válido', async () => {
    const res = await request(app).get(`/api/v1/auth/reset-redirect?token=${validToken}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.text).toContain(`unlockhub://reset-password?token=${validToken}`);
  });

  it('400 y no refleja el token cuando no es hexadecimal (rechaza intento de inyección)', async () => {
    const malicious = '<script>alert(1)</script>';
    const res = await request(app)
      .get('/api/v1/auth/reset-redirect')
      .query({ token: malicious });

    expect(res.status).toBe(400);
    expect(res.text).not.toContain('<script>alert(1)</script>');
    expect(res.text).not.toContain('unlockhub://');
  });

  it('400 cuando falta el token', async () => {
    const res = await request(app).get('/api/v1/auth/reset-redirect');
    expect(res.status).toBe(400);
  });

  it('no llama a authService.resetPassword — solo sirve HTML, no valida el token contra la BD', async () => {
    await request(app).get(`/api/v1/auth/reset-redirect?token=${validToken}`);
    expect(mockAuthService.resetPassword).not.toHaveBeenCalled();
  });
});
