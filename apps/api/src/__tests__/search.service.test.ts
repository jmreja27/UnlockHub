jest.mock('../lib/prisma', () => ({
  prisma: {
    game: { findMany: jest.fn(), findUnique: jest.fn(), upsert: jest.fn() },
    user: { findMany: jest.fn() },
    achievement: { findMany: jest.fn() },
    userAchievement: { findMany: jest.fn() },
  },
}));

jest.mock('../lib/redis', () => ({
  redis: { get: jest.fn(), set: jest.fn() },
}));

// Mock de fetch global para las llamadas a Steam Store API
const mockFetch = jest.fn();
global.fetch = mockFetch;

import { search, getGameWithAchievements, getGameAchievementsWithStatus } from '../services/search.service';
import { prisma } from '../lib/prisma';
import { redis } from '../lib/redis';

const mockGameFindMany = prisma.game.findMany as jest.Mock;
const mockGameFindUnique = prisma.game.findUnique as jest.Mock;
const mockGameUpsert = prisma.game.upsert as jest.Mock;
const mockUserFindMany = prisma.user.findMany as jest.Mock;
const mockAchievementFindMany = prisma.achievement.findMany as jest.Mock;
const mockUserAchievementFindMany = prisma.userAchievement.findMany as jest.Mock;
const mockRedisGet = redis.get as jest.Mock;
const mockRedisSet = redis.set as jest.Mock;

const makeLocalGame = (overrides = {}) => ({
  id: 'g1',
  externalId: '220',
  platform: 'STEAM',
  title: 'Half-Life 2',
  iconUrl: 'https://cdn.example.com/hl2.jpg',
  totalAchievements: 20,
  ...overrides,
});

const makeUser = (overrides = {}) => ({
  id: 'u1', username: 'gamer_pro', avatar: null, level: 5, xp: 1200,
  ...overrides,
});

const makeSteamApiResponse = (items: Array<{ id: number; name: string; tiny_image: string }>) => ({
  ok: true,
  json: async () => ({ total: items.length, items }),
});

const makeAchievement = (overrides = {}) => ({
  id: 'ach1',
  title: 'First Steps',
  description: 'Complete the first level',
  iconUrl: null,
  rarity: 42.5,
  normalizedPoints: 10,
  platform: 'STEAM',
  externalId: 'ach_001',
  externalUrl: null,
  game: { id: 'g1', title: 'Half-Life 2', iconUrl: null },
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();
  mockRedisGet.mockResolvedValue(null);
  mockRedisSet.mockResolvedValue('OK');
  mockFetch.mockResolvedValue(makeSteamApiResponse([]));
  mockAchievementFindMany.mockResolvedValue([]);
  mockUserAchievementFindMany.mockResolvedValue([]);
});

// ─── DB local con suficientes resultados (≥ 10) ───────────────────────────────

