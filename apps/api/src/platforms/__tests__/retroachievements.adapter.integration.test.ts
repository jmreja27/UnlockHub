import { randomUUID } from 'crypto';

import { prisma } from '../../lib/prisma';
import { batchUpsertRaAchievements } from '../retroachievements.adapter';
import type { RaAchievementEntry } from '../retroachievements.adapter';

/**
 * Tests de integración contra Postgres real (T114, Ataque A) — NO mockean Prisma.
 *
 * El riesgo de este cambio (batching de escrituras con SQL crudo: ON CONFLICT, case-sensitivity
 * de columnas entre comillas, RETURNING) es específicamente de SQL — un mock de `prisma.$queryRaw`
 * pasaría en verde aunque el SQL estuviera mal formado o el conflict target no coincidiera con el
 * índice único real. Solo una BD real lo detecta.
 *
 * Requiere Postgres local disponible (Docker, ver docs/BUILD_LOCAL.md) — DATABASE_URL debe apuntar
 * a él. Ejecutar con `npm run test:integration` desde apps/api/.
 */

function makeAchievements(): Record<string, RaAchievementEntry> {
  return {
    '101': {
      ID: 101,
      Title: 'Ring Collector',
      Description: 'Collect 100 rings',
      BadgeName: 'badge101',
      Points: 5,
      DateEarned: '2024-01-15 10:30:00',
      DateEarnedHardcore: null,
    },
    '102': {
      ID: 102,
      Title: 'Speed Demon',
      Description: 'Finish act in under 1 minute',
      BadgeName: 'badge102',
      Points: 150,
      DateEarned: null,
      DateEarnedHardcore: null,
    },
    '103': {
      ID: 103,
      Title: 'First Steps',
      Description: 'Start the game',
      BadgeName: 'badge103',
      Points: 0,
      DateEarned: '2024-01-14 09:00:00',
      DateEarnedHardcore: null,
    },
  };
}

