import http from 'http';

import { validateEnv } from './config/env';
import app from './app';
import { initSocketServer } from './lib/socket';
import { registerActivityHandler } from './sockets/activity.handler';
import { registerSyncHandler } from './sockets/sync.handler';
import { redis } from './lib/redis';
import { prisma } from './lib/prisma';
import { logger } from './lib/logger';

const env = validateEnv();

const server = http.createServer(app);
const io = initSocketServer(server);
registerActivityHandler(io);
registerSyncHandler(io);

server.listen(env.PORT, () => {
  logger.info({ port: env.PORT, env: env.NODE_ENV }, 'API arrancada');
});

process.on('SIGTERM', async () => {
  io.close();
  await prisma.$disconnect();
  await redis.quit();
  server.close(() => {
    logger.info('Servidor cerrado.');
    process.exit(0);
  });
});

export default server;