describe('search — DB local con suficientes resultados', () => {
  it('no llama a Steam API si hay ≥ 10 resultados locales', async () => {
    const tenGames = Array.from({ length: 10 }, (_, i) =>
      makeLocalGame({ id: `g${i}`, externalId: `${i}`, title: `Game ${i}` }),
    );
    mockGameFindMany.mockResolvedValue(tenGames);
    mockUserFindMany.mockResolvedValue([]);

    await search('game', 'games');

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('devuelve los resultados locales directamente', async () => {
    const tenGames = Array.from({ length: 10 }, (_, i) =>
      makeLocalGame({ id: `g${i}`, externalId: `${i}`, title: `Game ${i}` }),
    );
    mockGameFindMany.mockResolvedValue(tenGames);
    mockUserFindMany.mockResolvedValue([]);

    const result = await search('game', 'games');

    expect(result.games).toHaveLength(10);
    expect(result.games[0]?.type).toBe('game');
  });
});

// ─── DB local con pocos resultados (< 10) ─────────────────────────────────────

describe('search — DB local con pocos resultados (fallback a Steam API)', () => {
  it('llama a Steam API cuando hay < 10 resultados locales', async () => {
    mockGameFindMany.mockResolvedValue([makeLocalGame()]);
    mockGameUpsert.mockResolvedValue(makeLocalGame({ id: 'g-ext', externalId: '400', title: 'Portal' }));
    mockFetch.mockResolvedValue(
      makeSteamApiResponse([{ id: 400, name: 'Portal', tiny_image: 'https://cdn.steam.com/portal.jpg' }]),
    );

    await search('portal', 'games');

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('storesearch'),
      expect.any(Object),
    );
  });

  it('deduplica: no upsertea juegos que ya existen en DB local', async () => {
    // g1 tiene externalId '220' — mismo que devuelve Steam
    mockGameFindMany.mockResolvedValue([makeLocalGame({ externalId: '220' })]);
    mockFetch.mockResolvedValue(
      makeSteamApiResponse([{ id: 220, name: 'Half-Life 2', tiny_image: '' }]),
    );

    await search('half-life', 'games');

    expect(mockGameUpsert).not.toHaveBeenCalled();
  });

  it('upsertea juegos nuevos de Steam como registros shell', async () => {
    mockGameFindMany.mockResolvedValue([]);
    mockGameUpsert.mockResolvedValue(makeLocalGame({ id: 'g-ext', externalId: '400', title: 'Portal', totalAchievements: 0 }));
    mockFetch.mockResolvedValue(
      makeSteamApiResponse([{ id: 400, name: 'Portal', tiny_image: 'https://cdn.steam.com/portal.jpg' }]),
    );

    await search('portal', 'games');

    expect(mockGameUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { platform_externalId: { platform: 'STEAM', externalId: '400' } },
        create: expect.objectContaining({ platform: 'STEAM', externalId: '400', title: 'Portal' }),
      }),
    );
  });

  it('combina resultados locales y externos en la respuesta', async () => {
    mockGameFindMany.mockResolvedValue([makeLocalGame({ id: 'local-1' })]);
    mockGameUpsert.mockResolvedValue(makeLocalGame({ id: 'ext-1', externalId: '400', title: 'Portal' }));
    mockFetch.mockResolvedValue(
      makeSteamApiResponse([{ id: 400, name: 'Portal', tiny_image: '' }]),
    );

    const result = await search('p', 'games');

    expect(result.games).toHaveLength(2);
    expect(result.games.map((g) => g.id)).toContain('local-1');
    expect(result.games.map((g) => g.id)).toContain('ext-1');
  });

  it('si Steam API falla, devuelve solo resultados locales sin error', async () => {
    mockGameFindMany.mockResolvedValue([makeLocalGame()]);
    mockFetch.mockRejectedValue(new Error('Network error'));

    const result = await search('portal', 'games');

    expect(result.games).toHaveLength(1);
  });

  it('si Steam API devuelve !ok, devuelve solo resultados locales', async () => {
    mockGameFindMany.mockResolvedValue([makeLocalGame()]);
    mockFetch.mockResolvedValue({ ok: false, json: async () => ({}) });

    const result = await search('portal', 'games');

    expect(result.games).toHaveLength(1);
    expect(mockGameUpsert).not.toHaveBeenCalled();
  });
});

// ─── Caché Redis ──────────────────────────────────────────────────────────────

