import { Worker } from 'bullmq';
import type { Job } from 'bullmq';
import type Redis from 'ioredis';

import { redis, createWorkerConnection } from '../../lib/redis';
import { syncQueue, enqueueOrMergeSyncBatch } from '../sync.queue';
import type { SyncBatchJobData } from '../sync.queue';

/**
 * Tests de integración contra Redis/BullMQ real (T141) — usan la cola de producción `syncQueue`
 * (nombre 'sync'), igual que `sync.service.lifecycle.integration.test.ts` (TESTS-3), porque el
 * bug que se cierra aquí es específico del comportamiento real de `.add()` con jobId
 * determinista reutilizado (`addStandardJob-9.lua`: no-op sobre `data` si el jobId ya existe en
 * cualquier estado) — un mock de `syncQueue.add` que siempre resuelve nunca lo habría detectado
 * (ver TEST B en sync.service.lifecycle.integration.test.ts, que documenta el bug sin workers).
 *
 * Escenario real único que motiva el fix (documentado en CLAUDE.md / BACKLOG T141): el cron
 * nocturno omite Steam por cuota (A41) y encola solo `[PSN]`; antes de que el worker recoja ese
 * job, el usuario abre la app y `triggerAppOpenSync` calcula `[PSN, STEAM]` — con `.add()`
 * directo, Steam se pierde silenciosamente porque BullMQ no pisa el payload de un job que ya
 * existe. `enqueueOrMergeSyncBatch` cierra ese hueco fusionando plataformas cuando el job
 * existente sigue en WAITING.
 */

function waitForActive(worker: Worker, jobId: string, timeoutMs = 15000): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      worker.off('active', onActive);
      reject(new Error(`Timeout esperando 'active' para jobId=${jobId}`));
    }, timeoutMs);

    function onActive(job: Job) {
      if (job.id === jobId) {
        clearTimeout(timer);
        worker.off('active', onActive);
        resolve();
      }
    }

    worker.on('active', onActive);
  });
}

