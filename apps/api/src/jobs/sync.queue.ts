import { Queue } from 'bullmq';
import type { Platform } from '@unlockhub/types';

import { redis } from '../lib/redis';

export interface SyncJobData {
  userId: string;
  platformAccountId: string;
  platform: Platform;
  triggerType: 'manual' | 'auto' | 'initial';
}

export interface SyncJobResult {
  achievementsSynced: number;
  gamesUpdated: number;
  syncedAt: string;
}

export const syncQueue = new Queue<SyncJobData, SyncJobResult>('sync', {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 50 },
  },
});
