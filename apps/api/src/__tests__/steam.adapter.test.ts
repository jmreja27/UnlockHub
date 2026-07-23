import axios from 'axios';

jest.mock('axios');
jest.mock('../lib/redis', () => ({
  redis: {
    get: jest.fn().mockResolvedValue(null),
    setex: jest.fn(),
    incr: jest.fn().mockResolvedValue(1),
    expire: jest.fn().mockResolvedValue(1),
  },
}));
jest.mock('../lib/prisma', () => ({
  prisma: {
    game: { upsert: jest.fn() },
    achievement: { upsert: jest.fn() },
    userAchievement: { upsert: jest.fn() },
    // T114 — batching Steam: processGames usa $queryRaw (FASE 1, achievements + RETURNING)
    // y $executeRaw (FASE 2, userAchievements) en lugar de los upserts individuales de arriba.
    $queryRaw: jest.fn(),
    $executeRaw: jest.fn(),
  },
}));

const mockAxios = axios as jest.Mocked<typeof axios>;

import { resolveVanityUrl, checkSteamProfilePublic, SteamAdapter } from '../platforms/steam.adapter';
import { normalizeAchievementPoints } from '../platforms/achievement-points';
import { prisma } from '../lib/prisma';
import { redis } from '../lib/redis';

const mockPrisma = prisma as jest.Mocked<typeof prisma>;
const mockRedis = redis as jest.Mocked<typeof redis>;

const STEAM_API_KEY = 'test-key';

beforeEach(() => {
  jest.clearAllMocks();
  process.env['STEAM_API_KEY'] = STEAM_API_KEY;
});

afterEach(() => {
  delete process.env['STEAM_API_KEY'];
});

describe('checkSteamProfilePublic', () => {
  it('no lanza si el perfil es público (communityvisibilitystate = 3)', async () => {
    mockAxios.get.mockResolvedValue({
      data: { response: { players: [{ steamid: '76561198000000001', communityvisibilitystate: 3 }] } },
    });

    await expect(checkSteamProfilePublic('76561198000000001')).resolves.toBeUndefined();
  });

  it('lanza STEAM_PROFILE_PRIVATE si communityvisibilitystate = 1 (privado)', async () => {
    mockAxios.get.mockResolvedValue({
      data: { response: { players: [{ steamid: '76561198000000001', communityvisibilitystate: 1 }] } },
    });

    await expect(checkSteamProfilePublic('76561198000000001')).rejects.toMatchObject({
      code: 'STEAM_PROFILE_PRIVATE',
      statusCode: 400,
    });
  });

  it('lanza STEAM_PROFILE_PRIVATE si no hay jugador en la respuesta', async () => {
    mockAxios.get.mockResolvedValue({ data: { response: { players: [] } } });

    await expect(checkSteamProfilePublic('76561198000000001')).rejects.toMatchObject({
      code: 'STEAM_PROFILE_PRIVATE',
      statusCode: 400,
    });
  });

  it('lanza STEAM_SYSTEM_NOT_CONFIGURED si no hay API key', async () => {
    delete process.env['STEAM_API_KEY'];

    await expect(checkSteamProfilePublic('76561198000000001')).rejects.toMatchObject({
      code: 'STEAM_SYSTEM_NOT_CONFIGURED',
      statusCode: 503,
    });
  });
});

describe('resolveVanityUrl', () => {
  it('devuelve directamente el SteamID64 si el input son 17 dígitos', async () => {
    const result = await resolveVanityUrl('76561198000000001');
    expect(result).toBe('76561198000000001');
    expect(mockAxios.get).not.toHaveBeenCalled();
  });

  it('resuelve vanityURL a SteamID64 via API', async () => {
    mockAxios.get.mockResolvedValue({
      data: { response: { success: 1, steamid: '76561198000000001' } },
    });

    const result = await resolveVanityUrl('myusername');
    expect(result).toBe('76561198000000001');
  });

  it('lanza STEAM_USER_NOT_FOUND si la API devuelve success != 1', async () => {
    mockAxios.get.mockResolvedValue({ data: { response: { success: 42 } } });

    await expect(resolveVanityUrl('noexiste')).rejects.toMatchObject({
      code: 'STEAM_USER_NOT_FOUND',
      statusCode: 404,
    });
  });
});

// ─── SteamAdapter — conversión de tipos en upsert ─────────────────────────────

