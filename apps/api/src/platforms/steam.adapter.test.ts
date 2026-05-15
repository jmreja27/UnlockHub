import axios from 'axios';

import { SteamAdapter } from './steam.adapter';

import { AppError } from '../middleware/errorHandler';

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('axios');
jest.mock('../lib/redis', () => ({
  redis: {
    get: jest.fn(),
    setex: jest.fn(),
  },
}));
jest.mock('../lib/prisma', () => ({ prisma: {} }));
jest.mock('../lib/crypto', () => ({
  decrypt: jest.fn((val: string) => val),
}));

const mockedAxios = axios as jest.Mocked<typeof axios>;

// Importar el mock de Redis para poder controlarlo en los tests
import { redis } from '../lib/redis';
const mockedRedis = redis as jest.Mocked<typeof redis>;

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const STEAM_ID = '76561198000000001';
const API_KEY = 'fake-steam-api-key';
const steamGame = {
  appid: 730,
  name: 'Counter-Strike: Global Offensive',
  img_icon_url: 'some-icon-hash',
  has_community_visible_stats: true,
};

const playerAchievements = [
  { apiname: 'ACH_WIN_PISTOLROUND', achieved: 1, unlocktime: 1700000000 },
  { apiname: 'ACH_WIN_MAP_DE_DUST2', achieved: 0, unlocktime: 0 },
];

const schemaAchievements = [
  {
    name: 'ACH_WIN_PISTOLROUND',
    displayName: 'Pistol Round Winner',
    description: 'Win a pistol round',
    icon: 'icon_pistol',
    icongray: 'icon_pistol_gray',
  },
  {
    name: 'ACH_WIN_MAP_DE_DUST2',
    displayName: 'Dust2 Victor',
    description: 'Win on Dust2',
    icon: 'icon_dust2',
    icongray: 'icon_dust2_gray',
  },
];

const rarityPercentages = [
  { name: 'ACH_WIN_PISTOLROUND', percent: 50 },
  { name: 'ACH_WIN_MAP_DE_DUST2', percent: 0 },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Configura axios.get para devolver respuestas de Steam en el orden
 * en que serán llamadas por getUserAchievements:
 * 1. GetOwnedGames
 * 2. GetPlayerAchievements (por juego)
 * 3. GetSchemaForGame (por juego)
 * 4. GetGlobalAchievementPercentagesForApp (por juego)
 */
function setupAxiosMocksNoCache(): void {
  mockedRedis.get.mockResolvedValue(null);
  mockedRedis.setex.mockResolvedValue('OK');

  mockedAxios.get
    // GetOwnedGames
    .mockResolvedValueOnce({
      data: { response: { games: [steamGame] } },
    })
    // GetPlayerAchievements
    .mockResolvedValueOnce({
      data: {
        playerstats: {
          success: true,
          achievements: playerAchievements,
        },
      },
    })
    // GetSchemaForGame
    .mockResolvedValueOnce({
      data: {
        game: {
          availableGameStats: {
            achievements: schemaAchievements,
          },
        },
      },
    })
    // GetGlobalAchievementPercentagesForApp
    .mockResolvedValueOnce({
      data: {
        achievementpercentages: {
          achievements: rarityPercentages,
        },
      },
    });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  mockedAxios.isAxiosError = jest.fn().mockReturnValue(false);
});

