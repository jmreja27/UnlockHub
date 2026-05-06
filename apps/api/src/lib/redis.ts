import Redis from 'ioredis';

// Singleton para evitar múltiples conexiones en desarrollo con hot-reload
const globalForRedis = globalThis as unknown as { redis: Redis };

export const redis =
  globalForRedis.redis ??
  new Redis(process.env['REDIS_URL'] ?? 'redis://localhost:6379', {
    // Reintentar 3 veces con backoff exponencial antes de lanzar error
    maxRetriesPerRequest: 3,
    lazyConnect: false,
  });

if (process.env['NODE_ENV'] !== 'production') {
  globalForRedis.redis = redis;
}