describe('SteamAdapter — rawValue/rarity/iconUrl en upsert', () => {
  function setupSyncMocks(rarityPercent: number | string, iconInSchema: string) {
    // Llamada 1: GetOwnedGames
    mockAxios.get.mockResolvedValueOnce({
      data: {
        response: {
          games: [{
            appid: 203160,
            name: 'Test Game',
            img_icon_url: 'icon123',
            has_community_visible_stats: true,
            playtime_forever: 100,
          }],
        },
      },
    });
    // Llamada 2: GetPlayerAchievements (Promise.all[0])
    mockAxios.get.mockResolvedValueOnce({
      data: {
        playerstats: {
          success: true,
          achievements: [{ apiname: 'ACH_1', achieved: 0, unlocktime: 0 }],
        },
      },
    });
    // Llamada 3: GetSchemaForGame (Promise.all[1])
    mockAxios.get.mockResolvedValueOnce({
      data: {
        game: {
          availableGameStats: {
            achievements: [{ name: 'ACH_1', displayName: 'Achievement 1', icon: iconInSchema, icongray: 'gray' }],
          },
        },
      },
    });
    // Llamada 4: GetGlobalAchievementPercentagesForApp (Promise.all[2])
    mockAxios.get.mockResolvedValueOnce({
      data: {
        achievementpercentages: {
          achievements: [{ name: 'ACH_1', percent: rarityPercent }],
        },
      },
    });

    (mockPrisma.game.upsert as jest.Mock).mockResolvedValue({ id: 'game-1' } as never);
    // T114 — el batch reemplaza achievement.upsert/userAchievement.upsert por $queryRaw (FASE 1,
    // RETURNING id/externalId) + $executeRaw (FASE 2). Orden de `.values` del Prisma.Sql resultante
    // (ver batchUpsertSteamAchievements): [id, gameId, externalId, title, description, iconUrl,
    // rawValue, normalizedPoints, rarity, externalUrl, createdAt, updatedAt] — 'STEAM'::"Platform"
    // es literal SQL, no un parámetro, así que no aparece en `.values`.
    mockPrisma.$queryRaw.mockResolvedValue([{ id: 'ach-1', externalId: 'ACH_1' }] as never);
    mockPrisma.$executeRaw.mockResolvedValue(1 as never);
  }

  it('convierte rawValue y rarity a Float cuando la API devuelve string numérico', async () => {
    setupSyncMocks('54.6', 'icon1');

    const adapter = new SteamAdapter();
    await adapter.syncUser({ externalId: '76561198000000001', userId: 'user-1' } as never);

    const values = (mockPrisma.$queryRaw.mock.calls[0]?.[0] as unknown as { values: unknown[] }).values;
    expect(typeof values[6]).toBe('number'); // rawValue
    expect(values[6]).toBe(54.6);
    expect(values[8]).toBe(54.6); // rarity
  });

  it('rawValue y rarity son null cuando la API devuelve valor no numérico', async () => {
    setupSyncMocks('N/A', 'icon1');

    const adapter = new SteamAdapter();
    await adapter.syncUser({ externalId: '76561198000000001', userId: 'user-1' } as never);

    const values = (mockPrisma.$queryRaw.mock.calls[0]?.[0] as unknown as { values: unknown[] }).values;
    expect(values[6]).toBeNull(); // rawValue
    expect(values[8]).toBeNull(); // rarity
  });

  it('iconUrl no se duplica cuando la API devuelve una URL completa en el schema', async () => {
    const fullUrl = 'https://steamcdn-a.akamaihd.net/steamcommunity/public/images/apps/203160/abc123.jpg';
    setupSyncMocks(50, fullUrl);

    const adapter = new SteamAdapter();
    await adapter.syncUser({ externalId: '76561198000000001', userId: 'user-1' } as never);

    const values = (mockPrisma.$queryRaw.mock.calls[0]?.[0] as unknown as { values: unknown[] }).values;
    expect(values[5]).toBe(fullUrl); // iconUrl
    expect(values[5]).not.toContain('media.steampowered.com');
  });
});

// ─── SteamAdapter — F46 Fase 2: centinela recálculo XP y unlockedAt ──────────

