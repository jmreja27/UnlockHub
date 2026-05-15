import axios from 'axios';
import type { PlatformAccount } from '@prisma/client';

// Mocks — se deben declarar antes de los imports del módulo bajo prueba
jest.mock('axios');
jest.mock('../lib/redis', () => ({
  redis: {
    get: jest.fn(),
    set: jest.fn(),
    setex: jest.fn(),
  },
}));
jest.mock('../lib/prisma', () => ({
  prisma: {
    game: {
      upsert: jest.fn(),
    },
    achievement: {
      upsert: jest.fn(),
    },
    userAchievement: {
      upsert: jest.fn(),
    },
    platformAccount: {
      update: jest.fn(),
    },
  },
}));
jest.mock('../lib/crypto', () => ({
  decrypt: jest.fn((token: string) => token), // Devuelve el token tal cual en tests
}));

import { redis } from '../lib/redis';
import { prisma } from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';

import { retroAchievementsAdapter } from './retroachievements.adapter';

const mockAxios = axios as jest.Mocked<typeof axios>;
const mockRedis = redis as jest.Mocked<typeof redis>;
const mockPrisma = prisma as jest.Mocked<typeof prisma>;

// ─── Datos de prueba ─────────────────────────────────────────────────────────

const GAME_ID = '1234';
const USERNAME = 'testuser';
const API_KEY = 'testapikey';
const EXTERNAL_ID = `${USERNAME}:${GAME_ID}`;

const mockRaGameProgress = {
  ID: 1234,
  Title: 'Sonic the Hedgehog',
  ImageIcon: '/Images/001234.png',
  NumAchievements: 3,
  Achievements: {
    '101': {
      ID: 101,
      Title: 'Ring Collector',
      Description: 'Collect 100 rings',
      BadgeName: 'badge101',
      Points: 5,
      TrueRatio: 8,
      DateEarned: '2024-01-15 10:30:00',
      DateEarnedHardcore: null,
    },
    '102': {
      ID: 102,
      Title: 'Speed Demon',
      Description: 'Finish act in under 1 minute',
      BadgeName: 'badge102',
      Points: 150, // Mayor que 100 — debe normalizarse a 100
      TrueRatio: 200,
      DateEarned: null,
      DateEarnedHardcore: null,
    },
    '103': {
      ID: 103,
      Title: 'First Steps',
      Description: 'Start the game',
      BadgeName: 'badge103',
      Points: 0, // Menor que 1 — debe normalizarse a 1
      TrueRatio: 0,
      DateEarned: '2024-01-14 09:00:00',
      DateEarnedHardcore: null,
    },
  },
};

const mockPlatformAccount: PlatformAccount = {
  id: 'account-1',
  userId: 'user-1',
  platform: 'RA',
  externalId: USERNAME,
  username: USERNAME,
  encryptedToken: API_KEY,
  lastSyncedAt: null,
  syncCooldownUntil: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

// ─── Setup ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  process.env['ENCRYPTION_KEY'] = '0'.repeat(64);
  process.env['RA_SYSTEM_USER'] = 'systemuser';
  process.env['RA_SYSTEM_KEY'] = 'systemkey';

  // Por defecto Redis no tiene nada en caché
  mockRedis.get.mockResolvedValue(null);
  mockRedis.set.mockResolvedValue('OK');
  mockRedis.setex.mockResolvedValue('OK');
});

// ─── Tests de getUserAchievements ─────────────────────────────────────────────

