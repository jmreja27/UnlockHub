import { randomUUID } from 'crypto';

import { prisma } from '../lib/prisma';
import { acceptChallenge } from '../services/achievement-challenge.service';
import { expireAchievementChallenges } from '../jobs/achievement-challenge.scheduler';
import { ACHIEVEMENT_CHALLENGE_DURATION_DAYS } from '../config/achievementChallenge';

/**
 * Tests de integración contra Postgres real (F47) — NO mockean Prisma.
 *
 * Cierra el hueco documentado en el backlog F47: hasta ahora el constraint único, la reutilización de
 * fila, la duración exacta, la idempotencia de expireAchievementChallenges y la cascada de borrado solo
 * se habían verificado con scripts manuales desechables durante las Fases 1a-1d — nunca quedó un test
 * permanente. Mismo motivo que steam.adapter.integration.test.ts / sync.queue.merge.integration.test.ts:
 * un mock de Prisma pasaría en verde aunque el `@@unique` no coincidiera con el índice real, o aunque
 * `onDelete: Cascade` no estuviera aplicado en la migración — solo una BD real lo detecta.
 *
 * Requiere Postgres local disponible (Docker, ver docs/BUILD_LOCAL.md) — DATABASE_URL debe apuntar a
 * él. Ejecutar con `npm run test:integration` desde apps/api/.
 */

async function createUser() {
  const id = randomUUID();
  return prisma.user.create({
    data: {
      username: `f47-user-${id}`,
      email: `f47-user-${id}@test.local`,
      passwordHash: 'x',
    },
  });
}

async function createGameWithAchievement() {
  const id = randomUUID();
  const game = await prisma.game.create({
    data: {
      platform: 'STEAM',
      externalId: `f47-game-${id}`,
      title: 'Test Game',
      totalAchievements: 1,
    },
  });
  const achievement = await prisma.achievement.create({
    data: {
      gameId: game.id,
      platform: 'STEAM',
      externalId: `f47-ach-${id}`,
      title: 'Test Achievement',
      normalizedPoints: 50,
    },
  });
  return { game, achievement };
}

