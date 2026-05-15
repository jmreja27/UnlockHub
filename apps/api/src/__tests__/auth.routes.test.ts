// Tests de integración HTTP para /api/v1/auth/*
// Mockea los servicios para aislar la capa de controlador+rutas

jest.mock('../services/auth.service');
jest.mock('../lib/redis', () => ({ redis: { on: jest.fn() } }));
jest.mock('../middleware/rateLimiter', () => ({
  globalRateLimiter: (_req: unknown, _res: unknown, next: () => void) => next(),
  authRateLimiter: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

import request from 'supertest';
import * as authService from '../services/auth.service';
import app from '../app';
import { signAccessToken } from '../lib/jwt';

const mockAuthService = authService as jest.Mocked<typeof authService>;

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
});

// ─── POST /register ───────────────────────────────────────────────────────────

describe('POST /api/v1/auth/register', () => {
  it('201 con accessToken y refreshToken en body cuando los datos son válidos', async () => {
    mockAuthService.register.mockResolvedValue({
      user: baseUser as any,
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
      user: baseUser as any,
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

  it('200 con el payload del usuario cuando el token es válido en Authorization header', async () => {
    const token = signAccessToken({ sub: 'user-1', email: 'test@example.com', isPremium: false });

    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: 'user-1', email: 'test@example.com' });
  });
});