describe('retroAchievementsAdapter.getUserAchievements', () => {
  it('devuelve logros normalizados cuando la API responde correctamente', async () => {
    mockAxios.get.mockResolvedValue({ data: mockRaGameProgress });

    const achievements = await retroAchievementsAdapter.getUserAchievements(EXTERNAL_ID, API_KEY);

    expect(achievements).toHaveLength(3);

    // Verificar que todos tienen platform: RA
    expect(achievements.every((a) => a.platform === 'RA')).toBe(true);

    // Verificar logro con puntos normales
    const ringCollector = achievements.find((a) => a.externalId === '101');
    expect(ringCollector).toBeDefined();
    expect(ringCollector?.normalizedPoints).toBe(5);
    expect(ringCollector?.title).toBe('Ring Collector');
    expect(ringCollector?.iconUrl).toContain('badge101');

    // Verificar que se guardó en caché
    expect(mockRedis.setex).toHaveBeenCalled();
  });

  it('usa la caché Redis si existe y no llama a la API', async () => {
    const cachedAchievements = [
      {
        id: '',
        gameId: GAME_ID,
        platform: 'RA',
        externalId: '101',
        title: 'Ring Collector (cached)',
        description: null,
        iconUrl: null,
        rawValue: 5,
        normalizedPoints: 5,
        rarity: null,
        externalUrl: null,
      },
    ];
    // Simular que la clave principal existe en Redis (datos frescos)
    mockRedis.get.mockImplementation((key: string) => {
      if (key === `ra:game:${GAME_ID}:${USERNAME}`) {
        return Promise.resolve(JSON.stringify(cachedAchievements));
      }
      return Promise.resolve(null);
    });

    const achievements = await retroAchievementsAdapter.getUserAchievements(EXTERNAL_ID, API_KEY);

    expect(achievements).toEqual(cachedAchievements);
    expect(mockAxios.get).not.toHaveBeenCalled();
  });

  it('devuelve caché stale aunque haya expirado si la API falla', async () => {
    const staleAchievements = [
      {
        id: '',
        gameId: GAME_ID,
        platform: 'RA',
        externalId: '101',
        title: 'Ring Collector (stale)',
        description: null,
        iconUrl: null,
        rawValue: 5,
        normalizedPoints: 5,
        rarity: null,
        externalUrl: null,
      },
    ];

    // La clave principal (con TTL) ya expiró → null, pero la stale existe
    mockRedis.get.mockImplementation((key: string) => {
      if (key === `ra:game:${GAME_ID}:${USERNAME}:stale`) {
        return Promise.resolve(JSON.stringify(staleAchievements));
      }
      return Promise.resolve(null);
    });

    // La API falla
    mockAxios.get.mockRejectedValue(new Error('Connection timeout'));

    const achievements = await retroAchievementsAdapter.getUserAchievements(EXTERNAL_ID, API_KEY);

    expect(achievements).toEqual(staleAchievements);
  });

  it('lanza RA_API_ERROR si la API falla y no hay ningún dato en caché', async () => {
    // Sin datos en caché (ni frescos ni stale)
    mockRedis.get.mockResolvedValue(null);
    // La API falla
    mockAxios.get.mockRejectedValue(new Error('Service unavailable'));

    await expect(
      retroAchievementsAdapter.getUserAchievements(EXTERNAL_ID, API_KEY),
    ).rejects.toMatchObject({
      code: 'RA_API_ERROR',
      statusCode: 502,
    });
  });

  it('lanza RA_API_ERROR como instancia de AppError', async () => {
    mockRedis.get.mockResolvedValue(null);
    mockAxios.get.mockRejectedValue(new Error('Network error'));

    const error = await retroAchievementsAdapter
      .getUserAchievements(EXTERNAL_ID, API_KEY)
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(AppError);
  });
});

// ─── Tests de normalización de puntos ─────────────────────────────────────────

describe('normalización de puntos (via getUserAchievements)', () => {
  it('Points=5 → normalizedPoints=5', async () => {
    mockAxios.get.mockResolvedValue({ data: mockRaGameProgress });

    const achievements = await retroAchievementsAdapter.getUserAchievements(EXTERNAL_ID, API_KEY);

    const ach = achievements.find((a) => a.externalId === '101');
    expect(ach?.normalizedPoints).toBe(5);
    expect(ach?.rawValue).toBe(5);
  });

  it('Points=150 → normalizedPoints=100 (capped al máximo)', async () => {
    mockAxios.get.mockResolvedValue({ data: mockRaGameProgress });

    const achievements = await retroAchievementsAdapter.getUserAchievements(EXTERNAL_ID, API_KEY);

    const ach = achievements.find((a) => a.externalId === '102');
    expect(ach?.normalizedPoints).toBe(100);
    expect(ach?.rawValue).toBe(150);
  });

  it('Points=0 → normalizedPoints=1 (mínimo garantizado)', async () => {
    mockAxios.get.mockResolvedValue({ data: mockRaGameProgress });

    const achievements = await retroAchievementsAdapter.getUserAchievements(EXTERNAL_ID, API_KEY);

    const ach = achievements.find((a) => a.externalId === '103');
    expect(ach?.normalizedPoints).toBe(1);
    expect(ach?.rawValue).toBe(0);
  });

  it('Points=undefined → normalizedPoints=1 (fallback al mínimo)', async () => {
    const dataWithUndefinedPoints = {
      ...mockRaGameProgress,
      Achievements: {
        '999': {
          ID: 999,
          Title: 'Sin puntos',
          BadgeName: 'badge999',
          // Points no definido
        },
      },
    };
    mockAxios.get.mockResolvedValue({ data: dataWithUndefinedPoints });

    const achievements = await retroAchievementsAdapter.getUserAchievements(EXTERNAL_ID, API_KEY);

    expect(achievements[0]?.normalizedPoints).toBe(1);
  });
});

