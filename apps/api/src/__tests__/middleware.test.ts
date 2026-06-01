import type { Request, Response } from 'express';
import { ZodError } from 'zod';

import { AppError, errorHandler } from '../middleware/errorHandler';
import { authenticate } from '../middleware/authenticate';
import { adminAuth } from '../middleware/adminAuth';
import { signAccessToken } from '../lib/jwt';

jest.mock('../lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
    },
  },
}));

import { prisma } from '../lib/prisma';
const mockPrismaMiddleware = prisma as jest.Mocked<typeof prisma>;

beforeEach(() => {
  process.env['JWT_ACCESS_SECRET'] = 'test_secret_at_least_32_characters_long_x';
});

// Mock mínimo de res de Express
function mockRes() {
  const res: Record<string, unknown> = {};
  res['statusCode'] = 200;
  res['status'] = jest.fn((code: number) => {
    res['statusCode'] = code;
    return res;
  });
  res['json'] = jest.fn().mockReturnValue(res);
  res['jsonBody'] = {};
  (res['json'] as jest.Mock).mockImplementation((body: unknown) => {
    res['jsonBody'] = body;
    return res;
  });
  return res as unknown as Response;
}

function mockReq(opts: { authorization?: string } = {}) {
  return { headers: { authorization: opts.authorization } } as unknown as Request;
}

// ─── AppError ─────────────────────────────────────────────────────────────────

describe('AppError', () => {
  it('es instancia de Error con las propiedades correctas', () => {
    const err = new AppError('Recurso no encontrado', 'NOT_FOUND', 404, { campo: 'id' });
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('AppError');
    expect(err.message).toBe('Recurso no encontrado');
    expect(err.code).toBe('NOT_FOUND');
    expect(err.statusCode).toBe(404);
    expect(err.details).toEqual({ campo: 'id' });
  });

  it('funciona sin details', () => {
    const err = new AppError('msg', 'CODE', 500);
    expect(err.details).toBeUndefined();
  });
});

// ─── errorHandler ─────────────────────────────────────────────────────────────