describe('enqueueOrMergeSyncBatch — integración BullMQ contra Redis real (T141)', () => {
  afterAll(async () => {
    await syncQueue.close();
    await redis.quit();
  });

  describe('merge en WAITING — escenario real (cron omite Steam por cuota, app-open lo añade)', () => {
    const userId = 't141-merge-scenario-user';
    const jobId = `sync-bg-${userId}`;

    afterEach(async () => {
      const job = await syncQueue.getJob(jobId);
      await job?.remove();
    });

    it(
      'fusiona las plataformas del 2º enqueue en el job WAITING existente en lugar de ' +
        'descartarlas — este test FALLA si enqueueOrMergeSyncBatch se sustituye por un .add() ' +
        'directo (documenta el fix del bug de convergencia)',
      async () => {
        // Cron nocturno: Steam omitido por cuota (A41) → solo PSN.
        const first = await enqueueOrMergeSyncBatch(
          userId,
          [{ platform: 'PSN', platformAccountId: 'acc-psn' }],
          'auto',
        );
        expect(await first.getState()).toBe('waiting');

        // App-open: el usuario tiene PSN + STEAM vinculados, llega antes de que el worker recoja el job.
        const second = await enqueueOrMergeSyncBatch(
          userId,
          [
            { platform: 'PSN', platformAccountId: 'acc-psn' },
            { platform: 'STEAM', platformAccountId: 'acc-steam' },
          ],
          'auto',
        );

        expect(second.id).toBe(jobId);

        const persisted = await syncQueue.getJob(jobId);
        const data = persisted?.data as SyncBatchJobData;
        expect(data.platforms).toEqual(
          expect.arrayContaining([
            { platform: 'PSN', platformAccountId: 'acc-psn' },
            { platform: 'STEAM', platformAccountId: 'acc-steam' },
          ]),
        );
        expect(data.platforms).toHaveLength(2);
      },
    );
  });

  describe('merge sin duplicar plataformas', () => {
    const userId = 't141-dedupe-user';
    const jobId = `sync-bg-${userId}`;

    afterEach(async () => {
      const job = await syncQueue.getJob(jobId);
      await job?.remove();
    });

    it('[PSN] + [PSN, STEAM] → [PSN, STEAM], no [PSN, PSN, STEAM]', async () => {
      await enqueueOrMergeSyncBatch(userId, [{ platform: 'PSN', platformAccountId: 'acc-psn' }], 'auto');
      await enqueueOrMergeSyncBatch(
        userId,
        [
          { platform: 'PSN', platformAccountId: 'acc-psn' },
          { platform: 'STEAM', platformAccountId: 'acc-steam' },
        ],
        'manual',
      );

      const persisted = await syncQueue.getJob(jobId);
      const data = persisted?.data as SyncBatchJobData;
      const psnCount = data.platforms.filter((p) => p.platform === 'PSN').length;

      expect(psnCount).toBe(1);
      expect(data.platforms).toHaveLength(2);
    });
  });

  describe('sin duplicados de job (la dedup nativa de BullMQ sigue intacta — no reintroduce T101)', () => {
    const userId = 't141-no-dup-job-user';
    const jobId = `sync-bg-${userId}`;

    afterEach(async () => {
      const job = await syncQueue.getJob(jobId);
      await job?.remove();
    });

    it('varios enqueueOrMergeSyncBatch seguidos nunca crean un 2º job para el mismo usuario', async () => {
      await enqueueOrMergeSyncBatch(userId, [{ platform: 'PSN', platformAccountId: 'acc-psn' }], 'auto');
      await enqueueOrMergeSyncBatch(userId, [{ platform: 'RA', platformAccountId: 'acc-ra' }], 'manual');
      await enqueueOrMergeSyncBatch(userId, [{ platform: 'STEAM', platformAccountId: 'acc-steam' }], 'initial');

      const waitingJobs = await syncQueue.getJobs(['waiting']);
      expect(waitingJobs.filter((j) => j.id === jobId)).toHaveLength(1);
    });
  });

  describe('no-op cuando el job existente NO está en WAITING (riesgo residual aceptado)', () => {
    const userId = 't141-active-noop-user';
    const jobId = `sync-bg-${userId}`;
    let worker: Worker;
    let workerConnection: Redis;
    let releaseProcessor: (() => void) | undefined;

    afterEach(async () => {
      releaseProcessor?.();
      await worker.close();
      // createWorkerConnection() abre su propia conexión ioredis — worker.close() no la cierra
      // por sí sola (no es la conexión que BullMQ gestiona internamente). Cerrarla explícitamente
      // para no dejar el handle TCP abierto tras el test (evita agravar T130).
      await workerConnection.quit();
      const job = await syncQueue.getJob(jobId);
      await job?.remove().catch(() => undefined);
    });

    it(
      'un job ACTIVE no se modifica — enqueueOrMergeSyncBatch no corrompe su estado, ' +
        'y la plataforma nueva se pierde para este ciclo (recuperable en el siguiente sync)',
      async () => {
        const holdPromise = new Promise<void>((resolve) => {
          releaseProcessor = resolve;
        });

        workerConnection = createWorkerConnection();
        worker = new Worker(
          'sync',
          async () => {
            await holdPromise;
            return { achievementsSynced: 0, gamesUpdated: 0, syncedAt: new Date().toISOString() };
          },
          { connection: workerConnection },
        );
        await worker.waitUntilReady();

        const first = await enqueueOrMergeSyncBatch(
          userId,
          [{ platform: 'PSN', platformAccountId: 'acc-psn' }],
          'auto',
        );
        await waitForActive(worker, jobId);
        expect(await first.getState()).toBe('active');

        // Intento de merge mientras el job sigue activo: debe ser no-op sobre los datos.
        const second = await enqueueOrMergeSyncBatch(
          userId,
          [{ platform: 'STEAM', platformAccountId: 'acc-steam' }],
          'manual',
        );

        expect(second.id).toBe(jobId);
        const persisted = await syncQueue.getJob(jobId);
        const data = persisted?.data as SyncBatchJobData;
        expect(data.platforms).toEqual([{ platform: 'PSN', platformAccountId: 'acc-psn' }]);
      },
    );
  });
});
