import { syncBgJobOptions } from '../sync.queue';

/**
 * Unitario puro — SIN Redis, SIN mockear sync.queue. Todos los demás tests que tocan
 * syncBgJobOptions (sync.service.test.ts, sync.worker.test.ts, background-sync.scheduler.test.ts)
 * mockean este módulo entero y reimplementan la forma correcta dentro del mock — protegen que el
 * caller la use bien, pero no detectarían una regresión en la función real (T129: 2 de los 5 bugs
 * de la saga T101/T112/T124/T128 solo se verificaban contra el mock, nunca contra el retorno real).
 * Este archivo llama a la función real y afirma directamente sobre su retorno.
 */
describe('syncBgJobOptions — centinelas de regresión (T112, T128)', () => {
  it('construye jobId determinista sync-bg-{userId} SIN ":" (T112: BullMQ rechaza jobId con ":")', () => {
    const opts = syncBgJobOptions('user-1');

    // Centinela T112: jobId con ':' rompe BullMQ ("Custom Id cannot contain :") — ver BACKLOG T112.
    // sync-bg:{userId} lanzaba ese error en triggerManualSync/triggerAppOpenSync/el cron, y ningún
    // sync llegaba a procesarse. Afirma el formato correcto Y la ausencia del carácter que lo rompió.
    expect(opts.jobId).toBe('sync-bg-user-1');
    expect(opts.jobId).not.toContain(':');
  });

  it('usa removeOnComplete: true (booleano) — NO {count: N} (T128: nunca purgaba con jobId fijo)', () => {
    const opts = syncBgJobOptions('user-1');

    // Centinela T128: con jobId determinista reutilizado, removeOnComplete:{count:N} nunca se
    // dispara (solo existe 1 entrada por usuario, "conservar las N más recientes" jamás purga) y
    // el job completado bloqueaba indefinidamente los siguientes syncs — ver BACKLOG T128.
    expect(opts.removeOnComplete).toBe(true);
  });

  it('usa removeOnFail: { age: 300 } — NO {count: N} (T128, ángulo no cubierto por TESTS-1)', () => {
    const opts = syncBgJobOptions('user-1');

    // Centinela T128: mismo mecanismo que removeOnComplete pero para el camino de fallo — TESTS-1
    // (integración BullMQ real) solo ejercita removeOnComplete, no removeOnFail. Debe conservar el
    // fallo ~5 min para inspección sin bloquear al usuario más allá de eso — ver BACKLOG T128.
    expect(opts.removeOnFail).toEqual({ age: 300 });
  });
});
