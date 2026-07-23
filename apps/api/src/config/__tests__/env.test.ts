import { envSchema } from '../env';

const baseEnv = {
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
  REDIS_URL: 'redis://localhost:6379',
  JWT_ACCESS_SECRET: 'a'.repeat(32),
  JWT_REFRESH_SECRET: 'b'.repeat(32),
  ENCRYPTION_KEY: 'c'.repeat(64),
};

describe('envSchema — CLOUDINARY_URL', () => {
  it('acepta CLOUDINARY_URL="" (Railway variable no configurada) como undefined', () => {
    const result = envSchema.safeParse({ ...baseEnv, CLOUDINARY_URL: '' });
    expect(result.success).toBe(true);
  });

  it('sigue validando una URL de Cloudinary real', () => {
    const result = envSchema.safeParse({
      ...baseEnv,
      CLOUDINARY_URL: 'cloudinary://123456789:abcdef@my-cloud',
    });
    expect(result.success).toBe(true);
  });

  it('sigue rechazando un valor que no es una URL', () => {
    const result = envSchema.safeParse({ ...baseEnv, CLOUDINARY_URL: 'no-es-url' });
    expect(result.success).toBe(false);
  });
});
