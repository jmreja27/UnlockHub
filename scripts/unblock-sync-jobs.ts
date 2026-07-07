/**
 * Borra los jobs sync-bg-* atascados en 'completed'/'failed' que bloquean el jobId
 * determinista de cada usuario (bug T128: removeOnComplete/removeOnFail con {count:N}
 * nunca purgaba un jobId reutilizado — ver docs/BACKLOG.md T128).
 *
 * También limpia TODO lo que quede en 'failed' de la cola 'sync' (incluidos los 12
 * huérfanos legacy de T108/cmpxvovbm) — no hay razón para conservar fallos previos al
 * deploy de este fix; los futuros se autopurgan a los 5 min (removeOnFail:{age:300}).
 *
 * Idempotente — si no hay nada bloqueado, no hace nada.
 *
 * Ejecutar DESPUÉS de desplegar el fix (removeOnComplete:true / removeOnFail:{age:300}).
 * Si se ejecuta antes, el próximo trigger de cada usuario vuelve a dejar el job atascado.
 *
 * Uso (con bullmq — requiere que el import resuelva en el entorno de ejecución):
 *   railway shell --service unlockhub-worker
 *   cd /app && npx tsx scripts/unblock-sync-jobs.ts
 *
 * Si el import de bullmq no resuelve en el shell (Alpine/BusyBox, working dir distinto),
 * usar el comando `node -e` con ioredis directo — ver docs/SESSION_LOG.md o el bloque
 * equivalente más abajo en este mismo repo.
 */
import 'dotenv/config';
import { syncQueue } from '../apps/api/src/jobs/sync.queue';

async function main() {
  const completed = await syncQueue.getJobs(['completed'], 0, -1);
  const failed = await syncQueue.getJobs(['failed'], 0, -1);

  const blockingCompleted = completed.filter((j) => j.id?.startsWith('sync-bg-'));

  console.log(`[unblock-sync-jobs] completed sync-bg-* bloqueantes: ${blockingCompleted.length}`);
  console.log(`[unblock-sync-jobs] failed totales en cola 'sync' (se borran todos): ${failed.length}`);

  for (const job of blockingCompleted) {
    await job.remove();
    console.log(`[unblock-sync-jobs] eliminado completed ${job.id}`);
  }

  for (const job of failed) {
    await job.remove();
    console.log(`[unblock-sync-jobs] eliminado failed ${job.id}`);
  }

  console.log('[unblock-sync-jobs] hecho');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
