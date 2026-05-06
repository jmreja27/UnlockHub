import {
  signAccessToken,
  verifyAccessToken,
  signRefreshToken,
  hashToken,
  getRefreshTokenExpiry,
} from '../lib/jwt';

beforeEach(() => {
  process.env['JWT_ACCESS_SECRET'] = 'test_secret_at_least_32_characters_long_x';
});

describe('signAccessToken / verifyAccessToken', () => {
  const payload = { sub: 'user-1', email: 'test@example.com', isPremium: false };

  it('el payload verificado coincide con el firmado', () => {
    const token = signAccessToken(payload);
    const decoded = verifyAccessToken(token);
    expect(decoded.sub).toBe('user-1');
    expect(decoded.email).toBe('test@example.com');
    expect(decoded.isPremium).toBe(false);
  });

  it('lanza error si se verifica con secreto distinto', () => {
    const token = signAccessToken(payload);
    process.env['JWT_ACCESS_SECRET'] = 'otro_secreto_completamente_distinto_xxxxx';
    expect(() => verifyAccessToken(token)).toThrow();
  });

  it('lanza error si el token está malformado', () => {
    expect(() => verifyAccessToken('no-es-un-jwt')).toThrow();
  });

  it('lanza error si JWT_ACCESS_SECRET no está configurado', () => {
    delete process.env['JWT_ACCESS_SECRET'];
    expect(() => signAccessToken(payload)).toThrow('JWT_ACCESS_SECRET');
    expect(() => verifyAccessToken('cualquier-token')).toThrow('JWT_ACCESS_SECRET');
  });
});

describe('signRefreshToken', () => {
  it('devuelve una cadena hex de 128 caracteres', () => {
    const token = signRefreshToken();
    expect(token).toHaveLength(128);
    expect(token).toMatch(/^[0-9a-f]+$/);
  });

  it('genera tokens distintos en cada llamada', () => {
    expect(signRefreshToken()).not.toBe(signRefreshToken());
  });
});

describe('hashToken', () => {
  it('produce el mismo hash para el mismo input', () => {
    expect(hashToken('mi-token')).toBe(hashToken('mi-token'));
  });

  it('produce hashes distintos para inputs distintos', () => {
    expect(hashToken('token-a')).not.toBe(hashToken('token-b'));
  });

  it('produce una cadena hex de 64 caracteres (SHA-256)', () => {
    expect(hashToken('test')).toHaveLength(64);
    expect(hashToken('test')).toMatch(/^[0-9a-f]+$/);
  });
});

describe('getRefreshTokenExpiry', () => {
  it('devuelve una fecha en el futuro (30 días)', () => {
    const expiry = getRefreshTokenExpiry();
    const now = new Date();
    const in29Days = new Date(now.getTime() + 29 * 24 * 60 * 60 * 1000);
    expect(expiry.getTime()).toBeGreaterThan(in29Days.getTime());
  });
});
