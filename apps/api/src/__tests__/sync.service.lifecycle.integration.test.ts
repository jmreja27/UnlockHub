import { redis } from '../lib/redis';
import { syncQueue, syncBgJobOptions } from '../jobs/sync.queue';

/**
 * Tests de integración contra Redis real (TESTS-3 / T129) — complementan
 * sync.lifecycle.integration.test.ts (TESTS-2, primitivas Redis/BullMQ aisladas) probando que
 * la LÓGICA DE NEGOCIO real de `sync.service.ts` usa correctamente esas primitivas.
 *
 * Solo `../lib/prisma` está mockeado (triggerManualSync no necesita BD real para el camino de
 * "lock ya tomado" — retorna antes de tocar prisma). `../lib/redis` y `../jobs/sync.queue` son
 * los módulos REALES de producción — no se abre una conexión/cola aislada como en TESTS-1/2
 * porque el objetivo es probar la integración tal cual la usa `triggerManualSync` en producción,
 * no una primitiva en aislamiento.
 *
 * Diagnóstico previo a este archivo (T129/TESTS-3): los cooldowns YA estaban cubiertos por
 * sync.service.test.ts (mockeado, pero la lógica de umbrales no depende de Redis real). El único
 * hueco end-to-end real (worker completo procesando un job batch real) está BLOQUEADO por T140
 * (el processor vive inline en `startSyncWorker`, no es una función extraíble hoy). Los 2 huecos
 * reales viables sin ese refactor son los de abajo.
 */

jest.mock('../lib/prisma', () => ({
  prisma: {
    platformAccount: { findUnique: jest.fn(), findMany: jest.fn() },
  },
}));

import * as syncService from '../services/sync.service';

const TEST_DATE = new Date().toISOString().slice(0, 10);

describe('sync.service — reglas de negocio del lifecycle contra Redis real (TESTS-3)', () => {
  afterAll(async () => {
    await syncQueue.close();
    await redis.quit();
  });

  describe('TEST A — triggerManualSync respeta el lock exclusivo de negocio real', () => {
    const userId = 'tests3-lock-user';
    const platform = 'STEAM' as const;
    const lockKey = `sync:user-lock:${userId}`;
    const cooldownKey = `sync:cooldown:${userId}:${platform}`;
    const dailyKey = `sync:daily:${userId}:${platform}:${TEST_DATE}`;

    afterEach(async () => {
      await redis.del(lockKey, cooldownKey, dailyKey);
    });

    it(
      'devuelve {status:"in_progress"} y NO consume cooldown ni cuota diaria cuando ya hay ' +
        'un sync en curso (lock leído con redis.get REAL, no un mock que siempre resuelve lo ' +
        'que el test configura)',
      async () => {
        const acquired = await redis.set(lockKey, 'sync-bg-' + userId, 'EX', 600, 'NX');
        expect(acquired).toBe('OK');

        const result = await syncService.triggerManualSync(userId, platform, false);

        expect(result).toEqual({ status: 'in_progress', platform });

        // El rechazo por lock debe ocurrir ANTES de gastar cooldown o cuota diaria — si
        // triggerManualSync los consumiera antes de comprobar el lock, un usuario penalizaría
        // su propio cooldown/cuota simplemente por reintentar mientras su sync anterior sigue vivo.
        const cooldownExists = await redis.exists(cooldownKey);
        expect(cooldownExists).toBe(0);

        const dailyExists = await redis.exists(dailyKey);
        expect(dailyExists).toBe(0);
      },
    );
  });

  describe('TEST B — convergencia real: 2º .add() mientras el 1º sigue en WAITING', () => {
    const userId = 'tests3-converge-user';
    const jobId = `sync-bg-${userId}`;

    afterEach(async () => {
      // Limpieza del job real dejado en la cola de producción 'sync' — sin worker corriendo en
      // este test, el job nunca pasa de WAITING, así que hay que borrarlo explícitamente.
      const job = await syncQueue.getJob(jobId);
      await job?.remove();
    });

    it(
      'documenta el comportamiento real de BullMQ: el 2º .add() con el mismo jobId no crea un ' +
        'duplicado ni lanza error, pero TAMPOCO sobreescribe el payload del 1º mientras sigue ' +
        'en WAITING — es un no-op real sobre los datos ya encolados',
      async () => {
        const firstPayload = {
          userId,
          platforms: [{ platform: 'PSN' as const, platformAccountId: 'acc-psn' }],
          triggerType: 'auto' as const,
        };
        const secondPayload = {
          userId,
          platforms: [
            { platform: 'PSN' as const, platformAccountId: 'acc-psn' },
            { platform: 'STEAM' as const, platformAccountId: 'acc-steam' },
          ],
          triggerType: 'manual' as const,
        };

        // Simula: el scheduler nocturno encoló solo PSN para este usuario.
        const firstJob = await syncQueue.add('sync-bg-' + userId, firstPayload, syncBgJobOptions(userId));
        expect(await firstJob.getState()).toBe('waiting');

        // Simula: el usuario dispara un sync manual (con Steam también vinculado) antes de que
        // el worker recoja el job del cron.
        const secondJob = await syncQueue.add('sync-bg-' + userId, secondPayload, syncBgJobOptions(userId));

        // BullMQ no lanza error ni crea un job separado — mismo jobId, sin duplicado en la cola.
        expect(secondJob.id).toBe(jobId);
        const waitingJobs = await syncQueue.getJobs(['waiting']);
        expect(waitingJobs.filter((j) => j.id === jobId)).toHaveLength(1);

        // Comportamiento real observado: el payload persistido en Redis sigue siendo el del
        // PRIMER .add() — el segundo es un no-op sobre los datos (addStandardJob no pisa `data`
        // si el jobId ya existe en cualquier estado). Riesgo de producto documentado por este
        // test: si el cron encoló solo PSN y el manual llega antes de que el worker recoja el
        // job, Steam NO se añade al batch — se pierde hasta el siguiente ciclo del scheduler o
        // el siguiente sync manual que encuentre la cola vacía.
        const persisted = await syncQueue.getJob(jobId);
        expect(persisted?.data).toEqual(firstPayload);
      },
    );
  });
});
