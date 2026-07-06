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

/**
 * Opts del job batch convergente `sync-bg-{userId}` — usado por runBackgroundSyncs,
 * triggerManualSync, queueInitialSync y triggerAppOpenSync. Centralizado para que los 4
 * sitios no puedan divergir.
 *
 * removeOnComplete: true — borrado atómico e inmediato al completar (mismo script Lua que
 * la transición a 'completed'). Con jobId determinista reutilizado, `{ count: N }` NUNCA
 * purga: solo existe 1 entrada por usuario, así que "conservar las N más recientes" no
 * dispara jamás y el job completado bloquea indefinidamente los siguientes syncs de ese
 * usuario (bug crítico de producción — ver docs/SESSION_LOG.md). El lock de aplicación
 * sync:user-lock:{userId} (en sync.worker.ts) sigue cubriendo la exclusión de simultáneos
 * mientras el job está activo — esto no lo toca.
 * removeOnFail: { age: 300 } — conserva el fallo ~5 min para inspección en el dashboard de
 * BullMQ sin bloquear al usuario más allá de eso tras un fallo definitivo.
 */
export function syncBgJobOptions(userId: string) {
  return {
    jobId: `sync-bg-${userId}`,
    removeOnComplete: true as const,
    removeOnFail: { age: 300 },
  };
}

export const syncQueue = new Queue<AnySyncJobData, SyncJobResult>('sync', {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 50 },
  },
});