describe('SteamAdapter.getUserAchievements', () => {
  let adapter: SteamAdapter;

  beforeEach(() => {
    adapter = new SteamAdapter();
  });

  it('devuelve los logros normalizados del usuario cuando no hay caché', async () => {
    setupAxiosMocksNoCache();

    const achievements = await adapter.getUserAchievements(STEAM_ID, API_KEY);

    // Se devuelven todos los logros del juego (no solo los desbloqueados)
    expect(achievements).toHaveLength(2);

    const pistol = achievements.find((a) => a.externalId === 'ACH_WIN_PISTOLROUND');
    expect(pistol).toBeDefined();
    expect(pistol?.title).toBe('Pistol Round Winner');
    expect(pistol?.platform).toBe('STEAM');
    // rareza 50% → normalizedPoints = round((1 - 50/100) * 100) = 50
    expect(pistol?.normalizedPoints).toBe(50);
    expect(pistol?.rarity).toBe(50);
  });

  it('usa la caché de Redis cuando existe y no llama a la API', async () => {
    // Simular que todos los datos están en caché
    mockedRedis.get
      // GetOwnedGames cache hit
      .mockResolvedValueOnce(JSON.stringify([steamGame]))
      // GetPlayerAchievements cache hit
      .mockResolvedValueOnce(JSON.stringify(playerAchievements))
      // GetSchemaForGame cache hit
      .mockResolvedValueOnce(JSON.stringify(schemaAchievements))
      // GetGlobalAchievementPercentagesForApp cache hit
      .mockResolvedValueOnce(JSON.stringify(rarityPercentages));

    const achievements = await adapter.getUserAchievements(STEAM_ID, API_KEY);

    // No debe haberse llamado a la API de Steam
    expect(mockedAxios.get).not.toHaveBeenCalled();
    expect(achievements).toHaveLength(2);
  });

  it('lanza AppError con código STEAM_API_ERROR si el perfil es privado (games undefined)', async () => {
    mockedRedis.get.mockResolvedValue(null);
    mockedRedis.setex.mockResolvedValue('OK');

    // Steam devuelve respuesta vacía cuando el perfil es privado
    mockedAxios.get.mockResolvedValueOnce({
      data: { response: {} }, // sin "games"
    });

    await expect(adapter.getUserAchievements(STEAM_ID, API_KEY)).rejects.toMatchObject({
      code: 'STEAM_API_ERROR',
      statusCode: 502,
    });

    expect(mockedAxios.get).toHaveBeenCalledTimes(1);
  });

  it('lanza AppError con código STEAM_API_ERROR si la petición devuelve 403', async () => {
    mockedRedis.get.mockResolvedValue(null);
    mockedRedis.setex.mockResolvedValue('OK');

    // Primer mock: GetOwnedGames tiene éxito
    mockedAxios.get
      .mockResolvedValueOnce({ data: { response: { games: [steamGame] } } })
      // Segundo mock: GetPlayerAchievements devuelve 403
      .mockRejectedValueOnce({ response: { status: 403 }, isAxiosError: true });

    // isAxiosError debe devolver true para el error 403
    mockedAxios.isAxiosError = jest.fn().mockReturnValue(true);

    // También necesitamos los mocks de schema y rarity para que se llamen en paralelo
    mockedAxios.get
      .mockResolvedValueOnce({ data: { game: { availableGameStats: { achievements: [] } } } })
      .mockResolvedValueOnce({ data: { achievementpercentages: { achievements: [] } } });

    await expect(adapter.getUserAchievements(STEAM_ID, API_KEY)).rejects.toMatchObject({
      code: 'STEAM_API_ERROR',
      statusCode: 502,
    });
  });
});

describe('Normalización de puntos (normalizePoints)', () => {
  let adapter: SteamAdapter;

  beforeEach(() => {
    adapter = new SteamAdapter();
  });

  // Probamos la normalización indirectamente a través de getUserAchievements

  const buildMocksWithRarity = (rarityPercent: number): void => {
    mockedRedis.get.mockResolvedValue(null);
    mockedRedis.setex.mockResolvedValue('OK');

    const singleAchievement = [{ apiname: 'ACH_TEST', achieved: 1, unlocktime: 1700000000 }];
    const singleSchema = [
      { name: 'ACH_TEST', displayName: 'Test', description: '', icon: '', icongray: '' },
    ];
    const singleRarity = [{ name: 'ACH_TEST', percent: rarityPercent }];

    mockedAxios.get
      .mockResolvedValueOnce({ data: { response: { games: [steamGame] } } })
      .mockResolvedValueOnce({ data: { playerstats: { success: true, achievements: singleAchievement } } })
      .mockResolvedValueOnce({ data: { game: { availableGameStats: { achievements: singleSchema } } } })
      .mockResolvedValueOnce({ data: { achievementpercentages: { achievements: singleRarity } } });
  };

  it('rareza 0% → 100 puntos (logro extremadamente raro)', async () => {
    buildMocksWithRarity(0);
    const achievements = await adapter.getUserAchievements(STEAM_ID, API_KEY);
    expect(achievements[0]?.normalizedPoints).toBe(100);
  });

  it('rareza 100% → 1 punto mínimo (logro trivial)', async () => {
    buildMocksWithRarity(100);
    const achievements = await adapter.getUserAchievements(STEAM_ID, API_KEY);
    expect(achievements[0]?.normalizedPoints).toBe(1);
  });

  it('rareza 50% → 50 puntos (logro de dificultad media)', async () => {
    buildMocksWithRarity(50);
    const achievements = await adapter.getUserAchievements(STEAM_ID, API_KEY);
    expect(achievements[0]?.normalizedPoints).toBe(50);
  });

  it('rareza 99% → 1 punto mínimo (nunca menos de 1)', async () => {
    buildMocksWithRarity(99);
    const achievements = await adapter.getUserAchievements(STEAM_ID, API_KEY);
    // round((1 - 99/100) * 100) = round(1) = 1, ya en el mínimo
    expect(achievements[0]?.normalizedPoints).toBe(1);
  });

  it('rareza 25% → 75 puntos', async () => {
    buildMocksWithRarity(25);
    const achievements = await adapter.getUserAchievements(STEAM_ID, API_KEY);
    expect(achievements[0]?.normalizedPoints).toBe(75);
  });
});

describe('SteamAdapter.platform', () => {
  it('tiene platform = STEAM', () => {
    const adapter = new SteamAdapter();
    expect(adapter.platform).toBe('STEAM');
  });
});

describe('AppError', () => {
  it('es instancia de Error con los campos correctos', () => {
    const err = new AppError('Test error', 'STEAM_API_ERROR', 502, { detail: 'x' });
    expect(err).toBeInstanceOf(Error);
    expect(err.code).toBe('STEAM_API_ERROR');
    expect(err.statusCode).toBe(502);
    expect(err.details).toEqual({ detail: 'x' });
  });
});