describe('SteamAdapter — F46 Fase 2: recálculo de XP y centinela unlockedAt', () => {
  function setupSyncMocksFull(rarityPercent: number, unlocktime: number) {
    mockAxios.get.mockResolvedValueOnce({
      data: {
        response: {
          games: [{
            appid: 203160,
            name: 'Test Game',
            img_icon_url: 'icon123',
            has_community_visible_stats: true,
            playtime_forever: 100,
          }],
        },
      },
    });
    mockAxios.get.mockResolvedValueOnce({
      data: {
        playerstats: {
          success: true,
          achievements: [{ apiname: 'ACH_1', achieved: unlocktime > 0 ? 1 : 0, unlocktime }],
        },
      },
    });
    mockAxios.get.mockResolvedValueOnce({
      data: {
        game: {
          availableGameStats: {
            achievements: [{ name: 'ACH_1', displayName: 'Achievement 1', icon: '', icongray: '' }],
          },
        },
      },
    });
    mockAxios.get.mockResolvedValueOnce({
      data: {
        achievementpercentages: {
          achievements: [{ name: 'ACH_1', percent: rarityPercent }],
        },
      },
    });

    (mockPrisma.game.upsert as jest.Mock).mockResolvedValue({ id: 'game-1' } as never);
    // T114 — ver nota equivalente en el describe de rawValue/rarity/iconUrl más arriba.
    mockPrisma.$queryRaw.mockResolvedValue([{ id: 'ach-1', externalId: 'ACH_1' }] as never);
    mockPrisma.$executeRaw.mockResolvedValue(1 as never);
  }

  it('recalcula normalizedPoints con la rareza fresca de la API en cada sync (no reutiliza el valor viejo)', async () => {
    // Primer sync: rareza 50% → curva del helper
    setupSyncMocksFull(50, 0);
    const adapter = new SteamAdapter();
    await adapter.syncUser({ externalId: '76561198000000001', userId: 'user-1' } as never);

    const firstValues = (mockPrisma.$queryRaw.mock.calls[0]?.[0] as unknown as { values: unknown[] }).values;
    expect(firstValues[7]).toBe(normalizeAchievementPoints(50)); // normalizedPoints

    jest.clearAllMocks();
    process.env['STEAM_API_KEY'] = STEAM_API_KEY;
    mockPrisma.$executeRaw.mockResolvedValue(1 as never);

    // Segundo sync (re-sync): la rareza fluctuó a 2% — debe reflejar el valor NUEVO
    setupSyncMocksFull(2, 0);
    await adapter.syncUser({ externalId: '76561198000000001', userId: 'user-1' } as never);

    const secondValues = (mockPrisma.$queryRaw.mock.calls[0]?.[0] as unknown as { values: unknown[] }).values;
    expect(secondValues[7]).toBe(normalizeAchievementPoints(2));
    // Centinela: si el batch dejara de recalcular (p.ej. quedara pegado al valor del primer sync),
    // este valor sería igual al anterior en lugar de reflejar la nueva rareza.
    expect(secondValues[7]).not.toBe(firstValues[7]);
  });

  it('centinela: unlockedAt usa el timestamp de la API (unlocktime), nunca Date.now()', async () => {
    const fixedUnlockTime = 1_700_000_000; // 2023-11-14T22:13:20Z — fecha fija, distinta de "ahora"
    jest.useFakeTimers().setSystemTime(new Date('2026-07-08T12:00:00Z'));

    try {
      setupSyncMocksFull(50, fixedUnlockTime);
      const adapter = new SteamAdapter();
      await adapter.syncUser({ externalId: '76561198000000001', userId: 'user-1' } as never);

      // FASE 2 (UserAchievement) — orden de `.values`: [id, userId, achievementId, unlockedAt]
      const executeValues = (mockPrisma.$executeRaw.mock.calls[0]?.[0] as unknown as { values: unknown[] }).values;
      const expectedDate = new Date(fixedUnlockTime * 1000);

      // La fecha escrita es la de la plataforma, no la fecha "actual" del sync.
      expect(executeValues[3]).toEqual(expectedDate);
      expect((executeValues[3] as Date).getTime()).not.toBe(Date.now());
    } finally {
      jest.useRealTimers();
    }
  });

  it('centinela: dos syncs consecutivos con el mismo unlocktime producen el mismo unlockedAt (no avanza)', async () => {
    const fixedUnlockTime = 1_700_000_000;

    setupSyncMocksFull(50, fixedUnlockTime);
    const adapter = new SteamAdapter();
    await adapter.syncUser({ externalId: '76561198000000001', userId: 'user-1' } as never);
    const firstUnlockedAt = (mockPrisma.$executeRaw.mock.calls[0]?.[0] as unknown as { values: unknown[] }).values[3];

    jest.clearAllMocks();
    process.env['STEAM_API_KEY'] = STEAM_API_KEY;

    // Avanzamos el reloj del sistema para simular que el re-sync ocurre "más tarde"
    jest.useFakeTimers().setSystemTime(new Date('2030-01-01T00:00:00Z'));
    try {
      setupSyncMocksFull(50, fixedUnlockTime);
      await adapter.syncUser({ externalId: '76561198000000001', userId: 'user-1' } as never);
      const secondUnlockedAt = (mockPrisma.$executeRaw.mock.calls[0]?.[0] as unknown as { values: unknown[] }).values[3];

      expect(secondUnlockedAt).toEqual(firstUnlockedAt);
    } finally {
      jest.useRealTimers();
    }
  });
});

// ─── SteamAdapter — tope STEAM_MAX_GAMES_PER_SYNC ────────────────────────────

