import { randomUUID } from 'crypto';

import { prisma } from '../../lib/prisma';
import { batchUpsertPsnAchievements } from '../psn.adapter';
import type { PsnMergedTrophy } from '../psn.adapter';
import { normalizePsnAchievementPoints } from '../achievement-points';

/**
 * Tests de integración contra Postgres real (T114, Ataque A — PSN) — NO mockean Prisma.
 *
 * Mismo motivo que retroachievements.adapter.integration.test.ts: el riesgo de este cambio (SQL
 * crudo con ON CONFLICT, case-sensitivity de columnas entre comillas, RETURNING) es específico de
 * SQL — un mock de `prisma.$queryRaw` pasaría en verde aunque el SQL estuviera mal formado o el
 * conflict target no coincidiera con el índice único real. Solo una BD real lo detecta.
 *
 * Diferencia clave frente a RA que este archivo cubre explícitamente: PSN SÍ actualiza "rarity" y
 * "trophyType" en el DO UPDATE SET (RA los omite porque nunca los usa) — el test de equivalencia
 * (b) y el de re-sync (c) prestan atención especial al trofeo de Platino por ser el caso que motivó
 * la recalibración de F46 (Platino 300→100 XP).
 *
 * Requiere Postgres local disponible (Docker, ver docs/BUILD_LOCAL.md) — DATABASE_URL debe apuntar
 * a él. Ejecutar con `npm run test:integration` desde apps/api/.
 */

const NP_COMMUNICATION_ID = 'NPWR12345_00';

function makeTrophies(): PsnMergedTrophy[] {
  return [
    {
      trophyId: 1,
      trophyHidden: false,
      trophyType: 'bronze',
      trophyName: 'First Steps',
      trophyDetail: 'Start the game',
      trophyIconUrl: 'https://example.com/bronze.png',
      trophyEarnedRate: '75.5',
      trophyGroupId: 'default',
      earned: true,
      earnedDateTime: '2024-01-15T10:30:00.000Z',
    },
    {
      trophyId: 2,
      trophyHidden: false,
      trophyType: 'silver',
      trophyName: 'Halfway There',
      trophyDetail: 'Reach the midpoint',
      trophyIconUrl: 'https://example.com/silver.png',
      trophyEarnedRate: '40.0',
      trophyGroupId: 'default',
      earned: false,
      earnedDateTime: undefined,
    },
    {
      trophyId: 3,
      trophyHidden: false,
      trophyType: 'gold',
      trophyName: 'Almost There',
      trophyDetail: 'Reach the endgame',
      trophyIconUrl: 'https://example.com/gold.png',
      // Rareza ausente — psn-api no la expone de forma fiable (F46 Opción A) — cae al fallback por tipo.
      trophyEarnedRate: undefined,
      trophyGroupId: 'default',
      earned: true,
      earnedDateTime: '2024-01-14T09:00:00.000Z',
    },
    {
      trophyId: 4,
      trophyHidden: false,
      trophyType: 'platinum',
      trophyName: 'Platinum Trophy',
      trophyDetail: 'Earn every trophy',
      trophyIconUrl: 'https://example.com/platinum.png',
      trophyEarnedRate: '2.1',
      trophyGroupId: 'default',
      earned: true,
      earnedDateTime: '2024-01-20T18:00:00.000Z',
    },
  ] as PsnMergedTrophy[];
}