describe('search — caché Redis para resultados de Steam', () => {
  it('usa caché Redis si existe, no llama a fetch', async () => {
    const cached = JSON.stringify([{ steamId: '400', title: 'Portal', iconUrl: null }]);
    mockRedisGet.mockResolvedValue(cached);
    mockGameFindMany.mockResolvedValue([]);
    mockGameUpsert.mockResolvedValue(makeLocalGame({ id: 'g-ext', externalId: '400', title: 'Portal', totalAchievements: 0 }));

    await search('portal', 'games');

    expect(mockFetch).not.toHaveBeenCalled();
    expect(mockGameUpsert).toHaveBeenCalled();
  });

  it('guarda resultado en Redis tras llamar a Steam API', async () => {
    mockGameFindMany.mockResolvedValue([]);
    mockGameUpsert.mockResolvedValue(makeLocalGame({ id: 'g-ext', externalId: '400', totalAchievements: 0 }));
    mockFetch.mockResolvedValue(
      makeSteamApiResponse([{ id: 400, name: 'Portal', tiny_image: '' }]),
    );

    await search('portal', 'games');

    expect(mockRedisSet).toHaveBeenCalledWith(
      'search:steam:portal',
      expect.any(String),
      'EX',
      3600,
    );
  });
});

// ─── type=all ─────────────────────────────────────────────────────────────────

describe('search — type=all', () => {
  it('devuelve juegos y usuarios combinados', async () => {
    mockGameFindMany.mockResolvedValue([makeLocalGame()]);
    mockUserFindMany.mockResolvedValue([makeUser()]);

    const result = await search('half', 'all');

    expect(result.games).toHaveLength(1);
    expect(result.users).toHaveLength(1);
    expect(result.total).toBe(2);
  });
});

describe('search — type=users', () => {
  it('solo busca en usuarios y no llama a game.findMany', async () => {
    mockUserFindMany.mockResolvedValue([makeUser()]);

    const result = await search('gamer', 'users');

    expect(result.users).toHaveLength(1);
    expect(result.games).toHaveLength(0);
    expect(mockGameFindMany).not.toHaveBeenCalled();
  });

  it('BUG-2: excluye al usuario autenticado de los resultados cuando se pasa userId', async () => {
    mockUserFindMany.mockResolvedValue([makeUser({ id: 'u2', username: 'otro_gamer' })]);

    await search('gamer', 'users', undefined, 'u1');

    expect(mockUserFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          NOT: { id: 'u1' },
        }),
      }),
    );
  });

  it('BUG-2: no añade filtro NOT cuando no hay userId (usuario no autenticado)', async () => {
    mockUserFindMany.mockResolvedValue([makeUser()]);

    await search('gamer', 'users');

    const call = (mockUserFindMany as jest.Mock).mock.calls[0]?.[0] as {
      where: { NOT?: unknown };
    };
    expect(call?.where).not.toHaveProperty('NOT');
  });
});

// ─── getGameWithAchievements ──────────────────────────────────────────────────

describe('getGameWithAchievements', () => {
  it('devuelve el juego con sus logros si existe', async () => {
    const gameWithAchievements = {
      ...makeLocalGame(),
      achievements: [
        { id: 'a1', title: 'Logro 1', description: null, iconUrl: null, normalizedPoints: 10, rarity: 5.2 },
      ],
    };
    mockGameFindUnique.mockResolvedValue(gameWithAchievements);

    const result = await getGameWithAchievements('g1');

    expect(result).not.toBeNull();
    expect(result?.achievements).toHaveLength(1);
  });

  it('devuelve null si el juego no existe', async () => {
    mockGameFindUnique.mockResolvedValue(null);

    const result = await getGameWithAchievements('no-existe');

    expect(result).toBeNull();
  });

  it('llama a findUnique con el id correcto e incluye achievements', async () => {
    mockGameFindUnique.mockResolvedValue(null);

    await getGameWithAchievements('g42');

    expect(mockGameFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'g42' },
        include: expect.objectContaining({ achievements: expect.any(Object) }),
      }),
    );
  });
});

// ─── searchAchievements (type=achievements) ───────────────────────────────────