describe('SteamAdapter — tope STEAM_MAX_GAMES_PER_SYNC', () => {
  function makeGame(index: number, rtimeLastPlayed: number, playtime = 100) {
    return {
      appid: index + 1,
      name: `Game ${index + 1}`,
      img_icon_url: 'icon',
      has_community_visible_stats: true,
      playtime_forever: playtime,
      rtime_last_played: rtimeLastPlayed,
    };
  }

  // Respuesta combinada válida para PlayerAchievements, SchemaForGame y GlobalRarityPercentages.
  // Cada fetcher extrae solo el campo que le corresponde e ignora el resto.
  const perGameResponse = {
    data: {
      playerstats: {
        success: true,
        achievements: [{ apiname: 'ACH_1', achieved: 1, unlocktime: 1_000 }],
      },
      game: {
        availableGameStats: {
          achievements: [{ name: 'ACH_1', displayName: 'Ach', icon: '', icongray: '' }],
        },
      },
      achievementpercentages: { achievements: [{ name: 'ACH_1', percent: 10 }] },
    },
  };

  beforeEach(() => {
    // Reset completo de axios para evitar sangrado de implementaciones entre suites
    mockAxios.get.mockReset();
    (mockPrisma.game.upsert as jest.Mock).mockResolvedValue({ id: 'game-id' } as never);
    // T114 — ver nota equivalente en el describe de rawValue/rarity/iconUrl más arriba.
    mockPrisma.$queryRaw.mockResolvedValue([{ id: 'ach-id', externalId: 'ACH_1' }] as never);
    mockPrisma.$executeRaw.mockResolvedValue(1 as never);
  });

  afterEach(() => {
    // Limpieza de la implementación por defecto para no contaminar otras suites
    mockAxios.get.mockReset();
  });

  it('con ≤100 juegos elegibles, los sincroniza todos sin aplicar el tope', async () => {
    const games = Array.from({ length: 80 }, (_, i) => makeGame(i, 1_000 - i));
    mockAxios.get
      .mockResolvedValueOnce({ data: { response: { games } } })
      .mockResolvedValue(perGameResponse);

    const adapter = new SteamAdapter();
    const result = await adapter.syncUser({ externalId: '76561198000000001', userId: 'user-1' } as never);

    // Los 80 juegos deben procesarse — ninguno omitido
    expect(mockPrisma.game.upsert).toHaveBeenCalledTimes(80);
    expect(result.gamesUpdated).toBe(80);
  });

  it('con >100 juegos elegibles, sincroniza exactamente los 100 más recientes por rtime_last_played', async () => {
    // Juegos 0-99: jugados recientemente (rtime decreciente → el primero es el más reciente)
    // Juegos 100-149: nunca jugados (rtime = 0) → deben omitirse por el tope
    const games = [
      ...Array.from({ length: 100 }, (_, i) => makeGame(i, 1_000 - i)),
      ...Array.from({ length: 50 }, (_, i) => makeGame(100 + i, 0)),
    ];
    mockAxios.get
      .mockResolvedValueOnce({ data: { response: { games } } })
      .mockResolvedValue(perGameResponse);

    const adapter = new SteamAdapter();
    await adapter.syncUser({ externalId: '76561198000000001', userId: 'user-1' } as never);

    // Exactamente 100 juegos procesados (los de rtime > 0)
    expect(mockPrisma.game.upsert).toHaveBeenCalledTimes(100);

    // Los appids procesados deben ser los de los juegos con actividad (1-100), no los omitidos (101-150)
    const processedExternalIds = (mockPrisma.game.upsert as jest.Mock).mock.calls.map(
      (call: { create: { externalId: string } }[]) => call[0]!.create.externalId,
    );
    expect(processedExternalIds).toContain('1');
    expect(processedExternalIds).toContain('100');
    expect(processedExternalIds).not.toContain('101');
    expect(processedExternalIds).not.toContain('150');
  });

  it('el contador de llamadas a la Steam API solo incrementa para los juegos efectivamente sincronizados', async () => {
    // 150 juegos: 100 con actividad reciente (serán sincronizados), 50 sin actividad (omitidos)
    const games = [
      ...Array.from({ length: 100 }, (_, i) => makeGame(i, 1_000 - i)),
      ...Array.from({ length: 50 }, (_, i) => makeGame(100 + i, 0)),
    ];
    mockAxios.get
      .mockResolvedValueOnce({ data: { response: { games } } })
      .mockResolvedValue(perGameResponse);

    mockRedis.incr.mockClear();

    const adapter = new SteamAdapter();
    await adapter.syncUser({ externalId: '76561198000000001', userId: 'user-1' } as never);

    // 1 incr por GetOwnedGames + 3 incrs × 100 juegos procesados = 301
    // Si los 50 omitidos también contaran: 1 + 3 × 150 = 451
    expect(mockRedis.incr).toHaveBeenCalledTimes(301);
  });
});