describe('AchievementChallenge — integración contra Postgres real (F47)', () => {
  let challenger: Awaited<ReturnType<typeof createUser>>;
  let challenged: Awaited<ReturnType<typeof createUser>>;
  let game: Awaited<ReturnType<typeof createGameWithAchievement>>['game'];
  let achievement: Awaited<ReturnType<typeof createGameWithAchievement>>['achievement'];

  beforeEach(async () => {
    challenger = await createUser();
    challenged = await createUser();
    ({ game, achievement } = await createGameWithAchievement());
  });

  afterEach(async () => {
    await prisma.achievementChallenge
      .deleteMany({ where: { OR: [{ challengerId: challenger.id }, { challengedId: challenged.id }] } })
      .catch(() => undefined);
    await prisma.achievement.delete({ where: { id: achievement.id } }).catch(() => undefined);
    await prisma.game.delete({ where: { id: game.id } }).catch(() => undefined);
    await prisma.user.delete({ where: { id: challenger.id } }).catch(() => undefined);
    await prisma.user.delete({ where: { id: challenged.id } }).catch(() => undefined);
  });

  it('(1) constraint único real — un segundo challenge idéntico (challengerId, challengedId, achievementId) es rechazado con P2002', async () => {
    await prisma.achievementChallenge.create({
      data: { challengerId: challenger.id, challengedId: challenged.id, achievementId: achievement.id, status: 'PENDING' },
    });

    await expect(
      prisma.achievementChallenge.create({
        data: { challengerId: challenger.id, challengedId: challenged.id, achievementId: achievement.id, status: 'PENDING' },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('(2) reutilización de fila tras ciclo cerrado — crear, rechazar y volver a crear el mismo trío ACTUALIZA la fila existente, no crea una nueva', async () => {
    const first = await prisma.achievementChallenge.create({
      data: { challengerId: challenger.id, challengedId: challenged.id, achievementId: achievement.id, status: 'PENDING' },
    });

    await prisma.achievementChallenge.update({ where: { id: first.id }, data: { status: 'REJECTED' } });

    const countBeforeReuse = await prisma.achievementChallenge.count({
      where: { challengerId: challenger.id, challengedId: challenged.id, achievementId: achievement.id },
    });
    expect(countBeforeReuse).toBe(1);

    // Mismo patrón que createChallenge() en achievement-challenge.service.ts: la fila existente se
    // reutiliza vía update() sobre el id, no vía create().
    const reused = await prisma.achievementChallenge.update({
      where: {
        challengerId_challengedId_achievementId: {
          challengerId: challenger.id,
          challengedId: challenged.id,
          achievementId: achievement.id,
        },
      },
      data: { status: 'PENDING', acceptedAt: null, expiresAt: null, resolvedAt: null, winnerId: null, pointsAwarded: null },
    });

    expect(reused.id).toBe(first.id);

    const countAfterReuse = await prisma.achievementChallenge.count({
      where: { challengerId: challenger.id, challengedId: challenged.id, achievementId: achievement.id },
    });
    expect(countAfterReuse).toBe(1);
  });

  it('(3) duración exacta — al aceptar un reto, expiresAt - acceptedAt es EXACTAMENTE ACHIEVEMENT_CHALLENGE_DURATION_DAYS', async () => {
    await prisma.friendship.create({
      data: { senderId: challenger.id, receiverId: challenged.id, status: 'ACCEPTED' },
    });
    const created = await prisma.achievementChallenge.create({
      data: { challengerId: challenger.id, challengedId: challenged.id, achievementId: achievement.id, status: 'PENDING' },
    });

    const accepted = await acceptChallenge(created.id, challenged.id);

    expect(accepted.acceptedAt).not.toBeNull();
    expect(accepted.expiresAt).not.toBeNull();

    const diffMs = accepted.expiresAt!.getTime() - accepted.acceptedAt!.getTime();
    expect(diffMs).toBe(ACHIEVEMENT_CHALLENGE_DURATION_DAYS * 24 * 60 * 60 * 1000);

    await prisma.friendship
      .deleteMany({ where: { senderId: challenger.id, receiverId: challenged.id } })
      .catch(() => undefined);
  });

  it('(4) idempotencia de expireAchievementChallenges contra BD real — la segunda pasada no crea notificaciones duplicadas ni cambia nada', async () => {
    const pastAcceptedAt = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
    const pastExpiresAt = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000); // ya vencido

    const challenge = await prisma.achievementChallenge.create({
      data: {
        challengerId: challenger.id,
        challengedId: challenged.id,
        achievementId: achievement.id,
        status: 'ACCEPTED',
        acceptedAt: pastAcceptedAt,
        expiresAt: pastExpiresAt,
      },
    });

    await expireAchievementChallenges();

    const afterFirstRun = await prisma.achievementChallenge.findUniqueOrThrow({ where: { id: challenge.id } });
    expect(afterFirstRun.status).toBe('EXPIRED');
    expect(afterFirstRun.resolvedAt).not.toBeNull();

    const notificationsAfterFirstRun = await prisma.notification.findMany({ where: { relatedId: challenge.id } });
    expect(notificationsAfterFirstRun).toHaveLength(2); // una por participante

    // Segunda pasada — el filtro status='ACCEPTED' ya no incluye este challenge (ahora EXPIRED),
    // así que la función es idempotente por construcción: no debe tocar nada más.
    await expireAchievementChallenges();

    const afterSecondRun = await prisma.achievementChallenge.findUniqueOrThrow({ where: { id: challenge.id } });
    expect(afterSecondRun.status).toBe('EXPIRED');
    expect(afterSecondRun.resolvedAt!.getTime()).toBe(afterFirstRun.resolvedAt!.getTime());

    const notificationsAfterSecondRun = await prisma.notification.findMany({ where: { relatedId: challenge.id } });
    expect(notificationsAfterSecondRun).toHaveLength(2); // sigue en 2 — no se duplicaron

    await prisma.notification.deleteMany({ where: { relatedId: challenge.id } }).catch(() => undefined);
  });

  it('(5a) cascada de borrado — borrar el User challenger elimina el AchievementChallenge asociado (onDelete: Cascade)', async () => {
    const challenge = await prisma.achievementChallenge.create({
      data: { challengerId: challenger.id, challengedId: challenged.id, achievementId: achievement.id, status: 'PENDING' },
    });

    await prisma.user.delete({ where: { id: challenger.id } });

    const stillExists = await prisma.achievementChallenge.findUnique({ where: { id: challenge.id } });
    expect(stillExists).toBeNull();

    // challenger ya borrado por este test — evita doble delete en afterEach
    // @ts-expect-error reasignación deliberada para que afterEach no intente borrar de nuevo
    challenger = { id: 'already-deleted' };
  });

  it('(5b) cascada de borrado — borrar el Achievement elimina el AchievementChallenge asociado (onDelete: Cascade)', async () => {
    const challenge = await prisma.achievementChallenge.create({
      data: { challengerId: challenger.id, challengedId: challenged.id, achievementId: achievement.id, status: 'PENDING' },
    });

    await prisma.achievement.delete({ where: { id: achievement.id } });

    const stillExists = await prisma.achievementChallenge.findUnique({ where: { id: challenge.id } });
    expect(stillExists).toBeNull();

    // achievement ya borrado por este test — evita doble delete en afterEach
    // @ts-expect-error reasignación deliberada para que afterEach no intente borrar de nuevo
    achievement = { id: 'already-deleted' };
  });
});