describe('search — type=achievements', () => {
  it('devuelve logros del tipo achievement con isUnlocked: false sin userId', async () => {
    mockAchievementFindMany.mockResolvedValue([makeAchievement()]);
    mockGameFindMany.mockResolvedValue([]);
    mockUserFindMany.mockResolvedValue([]);

    const result = await search('First', 'achievements');

    expect(result.achievements).toHaveLength(1);
    expect(result.achievements[0]?.type).toBe('achievement');
    expect(result.achievements[0]?.isUnlocked).toBe(false);
    expect(result.achievements[0]?.unlockedAt).toBeNull();
    expect(result.games).toHaveLength(0);
    expect(result.users).toHaveLength(0);
  });

  it('devuelve isUnlocked: true cuando el userId tiene el logro desbloqueado', async () => {
    const unlockedAt = new Date('2024-03-15');
    mockAchievementFindMany.mockResolvedValue([makeAchievement()]);
    mockUserAchievementFindMany.mockResolvedValue([
      { achievementId: 'ach1', unlockedAt },
    ]);

    const result = await search('First', 'achievements', undefined, 'user-1');

    expect(result.achievements[0]?.isUnlocked).toBe(true);
    expect(result.achievements[0]?.unlockedAt).toBe(unlockedAt.toISOString());
  });

  it('filtra por plataforma cuando se proporciona platform=RA', async () => {
    mockAchievementFindMany.mockResolvedValue([makeAchievement({ platform: 'RA' })]);

    const result = await search('First', 'achievements', 'RA');

    expect(mockAchievementFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ platform: 'RA' }),
      }),
    );
    expect(result.achievements).toHaveLength(1);
  });

  it('nunca devuelve logros de Xbox', async () => {
    await search('First', 'achievements');

    expect(mockAchievementFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          NOT: { platform: 'XBOX' },
        }),
      }),
    );
  });

  it('no llama a searchGames ni searchUsers cuando type=achievements', async () => {
    mockAchievementFindMany.mockResolvedValue([]);

    await search('First', 'achievements');

    expect(mockGameFindMany).not.toHaveBeenCalled();
    expect(mockUserFindMany).not.toHaveBeenCalled();
  });
});

// ─── getGameAchievementsWithStatus ───────────────────────────────────────────

describe('getGameAchievementsWithStatus', () => {
  it('devuelve null si el juego no existe', async () => {
    mockGameFindUnique.mockResolvedValue(null);

    const result = await getGameAchievementsWithStatus('no-existe');

    expect(result).toBeNull();
  });

  it('devuelve todos los logros con isUnlocked: false sin userId', async () => {
    mockGameFindUnique.mockResolvedValue({ id: 'g1' });
    mockAchievementFindMany.mockResolvedValue([makeAchievement()]);

    const result = await getGameAchievementsWithStatus('g1');

    expect(result).not.toBeNull();
    expect(result?.totalCount).toBe(1);
    expect(result?.earnedCount).toBe(0);
    expect(result?.achievements[0]?.isUnlocked).toBe(false);
  });

  it('devuelve earnedCount correcto cuando el usuario tiene logros desbloqueados', async () => {
    mockGameFindUnique.mockResolvedValue({ id: 'g1' });
    mockAchievementFindMany.mockResolvedValue([
      makeAchievement({ id: 'ach1' }),
      makeAchievement({ id: 'ach2' }),
    ]);
    mockUserAchievementFindMany.mockResolvedValue([
      { achievementId: 'ach1', unlockedAt: new Date() },
    ]);

    const result = await getGameAchievementsWithStatus('g1', 'user-1');

    expect(result?.earnedCount).toBe(1);
    expect(result?.totalCount).toBe(2);
    expect(result?.achievements.find((a) => a.id === 'ach1')?.isUnlocked).toBe(true);
    expect(result?.achievements.find((a) => a.id === 'ach2')?.isUnlocked).toBe(false);
  });

  it('no consulta userAchievement si no hay userId', async () => {
    mockGameFindUnique.mockResolvedValue({ id: 'g1' });
    mockAchievementFindMany.mockResolvedValue([makeAchievement()]);

    await getGameAchievementsWithStatus('g1');

    expect(mockUserAchievementFindMany).not.toHaveBeenCalled();
  });
});
