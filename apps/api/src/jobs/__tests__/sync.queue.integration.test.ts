import { Queue, Worker } from 'bullmq';
import type { Job } from 'bullmq';
import Redis from 'ioredis';

import { syncBgJobOptions } from '../sync.queue';

/**
 * Tests de integración contra Redis real — NO mockean bullmq ni ../../lib/redis.
 * Verifican el comportamiento real de BullMQ que un mock de `syncQueue.add` no puede
 * reproducir (ver comentario histórico en src/__tests__/sync.service.test.ts): el bug de
 * auto-bloqueo de sync-bg-{userId} pasaba 100% de los tests en verde porque el mock
 * simplemente resolvía una promesa, sin aplicar ni `addStandardJob-9.lua` (no-op si el
 * jobId ya existe en Redis en cualquier estado) ni `moveToFinished-14.lua` (solo
 * removeOnComplete/removeOnFail === true borran la key atómicamente al completar).
 *
 * Usa la DB 1 de Redis (aislada de la DB 0 de desarrollo/producción) y un nombre de cola
 * dedicado para no interferir con `unlockhub-worker` si corriera en paralelo.
 */

const REDIS_URL = process.env['REDIS_URL'] ?? 'redis://localhost:6379';
const TEST_DB = 1;
const QUEUE_NAME = 'sync-integration-test';

function connectionOptions() {
  const url = new URL(REDIS_URL);
  return {
    host: url.hostname,
    port: url.port ? Number(url.port) : 6379,
    db: TEST_DB,
    maxRetriesPerRequest: null as null,
  };
}

function waitForCompleted(worker: Worker, jobId: string, timeoutMs = 15000): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      worker.off('completed', onCompleted);
      reject(new Error(`Timeout esperando 'completed' para jobId=${jobId}`));
    }, timeoutMs);

    function onCompleted(job: Job) {
      if (job.id === jobId) {
        clearTimeout(timer);
        worker.off('completed', onCompleted);
        resolve();
      }
    }

    worker.on('completed', onCompleted);
  });
}

describe('sync.queue — integración BullMQ contra Redis real', () => {
  let queue: Queue;
  let worker: Worker;
  let redis: Redis;
  let processedCount: Record<string, number>;

  beforeEach(async () => {
    processedCount = {};
    redis = new Redis(connectionOptions());
    queue = new Queue(QUEUE_NAME, { connection: connectionOptions() });
    worker = new Worker(
      QUEUE_NAME,
      async (job: Job) => {
        const jobId = job.id ?? '';
        processedCount[jobId] = (processedCount[jobId] ?? 0) + 1;
        return { ok: true };
      },
      { connection: connectionOptions() },
    );
    await worker.waitUntilReady();
  });

  afterEach(async () => {
    await queue.obliterate({ force: true }).catch(() => undefined);
    await worker.close();
    await queue.close();
    await redis.quit();
  });

  it(
    'un segundo job con el mismo jobId sync-bg-{userId} se procesa tras completar el primero ' +
      '(regresión del bug de auto-bloqueo — falla si removeOnComplete vuelve a {count:N})',
    async () => {
      const opts = syncBgJobOptions('integration-user-1');

      await queue.add('sync', {}, opts);
      await waitForCompleted(worker, opts.jobId);

      await queue.add('sync', {}, opts);
      await waitForCompleted(worker, opts.jobId);

      expect(processedCount[opts.jobId]).toBe(2);
    },
  );

  it('removeOnComplete:true borra la key bull:{queue}:{jobId} inmediatamente al completar', async () => {
    const opts = syncBgJobOptions('integration-user-2');

    await queue.add('sync', {}, opts);
    await waitForCompleted(worker, opts.jobId);

    const exists = await redis.exists(`bull:${QUEUE_NAME}:${opts.jobId}`);
    expect(exists).toBe(0);
  });
});
