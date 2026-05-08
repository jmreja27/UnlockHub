import http from 'http';
import { validateEnv } from './config/env';
import app from './app';
import { initSocketServer } from './lib/socket';
import { registerActivityHandler } from './sockets/activity.handler';
import { startSyncWorker } from './jobs/sync.worker';
import { restoreAutoSyncs } from './jobs/sync.scheduler';
import { streakWorker } from './jobs/streak.worker';
import { scheduleStreakJob } from './jobs/streak.scheduler';
import { challengeWorker, scheduleChallengeEvaluation } from './jobs/challenge.scheduler';
import { redis } from './lib/redis';
import { prisma } from './lib/prisma';

const env = validateEnv();

const syncWorker = startSyncWorker();

// Crear servidor HTTP explícito para compartirlo con Socket.io
const server = http.createServer(app);
const io = initSocketServer(server);
registerActivityHandler(io);

server.listen(env.PORT, async () => {
  console.log(`API arrancada en el puerto ${env.PORT} (${env.NODE_ENV})`);
  if (env.NODE_ENV !== 'test') {
    await restoreAutoSyncs();
    await scheduleStreakJob();
    await scheduleChallengeEvaluation();
  }
});

process.on('SIGTERM', async () => {
  await syncWorker.close();
  await streakWorker.close();
  await challengeWorker.close();
  io.close();
  await prisma.$disconnect();
  await redis.quit();
  server.close(() => {
    console.log('Servidor cerrado.');
    process.exit(0);
  });
});

export default server;