describe('psn.adapter — batching PSN contra Postgres real (T114)', () => {
  let userId: string;
  let gameId: string;

  beforeEach(async () => {
    const user = await prisma.user.create({
      data: {
        username: `t114-psn-${randomUUID()}`,
        email: `t114-psn-${randomUUID()}@test.local`,
        passwordHash: 'x',
      },
    });
    userId = user.id;

    const game = await prisma.game.create({
      data: {
        platform: 'PSN',
        externalId: `t114-game-${randomUUID()}`,
        title: 'Test Game PSN',
        totalAchievements: 4,
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

  it('(a) batch con trofeo NUEVO + trofeo EXISTENTE a la vez — el existente conserva su id, no se duplica', async () => {
    // Sembrar el trofeo bronce (id 1) como si ya existiera de un sync anterior, con su propio id
    // y un trophyType/rarity viejos — el batch debe sobreescribirlos (a diferencia de RA).
    const existing = await prisma.achievement.create({
      data: {
        gameId,
        platform: 'PSN',
        externalId: `${NP_COMMUNICATION_ID}:1`,
        title: 'First Steps (viejo título, pre-batch)',
        normalizedPoints: 10,
        trophyType: 'bronze',
        rarity: 99.9,
      },
    });

    const achievementsSynced = await batchUpsertPsnAchievements(
      makeTrophies(),
      gameId,
      userId,
      NP_COMMUNICATION_ID,
      'testuser',
    );

    expect(achievementsSynced).toBe(3); // trofeos 1, 3 y 4 están earned — el 2 no

    const rows = await prisma.achievement.findMany({ where: { gameId }, orderBy: { externalId: 'asc' } });
    expect(rows).toHaveLength(4);

    const row1 = rows.find((r) => r.externalId === `${NP_COMMUNICATION_ID}:1`);
    const row2 = rows.find((r) => r.externalId === `${NP_COMMUNICATION_ID}:2`);
    const row3 = rows.find((r) => r.externalId === `${NP_COMMUNICATION_ID}:3`);
    const row4 = rows.find((r) => r.externalId === `${NP_COMMUNICATION_ID}:4`);

    // El trofeo existente conserva su id — el batch hizo UPDATE, no INSERT duplicado
    expect(row1?.id).toBe(existing.id);
    expect(row1?.title).toBe('First Steps'); // valor nuevo del batch, no el viejo sembrado
    // A diferencia de RA: rarity y trophyType SÍ se sobreescriben en el re-sync
    expect(row1?.rarity).toBeCloseTo(75.5);
    expect(row1?.trophyType).toBe('bronze');

    expect(row2).toBeDefined();
    expect(row2?.id).not.toBe(existing.id);
    expect(row3).toBeDefined();
    expect(row4).toBeDefined();

    // Valores campo a campo del Platino — caso motivador de F46 (300→100 XP)
    expect(row4?.trophyType).toBe('platinum');
    expect(row4?.rarity).toBeCloseTo(2.1);
    expect(row4?.normalizedPoints).toBe(normalizePsnAchievementPoints(2.1, 'platinum'));

    // Gold sin rareza real → cae al fallback por tipo (F46 Opción A)
    expect(row3?.rarity).toBeNull();
    expect(row3?.normalizedPoints).toBe(normalizePsnAchievementPoints(NaN, 'gold'));

    const userAchievements = await prisma.userAchievement.findMany({ where: { userId } });
    expect(userAchievements).toHaveLength(3); // 1, 3 y 4 — el 2 no está earned
  });

  it('(b) EQUIVALENCIA — el camino NUEVO (batch) produce las mismas filas que el camino VIEJO (upserts individuales), con atención especial al Platino', async () => {
    // Reimplementación del `for` secuencial que este batch sustituye (recuperado de git, estado
    // previo a T114 Ataque A — ver commit anterior a 5cf4023) — mismas funciones de normalización,
    // mismo orden de escritura, MISMO update: que sí toca rarity/trophyType (a diferencia de RA).
    async function legacyUpsertAchievements(
      trophies: PsnMergedTrophy[],
      legacyGameId: string,
      legacyUserId: string,
      npCommunicationId: string,
      psnUsername: string,
    ): Promise<number> {
      let achievementsSynced = 0;
      for (const t of trophies) {
        const rarityValue = t.trophyEarnedRate ? parseFloat(t.trophyEarnedRate) : NaN;
        const normalized = normalizePsnAchievementPoints(rarityValue, t.trophyType);
        const dbAchievement = await prisma.achievement.upsert({
          where: {
            platform_gameId_externalId: {
              platform: 'PSN',
              gameId: legacyGameId,
              externalId: `${npCommunicationId}:${t.trophyId}`,
            },
          },
          create: {
            gameId: legacyGameId,
            platform: 'PSN',
            externalId: `${npCommunicationId}:${t.trophyId}`,
            title: t.trophyName ?? String(t.trophyId),
            description: t.trophyDetail ?? null,
            iconUrl: t.trophyIconUrl ?? null,
            rawValue: isNaN(rarityValue) ? null : rarityValue,
            normalizedPoints: normalized,
            rarity: isNaN(rarityValue) ? null : rarityValue,
            externalUrl: `https://psnprofiles.com/${psnUsername}`,
            trophyType: t.trophyType ?? null,
          },
          update: {
            title: t.trophyName ?? String(t.trophyId),
            description: t.trophyDetail ?? null,
            rawValue: isNaN(rarityValue) ? null : rarityValue,
            normalizedPoints: normalized,
            rarity: isNaN(rarityValue) ? null : rarityValue,
            trophyType: t.trophyType ?? null,
          },
        });

        if (t.earned && t.earnedDateTime) {
          await prisma.userAchievement.upsert({
            where: { userId_achievementId: { userId: legacyUserId, achievementId: dbAchievement.id } },
            create: { userId: legacyUserId, achievementId: dbAchievement.id, unlockedAt: new Date(t.earnedDateTime) },
            update: { unlockedAt: new Date(t.earnedDateTime) },
          });
          achievementsSynced++;
        }
      }
      return achievementsSynced;
    }

    // Segundo juego/usuario para el camino viejo, totalmente aislado del camino nuevo.
    const legacyUser = await prisma.user.create({
      data: {
        username: `t114-psn-legacy-${randomUUID()}`,
        email: `t114-psn-legacy-${randomUUID()}@test.local`,
        passwordHash: 'x',
      },
    });
    const legacyGame = await prisma.game.create({
      data: { platform: 'PSN', externalId: `t114-legacy-game-${randomUUID()}`, title: 'Test Game Legacy', totalAchievements: 4 },
    });

    try {
      const trophies = makeTrophies();

      const [newCount, legacyCount] = await Promise.all([
        batchUpsertPsnAchievements(trophies, gameId, userId, NP_COMMUNICATION_ID, 'testuser'),
        legacyUpsertAchievements(trophies, legacyGame.id, legacyUser.id, NP_COMMUNICATION_ID, 'testuser'),
      ]);

      expect(newCount).toBe(legacyCount);
      expect(newCount).toBe(3);

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

      // Verificación explícita del Platino (motivo de la atención especial pedida) — campo a campo.
      const newPlatinum = newRows.find((r) => r.externalId === `${NP_COMMUNICATION_ID}:4`);
      const legacyPlatinum = legacyRows.find((r) => r.externalId === `${NP_COMMUNICATION_ID}:4`);
      expect(newPlatinum).toBeDefined();
      expect(legacyPlatinum).toBeDefined();
      expect(newPlatinum?.trophyType).toBe('platinum');
      expect(newPlatinum?.trophyType).toBe(legacyPlatinum?.trophyType);
      expect(newPlatinum?.rarity).toBe(legacyPlatinum?.rarity);
      expect(newPlatinum?.normalizedPoints).toBe(legacyPlatinum?.normalizedPoints);
      expect(newPlatinum?.normalizedPoints).toBe(normalizePsnAchievementPoints(2.1, 'platinum'));

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

  it('(c) RE-SYNC — correr el batch dos veces actualiza (incluida la rareza fluctuante del Platino), no duplica', async () => {
    const trophies = makeTrophies();

    const firstRun = await batchUpsertPsnAchievements(trophies, gameId, userId, NP_COMMUNICATION_ID, 'testuser');
    const rowsAfterFirst = await prisma.achievement.findMany({ where: { gameId }, orderBy: { externalId: 'asc' } });
    const userAchAfterFirst = await prisma.userAchievement.findMany({ where: { userId } });

    // Segunda pasada: la rareza del Platino "fluctuó" (como en la API real de PSN) — el batch debe
    // reflejar el valor NUEVO en el re-sync, a diferencia de RA que nunca actualiza rarity.
    const trophiesSecondSync = trophies.map((t) =>
      t.trophyId === 4 ? { ...t, trophyEarnedRate: '1.5' } : t,
    );
    const secondRun = await batchUpsertPsnAchievements(
      trophiesSecondSync,
      gameId,
      userId,
      NP_COMMUNICATION_ID,
      'testuser',
    );
    const rowsAfterSecond = await prisma.achievement.findMany({ where: { gameId }, orderBy: { externalId: 'asc' } });
    const userAchAfterSecond = await prisma.userAchievement.findMany({ where: { userId } });

    expect(firstRun).toBe(secondRun);
    expect(rowsAfterSecond).toHaveLength(rowsAfterFirst.length);
    expect(userAchAfterSecond).toHaveLength(userAchAfterFirst.length);

    // Mismos ids tras la segunda pasada — confirma UPDATE, no un INSERT duplicado
    const idsFirst = new Set(rowsAfterFirst.map((r) => r.id));
    const idsSecond = new Set(rowsAfterSecond.map((r) => r.id));
    expect(idsSecond).toEqual(idsFirst);

    const platinumAfterFirst = rowsAfterFirst.find((r) => r.externalId === `${NP_COMMUNICATION_ID}:4`);
    const platinumAfterSecond = rowsAfterSecond.find((r) => r.externalId === `${NP_COMMUNICATION_ID}:4`);
    expect(platinumAfterFirst?.rarity).toBeCloseTo(2.1);
    expect(platinumAfterSecond?.rarity).toBeCloseTo(1.5);
    expect(platinumAfterSecond?.id).toBe(platinumAfterFirst?.id);
    expect(platinumAfterSecond?.normalizedPoints).toBe(normalizePsnAchievementPoints(1.5, 'platinum'));
  });

  it('(d) fallo de un título no tumba el sync — el aislamiento de Promise.allSettled se mantiene', async () => {
    // gameId inexistente (no sembrado en este test) → viola la FK de "Achievement" → la sentencia
    // completa de ESTE título falla (trade-off documentado: INSERT multi-fila aborta entero), pero
    // eso debe quedar aislado — el otro título, válido, se procesa con normalidad en paralelo.
    // (El aislamiento real entre títulos vive en el `Promise.allSettled` de processTitles; aquí se
    // prueba a nivel de la función de batch para no depender de mockear psn-api.)
    const bogusGameId = randomUUID();

    const results = await Promise.allSettled([
      batchUpsertPsnAchievements(makeTrophies(), bogusGameId, userId, NP_COMMUNICATION_ID, 'testuser'),
      batchUpsertPsnAchievements(makeTrophies(), gameId, userId, NP_COMMUNICATION_ID, 'testuser'),
    ]);

    expect(results[0]?.status).toBe('rejected');
    expect(results[1]?.status).toBe('fulfilled');
    if (results[1]?.status === 'fulfilled') {
      expect(results[1].value).toBe(3);
    }

    // El título válido sí quedó escrito en BD, a pesar del fallo del otro
    const rows = await prisma.achievement.findMany({ where: { gameId } });
    expect(rows).toHaveLength(4);
  });
});
