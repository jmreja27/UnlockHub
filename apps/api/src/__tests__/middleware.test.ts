import { ZodError } from 'zod';

import { AppError, errorHandler } from '../middleware/errorHandler';
import { authenticate } from '../middleware/authenticate';
import { adminAuth } from '../middleware/adminAuth';
import { signAccessToken } from '../lib/jwt';

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
  return res as any;
}

function mockReq(opts: { authorization?: string } = {}) {
  return { headers: { authorization: opts.authorization } } as any;
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

  it('adjunta user a req y llama a next sin errores con token válido', () => {
    const token = signAccessToken({ sub: 'user-1', email: 'a@b.com', isPremium: true });
    const req = mockReq({ authorization: `Bearer ${token}` });
    const res = mockRes();
    const next = jest.fn();

    authenticate(req, res, next);

    expect(next).toHaveBeenCalledWith();
    expect((req as any).user).toMatchObject({ id: 'user-1', email: 'a@b.com', isPremium: true });
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
    const req = { headers: {} } as any;
    const res = mockRes();

    adminAuth(req, res, next);

    expect(res.statusCode).toBe(503);
    expect(res.jsonBody).toMatchObject({ code: 'ADMIN_NOT_CONFIGURED' });
    expect(next).not.toHaveBeenCalled();
  });

  it('devuelve 401 si el header Authorization no coincide con el secret', () => {
    process.env['ADMIN_SECRET'] = 'supersecret';
    const req = { headers: { authorization: 'Bearer wrong-secret' } } as any;
    const res = mockRes();

    adminAuth(req, res, next);

    expect(res.statusCode).toBe(401);
    expect(res.jsonBody).toMatchObject({ code: 'UNAUTHORIZED' });
    expect(next).not.toHaveBeenCalled();
  });

  it('llama a next si el header Authorization es correcto', () => {
    process.env['ADMIN_SECRET'] = 'supersecret';
    const req = { headers: { authorization: 'Bearer supersecret' } } as any;
    const res = mockRes();

    adminAuth(req, res, next);

    expect(next).toHaveBeenCalledWith();
  });

  it('devuelve 401 si no hay header Authorization', () => {
    process.env['ADMIN_SECRET'] = 'supersecret';
    const req = { headers: {} } as any;
    const res = mockRes();

    adminAuth(req, res, next);

    expect(res.statusCode).toBe(401);
  });
});
