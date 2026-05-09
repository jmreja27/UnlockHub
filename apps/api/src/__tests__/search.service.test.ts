jest.mock('../lib/prisma', () => ({
  prisma: {
    game: { findMany: jest.fn(), findUnique: jest.fn() },
    user: { findMany: jest.fn() },
  },
}));

import { search, getGameWithAchievements } from '../services/search.service';
import { prisma } from '../lib/prisma';

const mockGameFindMany = prisma.game.findMany as jest.Mock;
const mockUserFindMany = prisma.user.findMany as jest.Mock;
const mockGameFindUnique = prisma.game.findUnique as jest.Mock;

const makeGame = (overrides = {}) => ({
  id: 'g1', platform: 'STEAM', title: 'Half-Life 2',
  iconUrl: 'https://cdn.example.com/hl2.jpg', totalAchievements: 20,
  ...overrides,
});

const makeUser = (overrides = {}) => ({
  id: 'u1', username: 'gamer_pro', avatar: null, level: 5, xp: 1200,
  ...overrides,
});

beforeEach(() => jest.clearAllMocks());

describe('search — type=all', () => {
  it('devuelve juegos y usuarios combinados', async () => {
    mockGameFindMany.mockResolvedValue([makeGame()]);
    mockUserFindMany.mockResolvedValue([makeUser()]);

    const result = await search('half', 'all');

    expect(result.games).toHaveLength(1);
    expect(result.users).toHaveLength(1);
    expect(result.total).toBe(2);
    expect(result.games[0].type).toBe('game');
    expect(result.users[0].type).toBe('user');
  });

  it('mapea los campos correctamente en GameSearchResult', async () => {
    mockGameFindMany.mockResolvedValue([makeGame()]);
    mockUserFindMany.mockResolvedValue([]);

    const { games } = await search('half', 'all');

    expect(games[0]).toMatchObject({
      type: 'game',
      id: 'g1',
      platform: 'STEAM',
      title: 'Half-Life 2',
      totalAchievements: 20,
    });
  });

  it('mapea los campos correctamente en UserSearchResult', async () => {
    mockGameFindMany.mockResolvedValue([]);
    mockUserFindMany.mockResolvedValue([makeUser()]);

    const { users } = await search('gamer', 'all');

    expect(users[0]).toMatchObject({
      type: 'user',
      id: 'u1',
      username: 'gamer_pro',
      level: 5,
      xp: 1200,
    });
  });

  it('devuelve listas vacías si no hay coincidencias', async () => {
    mockGameFindMany.mockResolvedValue([]);
    mockUserFindMany.mockResolvedValue([]);

    const result = await search('zzz', 'all');

    expect(result.games).toHaveLength(0);
    expect(result.users).toHaveLength(0);
    expect(result.total).toBe(0);
  });
});

describe('search — type=games', () => {
  it('solo busca en juegos y no llama a user.findMany', async () => {
    mockGameFindMany.mockResolvedValue([makeGame()]);

    const result = await search('half', 'games');

    expect(result.games).toHaveLength(1);
    expect(result.users).toHaveLength(0);
    expect(mockUserFindMany).not.toHaveBeenCalled();
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
});

describe('getGameWithAchievements', () => {
  it('devuelve el juego con sus logros si existe', async () => {
    const gameWithAchievements = {
      ...makeGame(),
      achievements: [
        { id: 'a1', title: 'Logro 1', description: null, iconUrl: null, normalizedPoints: 10, rarity: 5.2 },
      ],
    };
    mockGameFindUnique.mockResolvedValue(gameWithAchievements);

    const result = await getGameWithAchievements('g1');

    expect(result).not.toBeNull();
    expect(result?.achievements).toHaveLength(1);
    expect(result?.achievements[0].title).toBe('Logro 1');
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
