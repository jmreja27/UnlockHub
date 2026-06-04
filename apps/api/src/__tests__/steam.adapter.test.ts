import axios from 'axios';

jest.mock('axios');
jest.mock('../lib/redis', () => ({
  redis: { get: jest.fn().mockResolvedValue(null), setex: jest.fn() },
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

const mockPrisma = prisma as jest.Mocked<typeof prisma>;

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