describe('errorHandler', () => {
  const next = jest.fn();

  it('devuelve 400 VALIDATION_ERROR para ZodError', () => {
    const req = mockReq();
    const res = mockRes();
    const err = new ZodError([
      { code: 'invalid_type', expected: 'string', received: 'number', path: ['email'], message: 'Required' },
    ]);

    errorHandler(err, req, res, next);

    expect(res.statusCode).toBe(400);
    expect(res.jsonBody).toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('devuelve el statusCode y code de AppError', () => {
    const req = mockReq();
    const res = mockRes();
    const err = new AppError('No encontrado', 'NOT_FOUND', 404);

    errorHandler(err, req, res, next);

    expect(res.statusCode).toBe(404);
    expect(res.jsonBody).toMatchObject({ error: 'No encontrado', code: 'NOT_FOUND' });
  });

  it('devuelve 500 INTERNAL_SERVER_ERROR para errores genéricos', () => {
    const req = mockReq();
    const res = mockRes();
    const err = new Error('Error inesperado');

    errorHandler(err, req, res, next);

    expect(res.statusCode).toBe(500);
    expect(res.jsonBody).toMatchObject({ code: 'INTERNAL_SERVER_ERROR' });
  });

  it('incluye details cuando AppError los tiene', () => {
    const req = mockReq();
    const res = mockRes();
    const err = new AppError('Cooldown', 'SYNC_COOLDOWN', 429, { remainingSeconds: 60 });

    errorHandler(err, req, res, next);

    expect(res.jsonBody).toMatchObject({ details: { remainingSeconds: 60 } });
  });
});

// ─── authenticate ─────────────────────────────────────────────────────────────

describe('authenticate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env['JWT_ACCESS_SECRET'] = 'test_secret_at_least_32_characters_long_x';
  });

  it('llama a next con AppError UNAUTHORIZED si no hay header Authorization', () => {
    const req = mockReq({});
    const res = mockRes();
    const next = jest.fn();

    authenticate(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ code: 'UNAUTHORIZED' }));
  });

  it('llama a next con AppError INVALID_TOKEN si el token es inválido', () => {
    const req = mockReq({ authorization: 'Bearer token-invalido' });
    const res = mockRes();
    const next = jest.fn();

    authenticate(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ code: 'INVALID_TOKEN' }));
  });

  it('adjunta user a req y llama a next sin errores con token válido', async () => {
    const token = signAccessToken({ sub: 'user-1', email: 'a@b.com', isPremium: true });
    const req = mockReq({ authorization: `Bearer ${token}` });
    const res = mockRes();
    const next = jest.fn();

    (mockPrismaMiddleware.user.findUnique as jest.Mock).mockResolvedValue({ id: 'user-1' });

    authenticate(req, res, next);
    await Promise.resolve(); // flush microtasks de la Promise de prisma

    expect(next).toHaveBeenCalledWith();
    expect((req as unknown as Record<string, unknown>).user).toMatchObject({ id: 'user-1', email: 'a@b.com', isPremium: true });
  });

  it('GDPR: rechaza tokens de usuarios con soft delete (deletedAt !== null)', async () => {
    const token = signAccessToken({ sub: 'deleted-user', email: 'del@b.com', isPremium: false });
    const req = mockReq({ authorization: `Bearer ${token}` });
    const res = mockRes();
    const next = jest.fn();

    // La BD devuelve null porque deletedAt: null filtra el usuario eliminado
    (mockPrismaMiddleware.user.findUnique as jest.Mock).mockResolvedValue(null);

    authenticate(req, res, next);
    await Promise.resolve();

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ code: 'ACCOUNT_DELETED' }));
  });

  it('continúa sin bloquear si la BD lanza error transitorio', async () => {
    const token = signAccessToken({ sub: 'user-2', email: 'b@b.com', isPremium: false });
    const req = mockReq({ authorization: `Bearer ${token}` });
    const res = mockRes();
    const next = jest.fn();

    (mockPrismaMiddleware.user.findUnique as jest.Mock).mockRejectedValue(new Error('DB timeout'));

    authenticate(req, res, next);
    // La propagación de rechazo por .then().catch() requiere dos rondas de microtasks:
    // 1ª ronda: rechazo de findUnique atraviesa .then() → p2 rechazada
    // 2ª ronda: p2 rechazada dispara .catch() → next() llamado
    await Promise.resolve();
    await Promise.resolve();

    // Ante error de BD, la request no se bloquea (fail-open: seguridad vs disponibilidad)
    expect(next).toHaveBeenCalledWith();
  });
});

// ─── adminAuth ────────────────────────────────────────────────────────────────

describe('adminAuth', () => {
  const next = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env['ADMIN_SECRET'];
  });

  it('devuelve 503 si ADMIN_SECRET no está configurado', () => {
    const req = { headers: {} } as unknown as Request;
    const res = mockRes();

    adminAuth(req, res, next);

    expect(res.statusCode).toBe(503);
    expect(res.jsonBody).toMatchObject({ code: 'ADMIN_NOT_CONFIGURED' });
    expect(next).not.toHaveBeenCalled();
  });

  it('devuelve 401 si el header Authorization no coincide con el secret', () => {
    process.env['ADMIN_SECRET'] = 'supersecret';
    const req = { headers: { authorization: 'Bearer wrong-secret' } } as unknown as Request;
    const res = mockRes();

    adminAuth(req, res, next);

    expect(res.statusCode).toBe(401);
    expect(res.jsonBody).toMatchObject({ code: 'UNAUTHORIZED' });
    expect(next).not.toHaveBeenCalled();
  });

  it('llama a next si el header Authorization es correcto', () => {
    process.env['ADMIN_SECRET'] = 'supersecret';
    const req = { headers: { authorization: 'Bearer supersecret' } } as unknown as Request;
    const res = mockRes();

    adminAuth(req, res, next);

    expect(next).toHaveBeenCalledWith();
  });

  it('devuelve 401 si no hay header Authorization', () => {
    process.env['ADMIN_SECRET'] = 'supersecret';
    const req = { headers: {} } as unknown as Request;
    const res = mockRes();

    adminAuth(req, res, next);

    expect(res.statusCode).toBe(401);
  });
});