// ─── Tests de getGameInfo ──────────────────────────────────────────────────────

describe('retroAchievementsAdapter.getGameInfo', () => {
  const mockGameData = {
    ID: GAME_ID,
    Title: 'Sonic the Hedgehog',
    ImageIcon: '/Images/001234.png',
    NumAchievements: 10,
  };

  it('devuelve información del juego correctamente formateada', async () => {
    mockAxios.get.mockResolvedValue({ data: mockGameData });

    const game = await retroAchievementsAdapter.getGameInfo(GAME_ID);

    expect(game.platform).toBe('RA');
    expect(game.externalId).toBe(GAME_ID);
    expect(game.title).toBe('Sonic the Hedgehog');
    expect(game.iconUrl).toContain('retroachievements.org');
    expect(game.totalAchievements).toBe(10);
  });

  it('usa caché si existe y no llama a la API', async () => {
    const cachedGame = {
      id: 'game-1',
      platform: 'RA',
      externalId: GAME_ID,
      title: 'Cached Game',
      iconUrl: null,
      headerUrl: null,
      totalAchievements: 5,
    };
    mockRedis.get.mockImplementation((key: string) => {
      if (key === `ra:gameinfo:${GAME_ID}`) {
        return Promise.resolve(JSON.stringify(cachedGame));
      }
      return Promise.resolve(null);
    });

    const game = await retroAchievementsAdapter.getGameInfo(GAME_ID);

    expect(game).toEqual(cachedGame);
    expect(mockAxios.get).not.toHaveBeenCalled();
  });

  it('devuelve caché stale si la API falla', async () => {
    const staleGame = {
      id: '',
      platform: 'RA',
      externalId: GAME_ID,
      title: 'Stale Game',
      iconUrl: null,
      headerUrl: null,
      totalAchievements: 3,
    };
    mockRedis.get.mockImplementation((key: string) => {
      if (key === `ra:gameinfo:${GAME_ID}:stale`) {
        return Promise.resolve(JSON.stringify(staleGame));
      }
      return Promise.resolve(null);
    });
    mockAxios.get.mockRejectedValue(new Error('API unavailable'));

    const game = await retroAchievementsAdapter.getGameInfo(GAME_ID);

    expect(game.title).toBe('Stale Game');
  });

  it('lanza RA_API_ERROR si la API falla y no hay caché', async () => {
    mockRedis.get.mockResolvedValue(null);
    mockAxios.get.mockRejectedValue(new Error('Network error'));

    await expect(retroAchievementsAdapter.getGameInfo(GAME_ID)).rejects.toMatchObject({
      code: 'RA_API_ERROR',
      statusCode: 502,
    });
  });
});

// ─── Tests de syncUser ────────────────────────────────────────────────────────

