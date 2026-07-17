import { Queue, Worker } from 'bullmq';
import type { Job } from 'bullmq';
import Redis from 'ioredis';

import { syncBgJobOptions } from '../sync.queue';

/**
 * Tests de integración contra Redis real (TESTS-2 / T129) — NO mockean bullmq ni ioredis.
 * Complementan sync.queue.integration.test.ts (TESTS-1) probando el ciclo "segundo sync" de
 * las dos primitivas reales de las que depende sync.worker.ts para excluir sincronizaciones
 * simultáneas: el lock de aplicación `sync:user-lock:{userId}` (SET NX EX / DEL) y la
 * deduplicación por jobId de BullMQ (`sync-bg-{userId}`).
 *
 * Los 5 bugs de la saga T101/T112/T124/T128 aparecían en la 2.ª ejecución, no en la 1.ª — un
 * mock de `redis.set`/`redis.del`/`syncQueue.add` siempre resuelve lo que el test configura y
 * nunca puede fallar por dedup o por una key que no se liberó de verdad. Aquí se ejercitan las
 * primitivas reales dos veces seguidas.
 *
 * NO ejercita el processor real de sync.worker.ts (hoy inline en startSyncWorker, hardcodea la
 * cola 'sync') — eso es el escenario #4, bloqueado por T140 (extraer el processor). Aquí solo
 * se prueban las primitivas Redis/BullMQ de las que ese processor depende.
 *
 * Usa la DB 1 de Redis (aislada de la DB 0 de desarrollo/producción) y un nombre de cola
 * dedicado (`sync-lifecycle-test`, distinto de `sync-integration-test` de TESTS-1) para no
 * interferir con esa suite ni con `unlockhub-worker` si corriera en paralelo.
 */

const REDIS_URL = process.env['REDIS_URL'] ?? 'redis://localhost:6379';
const TEST_DB = 1;
const QUEUE_NAME = 'sync-lifecycle-test';

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

describe('sync.lifecycle — primitivas de lock y dedup contra Redis real (TESTS-2 #1-#3)', () => {
  // Cliente Redis dedicado a los tests de lock (#1, #2) — separado del `redis` de
  // beforeEach/afterEach (que sirve a los tests de dedup, #3) para que cada grupo cierre
  // exactamente las conexiones que abrió y no se agrave T130.
  let lockRedis: Redis;

  let queue: Queue;
  let worker: Worker;
  let redis: Redis;
  let processedCount: Record<string, number>;

  beforeAll(() => {
    lockRedis = new Redis(connectionOptions());
  });

  afterAll(async () => {
    await lockRedis.quit();
  });

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
    // Por si algún test de lock deja la key colgada tras un fallo — no debe filtrar estado
    // entre tests de este archivo.
    await lockRedis.del('sync:user-lock:lifecycle-test-user');
  });

  describe('#1 — lock liberado entre ciclos reales (DEL real libera la key para un SET NX real)', () => {
    it(
      'adquirir → liberar → adquirir de nuevo tiene éxito ' +
        '(regresión: si el DEL del finally en sync.worker.ts no liberase la key de verdad, ' +
        'el segundo sync de un usuario quedaría bloqueado para siempre — T128)',
      async () => {
        const lockKey = 'sync:user-lock:lifecycle-test-user';

        const firstAcquire = await lockRedis.set(lockKey, 'job-1', 'EX', 600, 'NX');
        expect(firstAcquire).toBe('OK');

        await lockRedis.del(lockKey);

        const secondAcquire = await lockRedis.set(lockKey, 'job-2', 'EX', 600, 'NX');
        expect(secondAcquire).toBe('OK');

        const value = await lockRedis.get(lockKey);
        expect(value).toBe('job-2');
      },
    );
  });

  describe('#2 — lock en contención real (segundo SET NX falla mientras el primero sigue vivo)', () => {
    it(
      'un segundo SET NX EX sobre la misma key falla mientras el primer lock no se ha liberado ' +
        '(primitiva de la que depende la rama de reencolar-con-delay/abandonar-tras-N-intentos ' +
        'de sync.worker.ts — sin esto, dos syncs del mismo usuario podrían solaparse)',
      async () => {
        const lockKey = 'sync:user-lock:lifecycle-test-user';

        const firstAcquire = await lockRedis.set(lockKey, 'job-1', 'EX', 600, 'NX');
        expect(firstAcquire).toBe('OK');

        const secondAcquire = await lockRedis.set(lockKey, 'job-2', 'EX', 600, 'NX');
        expect(secondAcquire).toBeNull();

        // El lock sigue perteneciendo al primer job — no lo pisó el segundo intento.
        const value = await lockRedis.get(lockKey);
        expect(value).toBe('job-1');

        await lockRedis.del(lockKey);
      },
    );
  });

  describe('#3 — dedup BullMQ bajo un segundo .add() real (complementa el centinela estático de TESTS-4)', () => {
    it(
      'un segundo .add() con el mismo jobId sync-bg-{userId}, tras COMPLETAR el primero, ' +
        'no es un no-op silencioso — el segundo job también se procesa ' +
        '(T128: con removeOnComplete:{count:N} el jobId nunca se liberaba porque solo existe ' +
        '1 entrada por usuario en "completed", así que "conservar las N más recientes" jamás ' +
        'disparaba y BullMQ descartaba en silencio cualquier .add() posterior)',
      async () => {
        const opts = syncBgJobOptions('lifecycle-user-1');

        const firstJob = await queue.add('sync', {}, opts);
        await waitForCompleted(worker, opts.jobId);
        expect(processedCount[opts.jobId]).toBe(1);

        const secondJob = await queue.add('sync', {}, opts);
        await waitForCompleted(worker, opts.jobId);

        // Si BullMQ hubiera descartado el segundo .add() como no-op (dedup por jobId
        // existente, sin mirar el estado), processedCount se quedaría en 1 y este assert
        // fallaría — es la afirmación DINÁMICA que TESTS-4 (estática, solo verifica las
        // opts) no puede hacer.
        expect(processedCount[opts.jobId]).toBe(2);

        // Ambas llamadas a .add() devuelven el mismo jobId determinista — confirma que el
        // segundo .add() fue una re-entrada real de la cola, no un job distinto.
        expect(firstJob.id).toBe(opts.jobId);
        expect(secondJob.id).toBe(opts.jobId);
      },
    );
  });
});
