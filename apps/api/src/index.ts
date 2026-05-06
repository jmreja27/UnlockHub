import { validateEnv } from './config/env';
import app from './app';
import { startSyncWorker } from './jobs/sync.worker';
import { restoreAutoSyncs } from './jobs/sync.scheduler';
import { streakWorker } from './jobs/streak.worker';
import { scheduleStreakJob } from './jobs/streak.scheduler';

const env = validateEnv();

const syncWorker = startSyncWorker();

const server = app.listen(env.PORT, async () => {
  console.warn(`API arrancada en el puerto ${env.PORT} (${env.NODE_ENV})`);
  if (env.NODE_ENV !== 'test') {
    await restoreAutoSyncs();
    await scheduleStreakJob();
  }
});

process.on('SIGTERM', async () => {
  await syncWorker.close();
  await streakWorker.close();
  server.close(() => {
    console.warn('Servidor cerrado.');
    process.exit(0);
  });
});

export default server;
