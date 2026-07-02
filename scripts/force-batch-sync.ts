/**
 * Encola un sync batch para un único usuario llamando al código real de producción.
 *
 * Usa runBackgroundSyncs(userId) del scheduler — misma lógica que el cron de las 03:00 UTC,
 * filtrada por userId. El jobId determinista sync-bg:{userId} garantiza deduplicación BullMQ.
 *
 * Requiere que el refactor de runBackgroundSyncs(userId?) esté desplegado en el worker.
 *
 * Ejecutar desde railway shell del worker:
 *   railway shell --service unlockhub-worker
 *   cd /app && npx tsx scripts/force-batch-sync.ts --user-id=<userId>
 */
import 'dotenv/config';
import { runBackgroundSyncs } from '../apps/api/src/jobs/background-sync.scheduler';

const userId = process.argv.find((a) => a.startsWith('--user-id='))?.split('=')[1] ?? '';

if (!userId) {
  console.error('[force-batch-sync] ❌ Falta --user-id=<userId>');
  console.error('  Ejemplo: npx tsx scripts/force-batch-sync.ts --user-id=cmpc71ybf0000egvsb0jm6wn6');
  process.exit(1);
}

console.log(`[force-batch-sync] Encolando sync para userId: ${userId}`);

runBackgroundSyncs(userId)
  .then(() => {
    console.log('[force-batch-sync] ✅ Job encolado. Monitoriza con:');
    console.log(`  railway logs --service unlockhub-worker 2>&1 | grep ${userId}`);
    process.exit(0);
  })
  .catch((err: unknown) => {
    console.error('[force-batch-sync] Error:', err);
    process.exit(1);
  });
