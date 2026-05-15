import Redis from 'ioredis';
import { logger } from './logger';

const REDIS_URL = process.env['REDIS_URL'] ?? 'redis://localhost:6379';

// Singleton para evitar múltiples conexiones en desarrollo con hot-reload
const globalForRedis = globalThis as unknown as { redis: Redis };

function createRedisClient() {
  const client = new Redis(REDIS_URL, {
    maxRetriesPerRequest: 3,
    lazyConnect: false,
  });
  client.on('error', (err: Error) => {
    logger.error({ err: err.message }, '[Redis] Error de conexión');
  });
  return client;
}

export const redis = globalForRedis.redis ?? createRedisClient();

if (process.env['NODE_ENV'] !== 'production') {
  globalForRedis.redis = redis;
}

// BullMQ Workers requieren maxRetriesPerRequest: null (usan comandos bloqueantes)
export function createWorkerConnection(): Redis {
  const client = new Redis(REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });
  client.on('error', (err: Error) => {
    logger.error({ err: err.message }, '[Redis Worker] Error de conexión');
  });
  return client;
}
