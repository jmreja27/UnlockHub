import Redis from 'ioredis';

// Singleton para evitar múltiples conexiones en desarrollo con hot-reload
const globalForRedis = globalThis as unknown as { redis: Redis };

function createRedisClient() {
  const client = new Redis(process.env['REDIS_URL'] ?? 'redis://localhost:6379', {
    maxRetriesPerRequest: 3,
    lazyConnect: false,
  });
  client.on('error', (err: Error) => {
    console.error('[Redis] Error de conexión:', err.message);
  });
  return client;
}

export const redis = globalForRedis.redis ?? createRedisClient();

if (process.env['NODE_ENV'] !== 'production') {
  globalForRedis.redis = redis;
}
