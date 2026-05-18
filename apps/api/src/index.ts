import http from 'http';

import { validateEnv } from './config/env';
import app from './app';
import { initSocketServer } from './lib/socket';
import { registerActivityHandler } from './sockets/activity.handler';
import { registerSyncHandler } from './sockets/sync.handler';
import { startSyncWorker } from './jobs/sync.worker';
import { restoreAutoSyncs } from './jobs/sync.scheduler';
import { startSeedCatalogWorker } from './jobs/seed-catalog.worker';
import { streakWorker } from './jobs/streak.worker';
import { scheduleStreakJob } from './jobs/streak.scheduler';
import { challengeWorker, scheduleChallengeEvaluation } from './jobs/challenge.scheduler';
import { scheduleBackgroundSyncJob } from './jobs/background-sync.scheduler';
import { scheduleShieldRecharge, shieldWorker } from './jobs/streak-shields.scheduler';
import { redis } from './lib/redis';
import { prisma } from './lib/prisma';
import { logger } from './lib/logger';

const env = validateEnv();

const syncWorker = startSyncWorker();
const seedCatalogWorker = startSeedCatalogWorker();

// Crear servidor HTTP explícito para compartirlo con Socket.io
const server = http.createServer(app);
const io = initSocketServer(server);
registerActivityHandler(io);
registerSyncHandler(io);

server.listen(env.PORT, async () => {
  logger.info({ port: env.PORT, env: env.NODE_ENV }, 'API arrancada');
  if (env.NODE_ENV !== 'test') {
    try { await restoreAutoSyncs(); } catch (e) { logger.error({ err: e }, 'restoreAutoSyncs falló (no fatal)'); }
    try { await scheduleStreakJob(); } catch (e) { logger.error({ err: e }, 'scheduleStreakJob falló (no fatal)'); }
    try { await scheduleChallengeEvaluation(); } catch (e) { logger.error({ err: e }, 'scheduleChallengeEvaluation falló (no fatal)'); }
    try { await scheduleBackgroundSyncJob(); } catch (e) { logger.error({ err: e }, 'scheduleBackgroundSyncJob falló (no fatal)'); }
    try { await scheduleShieldRecharge(); } catch (e) { logger.error({ err: e }, 'scheduleShieldRecharge falló (no fatal)'); }
  }
});

process.on('SIGTERM', async () => {
  await syncWorker.close();
  await seedCatalogWorker.close();
  await streakWorker.close();
  await challengeWorker.close();
  await shieldWorker.close();
  io.close();
  await prisma.$disconnect();
  await redis.quit();
  server.close(() => {
    logger.info('Servidor cerrado.');
    process.exit(0);
  });
});

export default server;
