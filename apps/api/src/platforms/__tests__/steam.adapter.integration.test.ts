import { randomUUID } from 'crypto';

import { prisma } from '../../lib/prisma';
import { batchUpsertSteamAchievements } from '../steam.adapter';
import type { SteamPlayerAchievement, SteamSchemaAchievement } from '../steam.adapter';
import { normalizeAchievementPoints } from '../achievement-points';

/**
 * Tests de integración contra Postgres real (T114, Ataque A — Steam, último adapter) — NO mockean
 * Prisma.
 *
 * Mismo motivo que retroachievements.adapter.integration.test.ts y psn.adapter.integration.test.ts:
 * el riesgo de este cambio (SQL crudo con ON CONFLICT, case-sensitivity de columnas entre comillas,
 * RETURNING) es específico de SQL — un mock de `prisma.$queryRaw` pasaría en verde aunque el SQL
 * estuviera mal formado o el conflict target no coincidiera con el índice único real. Solo una BD
 * real lo detecta.
 *
 * Diferencia clave frente a RA/PSN que este archivo cubre explícitamente: Steam SÍ actualiza
 * "rarity" en el DO UPDATE SET (como PSN) pero NUNCA toca "trophyType" (como RA, que también lo
 * omite) — el test de equivalencia (b) presta atención especial a ambos campos.
 *
 * Requiere Postgres local disponible (Docker, ver docs/BUILD_LOCAL.md) — DATABASE_URL debe apuntar
 * a él. Ejecutar con `npm run test:integration` desde apps/api/.
 */

const APP_ID = '730';

function makePlayerAchievements(): SteamPlayerAchievement[] {
  return [
    { apiname: 'ACH_WIN_PISTOLROUND', achieved: 1, unlocktime: 1700000000 },
    { apiname: 'ACH_WIN_MAP_DE_DUST2', achieved: 0, unlocktime: 0 },
    { apiname: 'ACH_KILL_ENEMY_STEALTH', achieved: 1, unlocktime: 1710000000 },
  ];
}

function makeSchemaMap(): Map<string, SteamSchemaAchievement> {
  return new Map([
    [
      'ACH_WIN_PISTOLROUND',
      {
        name: 'ACH_WIN_PISTOLROUND',
        displayName: 'Pistol Round Winner',
        description: 'Win a pistol round',
        icon: 'icon_pistol',
        icongray: 'icon_pistol_gray',
      },
    ],
    [
      'ACH_WIN_MAP_DE_DUST2',
      {
        name: 'ACH_WIN_MAP_DE_DUST2',
        displayName: 'Dust2 Victor',
        description: 'Win on Dust2',
        icon: 'icon_dust2',
        icongray: 'icon_dust2_gray',
      },
    ],
    [
      'ACH_KILL_ENEMY_STEALTH',
      {
        name: 'ACH_KILL_ENEMY_STEALTH',
        displayName: 'Silent Killer',
        description: 'Kill an enemy without being detected',
        icon: 'icon_stealth',
        icongray: 'icon_stealth_gray',
      },
    ],
  ]);
}

function makeRarityMap(): Map<string, number> {
  return new Map([
    ['ACH_WIN_PISTOLROUND', 50],
    ['ACH_WIN_MAP_DE_DUST2', 0],
    ['ACH_KILL_ENEMY_STEALTH', 0.5],
  ]);
}