describe('retroAchievementsAdapter.syncUser', () => {
  const mockCompletedGames = [
    {
      GameID: 1234,
      Title: 'Sonic the Hedgehog',
      ImageIcon: '/Images/001234.png',
      NumAwarded: 2,
      NumAchievements: 3,
    },
  ];

  const mockDbGame = {
    id: 'db-game-1',
    platform: 'RA',
    externalId: '1234',
    title: 'Sonic the Hedgehog',
    iconUrl: null,
    headerUrl: null,
    totalAchievements: 3,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockDbAchievement = {
    id: 'db-ach-1',
    gameId: 'db-game-1',
    platform: 'RA',
    externalId: '101',
    title: 'Ring Collector',
    description: null,
    iconUrl: null,
    rawValue: 5,
    normalizedPoints: 5,
    rarity: null,
    externalUrl: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    mockPrisma.game.upsert.mockResolvedValue(mockDbGame as never);
    mockPrisma.achievement.upsert.mockResolvedValue(mockDbAchievement as never);
    mockPrisma.userAchievement.upsert.mockResolvedValue({} as never);
    mockPrisma.platformAccount.update.mockResolvedValue({} as never);
  });

  it('sincroniza correctamente y devuelve SyncResult', async () => {
    // Primera llamada: GetUserCompletedGames
    // Segunda llamada: GetGameInfoAndUserProgress
    mockAxios.get
      .mockResolvedValueOnce({ data: mockCompletedGames })
      .mockResolvedValueOnce({ data: mockRaGameProgress });

    const result = await retroAchievementsAdapter.syncUser(mockPlatformAccount);

    expect(result.platform).toBe('RA');
    expect(result.gamesUpdated).toBe(1);
    // Logros desbloqueados: 101 (DateEarned set) y 103 (DateEarned set), 102 no
    expect(result.achievementsSynced).toBe(2);
    expect(result.syncedAt).toBeTruthy();
  });

  it('actualiza la fecha de última sincronización en la cuenta', async () => {
    mockAxios.get
      .mockResolvedValueOnce({ data: mockCompletedGames })
      .mockResolvedValueOnce({ data: mockRaGameProgress });

    await retroAchievementsAdapter.syncUser(mockPlatformAccount);

    expect(mockPrisma.platformAccount.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: mockPlatformAccount.id },
        data: expect.objectContaining({ lastSyncedAt: expect.any(Date) }),
      }),
    );
  });

  it('usa caché stale de juegos completados si la API falla en el primer paso', async () => {
    const staleGames = [
      { GameID: 1234, Title: 'Sonic (stale)', NumAchievements: 1 },
    ];
    mockRedis.get.mockImplementation((key: string) => {
      if (key === `ra:completed:${USERNAME}:stale`) {
        return Promise.resolve(JSON.stringify(staleGames));
      }
      return Promise.resolve(null);
    });

    // Primera llamada a la API falla (GetUserCompletedGames)
    // Segunda llamada tiene éxito (GetGameInfoAndUserProgress)
    mockAxios.get
      .mockRejectedValueOnce(new Error('RA API down'))
      .mockResolvedValueOnce({
        data: {
          ID: 1234,
          Title: 'Sonic (stale)',
          Achievements: {},
        },
      });

    const result = await retroAchievementsAdapter.syncUser(mockPlatformAccount);

    expect(result.platform).toBe('RA');
    // Con caché stale se debe continuar la sync
    expect(result.gamesUpdated).toBeGreaterThanOrEqual(0);
  });

  it('lanza RA_API_ERROR si la primera llamada falla y no hay caché', async () => {
    mockRedis.get.mockResolvedValue(null);
    mockAxios.get.mockRejectedValue(new Error('Timeout'));

    await expect(
      retroAchievementsAdapter.syncUser(mockPlatformAccount),
    ).rejects.toMatchObject({
      code: 'RA_API_ERROR',
      statusCode: 502,
    });
  });

  it('solo registra UserAchievement para logros con DateEarned no nulo', async () => {
    mockAxios.get
      .mockResolvedValueOnce({ data: mockCompletedGames })
      .mockResolvedValueOnce({ data: mockRaGameProgress });

    await retroAchievementsAdapter.syncUser(mockPlatformAccount);

    // El logro 102 no tiene DateEarned → no debe crear UserAchievement
    // Los logros 101 y 103 sí → 2 upserts de UserAchievement
    expect(mockPrisma.userAchievement.upsert).toHaveBeenCalledTimes(2);
  });
});

// ─── Tests del campo platform ─────────────────────────────────────────────────

describe('retroAchievementsAdapter.platform', () => {
  it('tiene platform igual a "RA"', () => {
    expect(retroAchievementsAdapter.platform).toBe('RA');
  });
});