describe('retroachievements.adapter — batching RA contra Postgres real (T114)', () => {
  let userId: string;
  let gameId: string;

  beforeEach(async () => {
    const user = await prisma.user.create({
      data: {
        username: `t114-ra-${randomUUID()}`,
        email: `t114-ra-${randomUUID()}@test.local`,
        passwordHash: 'x',
      },
    });
    userId = user.id;

    const game = await prisma.game.create({
      data: {
        platform: 'RA',
        externalId: `t114-game-${randomUUID()}`,
        title: 'Test Game',
        totalAchievements: 3,
      },
    });
    gameId = game.id;
  });

  afterEach(async () => {
    // Orden respeta las FK: UserAchievement -> Achievement -> Game -> User
    await prisma.userAchievement.deleteMany({ where: { userId } });
    await prisma.achievement.deleteMany({ where: { gameId } });
    await prisma.game.delete({ where: { id: gameId } }).catch(() => undefined);
    await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
  });

  it('(a) batch con logro NUEVO + logro EXISTENTE a la vez — el existente conserva su id, no se duplica', async () => {
    // Sembrar el logro '101' como si ya existiera de un sync anterior, con su propio id.
    const existing = await prisma.achievement.create({
      data: {
        gameId,
        platform: 'RA',
        externalId: '101',
        title: 'Ring Collector (viejo título, pre-batch)',
        normalizedPoints: 5,
      },
    });

    const achievementsSynced = await batchUpsertRaAchievements(makeAchievements(), gameId, userId);

    expect(achievementsSynced).toBe(2); // 101 y 103 tienen DateEarned

    const rows = await prisma.achievement.findMany({ where: { gameId }, orderBy: { externalId: 'asc' } });
    expect(rows).toHaveLength(3); // 101 actualizado (no duplicado) + 102 y 103 nuevos

    const row101 = rows.find((r) => r.externalId === '101');
    const row102 = rows.find((r) => r.externalId === '102');
    const row103 = rows.find((r) => r.externalId === '103');

    // El logro existente conserva su id — el batch hizo UPDATE, no INSERT duplicado
    expect(row101?.id).toBe(existing.id);
    expect(row101?.title).toBe('Ring Collector'); // valor nuevo del batch, no el viejo sembrado

    expect(row102).toBeDefined();
    expect(row103).toBeDefined();
    expect(row102?.id).not.toBe(existing.id);
    expect(row103?.id).not.toBe(existing.id);

    // Valores campo a campo, no solo count()
    expect(row102?.normalizedPoints).toBe(30); // Math.round(150/5)
    expect(row103?.normalizedPoints).toBe(5); // mínimo garantizado (Points=0)
    expect(row101?.rawValue).toBe(5);

    const userAchievements = await prisma.userAchievement.findMany({ where: { userId } });
    expect(userAchievements).toHaveLength(2); // 101 y 103 — 102 no tiene DateEarned
  });

  it('(b) EQUIVALENCIA — el camino NUEVO (batch) produce las mismas filas que el camino VIEJO (upserts individuales)', async () => {
    // Reimplementación del `for` secuencial que este batch sustituye (recuperado de git, estado
    // previo a T114 Ataque A) — mismas funciones de normalización, mismo orden de escritura.
    // Test más importante de la ronda: si el batch divergiera del código viejo en cualquier campo,
    // este es el que lo detecta.
    function legacyNormalizePoints(points: number | undefined): number {
      if (!points || points <= 0) return 5;
      return Math.max(5, Math.round(points / 5));
    }
    function legacyBuildBadgeUrl(badgeName: string | undefined): string | null {
      if (!badgeName) return null;
      return `https://media.retroachievements.org/Badge/${badgeName}.png`;
    }
    async function legacyUpsertAchievements(
      achievements: Record<string, RaAchievementEntry>,
      legacyGameId: string,
      legacyUserId: string,
    ): Promise<number> {
      let achievementsSynced = 0;
      for (const [achId, ach] of Object.entries(achievements)) {
        const achievementExternalId = String(ach.ID ?? achId);
        const dbAchievement = await prisma.achievement.upsert({
          where: {
            platform_gameId_externalId: { platform: 'RA', gameId: legacyGameId, externalId: achievementExternalId },
          },
          create: {
            gameId: legacyGameId,
            platform: 'RA',
            externalId: achievementExternalId,
            title: ach.Title,
            description: ach.Description ?? null,
            iconUrl: legacyBuildBadgeUrl(ach.BadgeName),
            rawValue: ach.Points ?? null,
            normalizedPoints: legacyNormalizePoints(ach.Points),
            rarity: null,
            externalUrl: `https://retroachievements.org/achievement/${achievementExternalId}`,
          },
          update: {
            title: ach.Title,
            description: ach.Description ?? null,
            iconUrl: legacyBuildBadgeUrl(ach.BadgeName),
            rawValue: ach.Points ?? null,
            normalizedPoints: legacyNormalizePoints(ach.Points),
            externalUrl: `https://retroachievements.org/achievement/${achievementExternalId}`,
          },
        });

        const earnedDate = ach.DateEarned ?? ach.DateEarnedHardcore;
        if (earnedDate && earnedDate !== '' && earnedDate !== '0000-00-00 00:00:00') {
          await prisma.userAchievement.upsert({
            where: { userId_achievementId: { userId: legacyUserId, achievementId: dbAchievement.id } },
            create: { userId: legacyUserId, achievementId: dbAchievement.id, unlockedAt: new Date(earnedDate) },
            update: { unlockedAt: new Date(earnedDate) },
          });
          achievementsSynced++;
        }
      }
      return achievementsSynced;
    }

    // Segundo juego/usuario para el camino viejo, totalmente aislado del camino nuevo.
    const legacyUser = await prisma.user.create({
      data: {
        username: `t114-legacy-${randomUUID()}`,
        email: `t114-legacy-${randomUUID()}@test.local`,
        passwordHash: 'x',
      },
    });
    const legacyGame = await prisma.game.create({
      data: { platform: 'RA', externalId: `t114-legacy-game-${randomUUID()}`, title: 'Test Game Legacy', totalAchievements: 3 },
    });

    try {
      const achievements = makeAchievements();

      const [newCount, legacyCount] = await Promise.all([
        batchUpsertRaAchievements(achievements, gameId, userId),
        legacyUpsertAchievements(achievements, legacyGame.id, legacyUser.id),
      ]);

      expect(newCount).toBe(legacyCount);

      const [newRows, legacyRows] = await Promise.all([
        prisma.achievement.findMany({ where: { gameId }, orderBy: { externalId: 'asc' } }),
        prisma.achievement.findMany({ where: { gameId: legacyGame.id }, orderBy: { externalId: 'asc' } }),
      ]);

      expect(newRows).toHaveLength(legacyRows.length);
      for (let i = 0; i < newRows.length; i++) {
        const a = newRows[i]!;
        const b = legacyRows[i]!;
        expect(a.externalId).toBe(b.externalId);
        expect(a.title).toBe(b.title);
        expect(a.description).toBe(b.description);
        expect(a.iconUrl).toBe(b.iconUrl);
        expect(a.rawValue).toBe(b.rawValue);
        expect(a.normalizedPoints).toBe(b.normalizedPoints);
        expect(a.rarity).toBe(b.rarity);
        expect(a.trophyType).toBe(b.trophyType);
        expect(a.externalUrl).toBe(b.externalUrl);
      }

      const [newUserAch, legacyUserAch] = await Promise.all([
        prisma.userAchievement.findMany({
          where: { userId },
          include: { achievement: true },
          orderBy: { achievement: { externalId: 'asc' } },
        }),
        prisma.userAchievement.findMany({
          where: { userId: legacyUser.id },
          include: { achievement: true },
          orderBy: { achievement: { externalId: 'asc' } },
        }),
      ]);

      expect(newUserAch).toHaveLength(legacyUserAch.length);
      for (let i = 0; i < newUserAch.length; i++) {
        expect(newUserAch[i]!.achievement.externalId).toBe(legacyUserAch[i]!.achievement.externalId);
        expect(newUserAch[i]!.unlockedAt.getTime()).toBe(legacyUserAch[i]!.unlockedAt.getTime());
      }
    } finally {
      await prisma.userAchievement.deleteMany({ where: { userId: legacyUser.id } });
      await prisma.achievement.deleteMany({ where: { gameId: legacyGame.id } });
      await prisma.game.delete({ where: { id: legacyGame.id } });
      await prisma.user.delete({ where: { id: legacyUser.id } });
    }
  });

  it('(c) RE-SYNC — correr el batch dos veces con los mismos datos actualiza, no duplica', async () => {
    const achievements = makeAchievements();

    const firstRun = await batchUpsertRaAchievements(achievements, gameId, userId);
    const rowsAfterFirst = await prisma.achievement.findMany({ where: { gameId } });
    const userAchAfterFirst = await prisma.userAchievement.findMany({ where: { userId } });

    const secondRun = await batchUpsertRaAchievements(achievements, gameId, userId);
    const rowsAfterSecond = await prisma.achievement.findMany({ where: { gameId } });
    const userAchAfterSecond = await prisma.userAchievement.findMany({ where: { userId } });

    expect(firstRun).toBe(secondRun);
    expect(rowsAfterSecond).toHaveLength(rowsAfterFirst.length);
    expect(userAchAfterSecond).toHaveLength(userAchAfterFirst.length);

    // Mismos ids tras la segunda pasada — confirma UPDATE, no un INSERT duplicado
    const idsFirst = new Set(rowsAfterFirst.map((r) => r.id));
    const idsSecond = new Set(rowsAfterSecond.map((r) => r.id));
    expect(idsSecond).toEqual(idsFirst);
  });

  it('(d) fallo de un juego no tumba el sync — el aislamiento de Promise.allSettled se mantiene', async () => {
    // gameId inexistente (no sembrado en este test) → viola la FK de "Achievement" → la sentencia
    // completa de ESTE juego falla (trade-off documentado: INSERT multi-fila aborta entero), pero
    // eso debe quedar aislado — el otro juego, válido, se procesa con normalidad en paralelo.
    // (El aislamiento real entre juegos vive en el `Promise.allSettled` de processRaGame/syncUser;
    // aquí se prueba a nivel de la función de batch para no depender de mockear axios.)
    const bogusGameId = randomUUID();

    const results = await Promise.allSettled([
      batchUpsertRaAchievements(makeAchievements(), bogusGameId, userId),
      batchUpsertRaAchievements(makeAchievements(), gameId, userId),
    ]);

    expect(results[0]?.status).toBe('rejected');
    expect(results[1]?.status).toBe('fulfilled');
    if (results[1]?.status === 'fulfilled') {
      expect(results[1].value).toBe(2);
    }

    // El juego válido sí quedó escrito en BD, a pesar del fallo del otro
    const rows = await prisma.achievement.findMany({ where: { gameId } });
    expect(rows).toHaveLength(3);
  });
});
