import { Queue } from 'bullmq';
import type { Platform } from '@unlockhub/types';

import { redis } from '../lib/redis';

export interface SyncJobData {
  userId: string;
  platformAccountId: string;
  platform: Platform;
  triggerType: 'manual' | 'auto' | 'initial';
  /** Número de intentos de adquirir el lock fallidos. Failsafe: se abandona al llegar a LOCK_MAX_RETRIES. */
  lockRetryCount?: number;
}

/** Job batch: procesa múltiples plataformas de un usuario en serie. */
export interface SyncBatchJobData {
  userId: string;
  platforms: { platform: Platform; platformAccountId: string }[];
  triggerType: 'auto' | 'initial' | 'manual';
}

export interface SyncJobResult {
  achievementsSynced: number;
  gamesUpdated: number;
  syncedAt: string;
}

export type AnySyncJobData = SyncJobData | SyncBatchJobData;

export const syncQueue = new Queue<AnySyncJobData, SyncJobResult>('sync', {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 50 },
  },
});
