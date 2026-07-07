// Sentry debe inicializarse antes que cualquier otro módulo — igual que en apps/api/src/app.ts.
/* eslint-disable import/order */
import * as Sentry from '@sentry/node';
/* eslint-enable import/order */

Sentry.init({
  dsn: process.env['SENTRY_DSN'],
  environment: process.env['NODE_ENV'] ?? 'production',
  tracesSampleRate: 0.1,
  enabled: !!process.env['SENTRY_DSN'],
});

import { validateEnv } from '../../api/src/config/env';
import { startSyncWorker } from '../../api/src/jobs/sync.worker';
import { startSeedCatalogWorker } from '../../api/src/jobs/seed-catalog.worker';
import { streakWorker } from '../../api/src/jobs/streak.worker';
import { challengeWorker, scheduleChallengeEvaluation } from '../../api/src/jobs/challenge.scheduler';
import { shieldWorker, scheduleShieldRecharge } from '../../api/src/jobs/streak-shields.scheduler';
import { gdprCleanupWorker, scheduleGdprCleanupJob } from '../../api/src/jobs/gdpr-cleanup.scheduler';
import { scheduleStreakJob } from '../../api/src/jobs/streak.scheduler';
import { scheduleBackgroundSyncJob, startBackgroundSyncWorker } from '../../api/src/jobs/background-sync.scheduler';
import { redis } from '../../api/src/lib/redis';
import { prisma } from '../../api/src/lib/prisma';
import { logger } from '../../api/src/lib/logger';

validateEnv();

const syncWorker = startSyncWorker();
const seedCatalogWorker = startSeedCatalogWorker();
const backgroundSyncWorker = startBackgroundSyncWorker();

logger.info('Worker arrancado — esperando jobs BullMQ');

// Los schedulers registran cron jobs repetibles en Redis.
// Si el proceso reinicia, los schedulers los re-registran (limpian el anterior primero).
(async () => {
  try { await scheduleStreakJob(); } catch (e) { logger.error({ err: e }, 'scheduleStreakJob falló (no fatal)'); }
  try { await scheduleChallengeEvaluation(); } catch (e) { logger.error({ err: e }, 'scheduleChallengeEvaluation falló (no fatal)'); }
  try { await scheduleBackgroundSyncJob(); } catch (e) { logger.error({ err: e }, 'scheduleBackgroundSyncJob falló (no fatal)'); }
  try { await scheduleShieldRecharge(); } catch (e) { logger.error({ err: e }, 'scheduleShieldRecharge falló (no fatal)'); }
  try { await scheduleGdprCleanupJob(); } catch (e) { logger.error({ err: e }, 'scheduleGdprCleanupJob falló (no fatal)'); }
})();

process.on('SIGTERM', async () => {
  logger.info('Worker recibió SIGTERM — cerrando workers...');
  await Promise.allSettled([
    syncWorker.close(),
    seedCatalogWorker.close(),
    backgroundSyncWorker.close(),
    streakWorker.close(),
    challengeWorker.close(),
    shieldWorker.close(),
    gdprCleanupWorker.close(),
  ]);
  await prisma.$disconnect();
  await redis.quit();
  logger.info('Worker cerrado limpiamente.');
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('Worker recibió SIGINT — cerrando workers...');
  await Promise.allSettled([
    syncWorker.close(),
    seedCatalogWorker.close(),
    backgroundSyncWorker.close(),
    streakWorker.close(),
    challengeWorker.close(),
    shieldWorker.close(),
    gdprCleanupWorker.close(),
  ]);
  await prisma.$disconnect();
  await redis.quit();
  process.exit(0);
});
