import { Queue } from 'bullmq';
import type { Job } from 'bullmq';
import type { Platform } from '@unlockhub/types';

import { redis } from '../lib/redis';
import { logger } from '../lib/logger';

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

function isBatchJobData(data: AnySyncJobData): data is SyncBatchJobData {
  return 'platforms' in data;
}

/**
 * Encola el batch convergente `sync-bg-{userId}` o, si ya hay uno en WAITING, fusiona las
 * plataformas nuevas en su payload en lugar de perderlas (T141).
 *
 * Bug que cierra: `.add()` con un jobId que ya existe en Redis (en cualquier estado) es un
 * no-op sobre `data` — BullMQ no reemplaza el payload del job ya encolado. Antes de este
 * helper, los 4 call-sites (`triggerManualSync`, `queueInitialSync`, `triggerAppOpenSync`,
 * `runBackgroundSyncs`) llamaban `.add()` directo: si el cron encolaba `[PSN]` (Steam omitido
 * por cuota, A41) y el usuario abría la app antes de que el worker recogiera ese job, el
 * app-open sync calculaba `[PSN, STEAM]` pero el `.add()` no hacía nada — Steam se perdía
 * silenciosamente hasta el siguiente ciclo. Ver TEST B en
 * `src/__tests__/sync.service.lifecycle.integration.test.ts` (T129/TESTS-3) para el
 * comportamiento real de BullMQ que expuso el bug.
 *
 * Decisión de diseño (JS, no Lua): BullMQ determina el estado 'waiting' por la pertenencia del
 * jobId a listas internas (`bull:{queue}:wait` / `:paused`) que no expone como primitiva para
 * componer en un script Lua propio — replicar ese chequeo a mano acopla este código a los
 * nombres de key y a la semántica de estados de BullMQ, exactamente el tipo de dependencia de
 * internals que se rompe en un upgrade de librería. Se usa en su lugar `getJob` + `getState()`
 * + `updateData()` (API pública y estable de BullMQ).
 *
 * Race residual aceptada: existe una ventana TOCTOU entre `getState()` y `updateData()` en la
 * que (a) otro enqueuer podría llamar a esta función concurrentemente (lost update — A lee
 * {X}, B lee {X}, A escribe {X,Y}, B escribe {X,Z}, Y se pierde; sin lock distribuido) o (b) el
 * worker podría recoger el job justo en ese instante (mover de WAITING a ACTIVE, incoming data
 * descartada). Se acepta sin cerrarla — NO porque la ventana sea rara, sino porque un merge
 * perdido es auto-sanable en los 4 call-sites actuales (`triggerManualSync`,
 * `triggerAppOpenSync`, `runBackgroundSyncs`, `queueInitialSync`): ninguno envía un delta
 * incremental — los 4 recalculan y reenvían el conjunto COMPLETO de plataformas vinculadas del
 * usuario en cada invocación, así que una plataforma descartada de ESTE batch concreto sigue
 * teniendo su `PlatformAccount` en BD y queda incluida automáticamente en el próximo trigger de
 * cualquiera de los 4 — sin intervención manual. Cota real por call-site: `triggerManualSync`/
 * `triggerAppOpenSync`, minutos (su propio cooldown, 15-60 min); `runBackgroundSyncs`, ≤24h
 * (cron nocturno). `queueInitialSync` no tiene cooldown propio (se llama una vez al vincular),
 * pero NO es un callejón sin salida: se auto-sana vía el siguiente `triggerAppOpenSync`, que no
 * depende de `User.lastSyncAt` (usa su propia clave Redis `sync:appopen:{userId}`) y por tanto
 * no queda enmascarado aunque otras plataformas del usuario sigan sincronizando y refresquen
 * `User.lastSyncAt` (ver `sync.worker.ts` — cada plataforma sincronizada actualiza
 * `User.lastSyncAt`, lo que sí podría enmascarar la plataforma perdida frente al cron si ese
 * fuera el único mecanismo de recuperación). Cerrar esta ventana del todo exigiría un lock
 * distribuido o un script Lua que reimplemente internals de BullMQ — no justificado por una
 * ventana de milisegundos que ya se recupera sola. Ver T140 para extraer el processor de
 * `sync.worker.ts` si en el futuro se decide coordinarlo con un lock compartido.
 */
export async function enqueueOrMergeSyncBatch(
  userId: string,
  platforms: SyncBatchJobData['platforms'],
  triggerType: SyncBatchJobData['triggerType'],
): Promise<Job<AnySyncJobData, SyncJobResult>> {
  const jobId = `sync-bg-${userId}`;
  const existing = await syncQueue.getJob(jobId);

  if (!existing) {
    return syncQueue.add(jobId, { userId, platforms, triggerType }, syncBgJobOptions(userId));
  }

  const state = await existing.getState();
  if (state !== 'waiting' || !isBatchJobData(existing.data)) {
    // Job ya activo/completado/fallido (o, por defensividad, con forma inesperada de datos):
    // no se puede fusionar sin tocar el worker (T140) — no-op, riesgo residual documentado arriba.
    logger.info(
      { userId, state, incomingPlatforms: platforms.map((p) => p.platform) },
      '[SyncQueue] enqueueOrMergeSyncBatch — job existente no está en WAITING, no-op',
    );
    return existing;
  }

  const merged = new Map(existing.data.platforms.map((p) => [p.platform, p]));
  for (const p of platforms) {
    merged.set(p.platform, p);
  }

  const mergedData: SyncBatchJobData = {
    userId,
    platforms: Array.from(merged.values()),
    triggerType,
  };
  await (existing as Job<SyncBatchJobData, SyncJobResult>).updateData(mergedData);

  return existing;
}
