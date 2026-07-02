/**
 * Limpieza de jobs BullMQ repeatables del esquema auto-sync antiguo (pre Opción E).
 *
 * El sistema previo registraba un repeatable job por cada par (usuario, plataforma)
 * con el patrón de jobId 'auto-sync:{userId}:{platform}'. La migración a Opción E
 * elimina esos repeatables y los reemplaza por el cron centralizado 'background-sync'.
 *
 * Este script es IDEMPOTENTE — ejecutarlo varias veces es seguro.
 *
 * USO (ejecutar desde apps/api/):
 *
 *   # Vista previa — lista los jobs sin borrar nada:
 *   cd apps/api && REDIS_URL="redis://..." \
 *     npx ts-node ../../scripts/cleanup-auto-sync-jobs.ts --dry-run
 *
 *   # Borrado real:
 *   cd apps/api && REDIS_URL="redis://..." \
 *     npx ts-node ../../scripts/cleanup-auto-sync-jobs.ts
 */

import { Queue } from 'bullmq';
import Redis from 'ioredis';

const QUEUE_NAME = 'sync';
const PREFIX = 'auto-sync:';

const isDryRun = process.argv.includes('--dry-run');

async function main() {
  const redisUrl = process.env['REDIS_URL'];
  if (!redisUrl) {
    console.error('ERROR: REDIS_URL no definida');
    process.exit(1);
  }

  const connection = new Redis(redisUrl, { maxRetriesPerRequest: null });
  const queue = new Queue(QUEUE_NAME, { connection });

  try {
    const repeatables = await queue.getRepeatableJobs();
    const targets = repeatables.filter((job) => job.key.includes(PREFIX));

    if (targets.length === 0) {
      console.log('✅ No hay jobs repeatables con prefijo "auto-sync:" — nada que limpiar.');
      return;
    }

    console.log(`Encontrados ${targets.length} jobs repeatables con prefijo "${PREFIX}":`);
    for (const job of targets) {
      console.log(`  - ${job.key} (cron: ${job.cron ?? 'n/a'}, every: ${job.every ?? 'n/a'})`);
    }

    if (isDryRun) {
      console.log('\n[DRY RUN] No se ha eliminado nada. Ejecuta sin --dry-run para borrar.');
      return;
    }

    let removed = 0;
    for (const job of targets) {
      await queue.removeRepeatableByKey(job.key);
      removed++;
      console.log(`  ✅ Eliminado: ${job.key}`);
    }
    console.log(`\n✅ ${removed}/${targets.length} jobs repeatables eliminados.`);
  } finally {
    await queue.close();
    await connection.quit();
  }
}

main().catch((err: unknown) => {
  console.error('Error inesperado:', err);
  process.exit(1);
});
