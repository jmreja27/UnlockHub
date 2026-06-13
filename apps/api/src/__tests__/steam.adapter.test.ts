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
  },
}));

const mockAxios = axios as jest.Mocked<typeof axios>;

import { resolveVanityUrl, checkSteamProfilePublic, SteamAdapter } from '../platforms/steam.adapter';
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

    mockPrisma.game.upsert.mockResolvedValue({ id: 'game-1' } as never);
    mockPrisma.achievement.upsert.mockResolvedValue({ id: 'ach-1' } as never);
  }

  it('convierte rawValue y rarity a Float cuando la API devuelve string numérico', async () => {
    setupSyncMocks('54.6', 'icon1');

    const adapter = new SteamAdapter();
    await adapter.syncUser({ externalId: '76561198000000001', userId: 'user-1' } as never);

    const upsertCall = mockPrisma.achievement.upsert.mock.calls[0]?.[0];
    expect(typeof upsertCall.create.rawValue).toBe('number');
    expect(upsertCall.create.rawValue).toBe(54.6);
    expect(upsertCall.create.rarity).toBe(54.6);
    expect(upsertCall.update.rawValue).toBe(54.6);
    expect(upsertCall.update.rarity).toBe(54.6);
  });

  it('rawValue y rarity son null cuando la API devuelve valor no numérico', async () => {
    setupSyncMocks('N/A', 'icon1');

    const adapter = new SteamAdapter();
    await adapter.syncUser({ externalId: '76561198000000001', userId: 'user-1' } as never);

    const upsertCall = mockPrisma.achievement.upsert.mock.calls[0]?.[0];
    expect(upsertCall.create.rawValue).toBeNull();
    expect(upsertCall.create.rarity).toBeNull();
    expect(upsertCall.update.rawValue).toBeNull();
    expect(upsertCall.update.rarity).toBeNull();
  });

  it('iconUrl no se duplica cuando la API devuelve una URL completa en el schema', async () => {
    const fullUrl = 'https://steamcdn-a.akamaihd.net/steamcommunity/public/images/apps/203160/abc123.jpg';
    setupSyncMocks(50, fullUrl);

    const adapter = new SteamAdapter();
    await adapter.syncUser({ externalId: '76561198000000001', userId: 'user-1' } as never);

    const upsertCall = mockPrisma.achievement.upsert.mock.calls[0]?.[0];
    expect(upsertCall.create.iconUrl).toBe(fullUrl);
    expect(upsertCall.create.iconUrl).not.toContain('media.steampowered.com');
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
    mockPrisma.game.upsert.mockResolvedValue({ id: 'game-id' } as never);
    mockPrisma.achievement.upsert.mockResolvedValue({ id: 'ach-id' } as never);
    mockPrisma.userAchievement.upsert.mockResolvedValue({} as never);
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
    const processedExternalIds = mockPrisma.game.upsert.mock.calls.map(
      (call) => call[0].create.externalId as string,
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