describe('steam.adapter — batching Steam contra Postgres real (T114)', () => {
  let userId: string;
  let gameId: string;

  beforeEach(async () => {
    const user = await prisma.user.create({
      data: {
        username: `t114-steam-${randomUUID()}`,
        email: `t114-steam-${randomUUID()}@test.local`,
        passwordHash: 'x',
      },
    });
    userId = user.id;

    const game = await prisma.game.create({
      data: {
        platform: 'STEAM',
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

  it('(a) batch con logro NUEVO + logro EXISTENTE a la vez — el existente conserva su id, no se duplica, rarity se actualiza', async () => {
    // Sembrar el logro con rareza vieja, como si ya existiera de un sync anterior.
    const existing = await prisma.achievement.create({
      data: {
        gameId,
        platform: 'STEAM',
        externalId: 'ACH_WIN_PISTOLROUND',
        title: 'Pistol Round Winner (viejo título, pre-batch)',
        normalizedPoints: 5,
        rarity: 99, // valor viejo, distinto del fixture (50)
      },
    });

    const achievementsSynced = await batchUpsertSteamAchievements(
      makePlayerAchievements(),
      makeSchemaMap(),
      makeRarityMap(),
      gameId,
      APP_ID,
      userId,
    );

    expect(achievementsSynced).toBe(2); // PISTOLROUND y STEALTH tienen achieved:1

    const rows = await prisma.achievement.findMany({ where: { gameId }, orderBy: { externalId: 'asc' } });
    expect(rows).toHaveLength(3);

    const pistol = rows.find((r) => r.externalId === 'ACH_WIN_PISTOLROUND');
    const dust2 = rows.find((r) => r.externalId === 'ACH_WIN_MAP_DE_DUST2');
    const stealth = rows.find((r) => r.externalId === 'ACH_KILL_ENEMY_STEALTH');

    // El logro existente conserva su id — el batch hizo UPDATE, no INSERT duplicado
    expect(pistol?.id).toBe(existing.id);
    expect(pistol?.title).toBe('Pistol Round Winner'); // valor nuevo del batch
    expect(pistol?.rarity).toBe(50); // actualizado, no el 99 sembrado
    expect(pistol?.normalizedPoints).toBe(normalizeAchievementPoints(50));
    expect(pistol?.trophyType).toBeNull(); // Steam nunca lo usa

    expect(dust2).toBeDefined();
    expect(stealth).toBeDefined();
    expect(dust2?.id).not.toBe(existing.id);
    expect(stealth?.id).not.toBe(existing.id);
    expect(dust2?.trophyType).toBeNull();
    expect(stealth?.trophyType).toBeNull();

    // Valores campo a campo, no solo count()
    expect(dust2?.rarity).toBe(0);
    expect(dust2?.normalizedPoints).toBe(normalizeAchievementPoints(0));
    expect(stealth?.rarity).toBe(0.5);
    expect(stealth?.normalizedPoints).toBe(normalizeAchievementPoints(0.5));

    const userAchievements = await prisma.userAchievement.findMany({ where: { userId } });
    expect(userAchievements).toHaveLength(2); // PISTOLROUND y STEALTH — DUST2 no está achieved
  });

  it('(b) EQUIVALENCIA — el camino NUEVO (batch) produce las mismas filas que el camino VIEJO (upserts individuales)', async () => {
    // Reimplementación del `for` secuencial que este batch sustituye (recuperado de git, estado
    // previo a T114 Ataque A) — mismas funciones de normalización, mismo orden de escritura.
    async function legacyUpsertAchievements(
      playerAchievements: SteamPlayerAchievement[],
      schemaMap: Map<string, SteamSchemaAchievement>,
      rarityMap: Map<string, number>,
      legacyGameId: string,
      appId: string,
      legacyUserId: string,
    ): Promise<number> {
      let achievementsSynced = 0;
      for (const pa of playerAchievements) {
        const schemaDef = schemaMap.get(pa.apiname);
        const rawRarity = rarityMap.get(pa.apiname) ?? 100;
        const rarityValue = parseFloat(String(rawRarity));
        const normalized = normalizeAchievementPoints(rarityValue);

        const dbAchievement = await prisma.achievement.upsert({
          where: {
            platform_gameId_externalId: { platform: 'STEAM', gameId: legacyGameId, externalId: pa.apiname },
          },
          create: {
            gameId: legacyGameId,
            platform: 'STEAM',
            externalId: pa.apiname,
            title: schemaDef?.displayName ?? pa.apiname,
            description: schemaDef?.description ?? null,
            iconUrl: schemaDef?.icon
              ? schemaDef.icon.startsWith('http')
                ? schemaDef.icon
                : `https://media.steampowered.com/steamcommunity/public/images/apps/${appId}/${schemaDef.icon}.jpg`
              : null,
            rawValue: isNaN(rarityValue) ? null : rarityValue,
            normalizedPoints: normalized,
            rarity: isNaN(rarityValue) ? null : rarityValue,
            externalUrl: `https://store.steampowered.com/app/${appId}`,
          },
          update: {
            title: schemaDef?.displayName ?? pa.apiname,
            description: schemaDef?.description ?? null,
            rawValue: isNaN(rarityValue) ? null : rarityValue,
            normalizedPoints: normalized,
            rarity: isNaN(rarityValue) ? null : rarityValue,
          },
        });

        if (pa.achieved === 1) {
          await prisma.userAchievement.upsert({
            where: { userId_achievementId: { userId: legacyUserId, achievementId: dbAchievement.id } },
            create: {
              userId: legacyUserId,
              achievementId: dbAchievement.id,
              unlockedAt: new Date(pa.unlocktime * 1000),
            },
            update: { unlockedAt: new Date(pa.unlocktime * 1000) },
          });
          achievementsSynced++;
        }
      }
      return achievementsSynced;
    }

    // Segundo juego/usuario para el camino viejo, totalmente aislado del camino nuevo.
    const legacyUser = await prisma.user.create({
      data: {
        username: `t114-legacy-steam-${randomUUID()}`,
        email: `t114-legacy-steam-${randomUUID()}@test.local`,
        passwordHash: 'x',
      },
    });
    const legacyGame = await prisma.game.create({
      data: { platform: 'STEAM', externalId: `t114-legacy-game-${randomUUID()}`, title: 'Test Game Legacy', totalAchievements: 3 },
    });

    try {
      const playerAchievements = makePlayerAchievements();
      const schemaMap = makeSchemaMap();
      const rarityMap = makeRarityMap();

      const [newCount, legacyCount] = await Promise.all([
        batchUpsertSteamAchievements(playerAchievements, schemaMap, rarityMap, gameId, APP_ID, userId),
        legacyUpsertAchievements(playerAchievements, schemaMap, rarityMap, legacyGame.id, APP_ID, legacyUser.id),
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
    const playerAchievements = makePlayerAchievements();
    const schemaMap = makeSchemaMap();
    const rarityMap = makeRarityMap();

    const firstRun = await batchUpsertSteamAchievements(playerAchievements, schemaMap, rarityMap, gameId, APP_ID, userId);
    const rowsAfterFirst = await prisma.achievement.findMany({ where: { gameId } });
    const userAchAfterFirst = await prisma.userAchievement.findMany({ where: { userId } });

    const secondRun = await batchUpsertSteamAchievements(playerAchievements, schemaMap, rarityMap, gameId, APP_ID, userId);
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

  it('(d) NIVEL FUNCIÓN — batchUpsertSteamAchievements no tiene efectos colaterales cruzados entre llamadas independientes a nivel de BD', async () => {
    // OJO: este test aísla las dos llamadas con un Promise.allSettled PROPIO DEL TEST — no
    // reproduce cómo Steam las invoca en producción. `processGames` es un `for` SECUENCIAL sin
    // Promise.allSettled y sin try/catch por juego (a diferencia de RA/PSN, que sí aíslan) — ver
    // el test (d2) para el comportamiento real de producción. Este test (d) solo verifica que la
    // función en sí, cuando el caller la aísla, no arrastra el fallo de una llamada a otra a nivel
    // de escritura en BD (sin transacción compartida, sin fuga de estado entre invocaciones).
    //
    // gameId inexistente (no sembrado en este test) → viola la FK de "Achievement" → la sentencia
    // completa de ESTE juego falla (trade-off documentado: INSERT multi-fila aborta entero), pero
    // eso queda aislado a nivel de función — el otro juego, válido, se procesa con normalidad.
    const bogusGameId = randomUUID();

    const results = await Promise.allSettled([
      batchUpsertSteamAchievements(makePlayerAchievements(), makeSchemaMap(), makeRarityMap(), bogusGameId, APP_ID, userId),
      batchUpsertSteamAchievements(makePlayerAchievements(), makeSchemaMap(), makeRarityMap(), gameId, APP_ID, userId),
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

  it('(d2) NIVEL PRODUCCIÓN — fragilidad preexistente: en el `for` secuencial de processGames, un juego que lanza SÍ aborta los siguientes (sin try/catch, sin Promise.allSettled)', async () => {
    // Reproduce el patrón REAL de processGames (steam.adapter.ts): un `for` secuencial con
    // `await` directo, sin Promise.allSettled ni try/catch por juego. Esto NO es una regresión de
    // T114 — el `for` de upserts individuales que este batch sustituye tampoco tenía aislamiento
    // (ver comparación con HEAD anterior a T114). Es una fragilidad preexistente en Steam, ausente
    // en RA/PSN. Ticket de mejora deliberada en el backlog (fuera de scope de T114).
    const bogusGameId = randomUUID();

    async function sequentialLikeProcessGames(): Promise<void> {
      // Primer "juego" — gameId inexistente, viola la FK y lanza.
      await batchUpsertSteamAchievements(makePlayerAchievements(), makeSchemaMap(), makeRarityMap(), bogusGameId, APP_ID, userId);
      // Segundo "juego" — válido, pero en el `for` real NUNCA se alcanza si el anterior lanza.
      await batchUpsertSteamAchievements(makePlayerAchievements(), makeSchemaMap(), makeRarityMap(), gameId, APP_ID, userId);
    }

    await expect(sequentialLikeProcessGames()).rejects.toThrow();

    // El juego válido, que iba DESPUÉS del que falla, nunca llegó a escribirse — confirma que el
    // fallo del primero abortó el procesamiento del segundo, igual que en producción.
    const rows = await prisma.achievement.findMany({ where: { gameId } });
    expect(rows).toHaveLength(0);
  });

  it('(e) dedupe por externalId — el mismo apiname repetido en el input no rompe el INSERT (última entrada gana)', async () => {
    const duplicated: SteamPlayerAchievement[] = [
      { apiname: 'ACH_WIN_PISTOLROUND', achieved: 0, unlocktime: 0 },
      { apiname: 'ACH_WIN_PISTOLROUND', achieved: 1, unlocktime: 1700000000 }, // última gana
    ];

    const achievementsSynced = await batchUpsertSteamAchievements(
      duplicated,
      makeSchemaMap(),
      makeRarityMap(),
      gameId,
      APP_ID,
      userId,
    );

    expect(achievementsSynced).toBe(1);
    const rows = await prisma.achievement.findMany({ where: { gameId } });
    expect(rows).toHaveLength(1);
  });
});
