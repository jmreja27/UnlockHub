// Tests unitarios de games.service.ts — fetchAndUpsertGameAchievements

jest.mock('../lib/prisma', () => ({
  prisma: {
    game: { findUnique: jest.fn(), update: jest.fn() },
    achievement: { upsert: jest.fn() },
  },
}));

jest.mock('../platforms/steam.adapter', () => ({
  fetchSteamAchievementDefinitions: jest.fn(),
}));

jest.mock('../platforms/retroachievements.adapter', () => ({
  fetchRaAchievementDefinitions: jest.fn(),
}));

jest.mock('../lib/logger', () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

import { fetchAndUpsertGameAchievements } from '../services/games.service';
import { prisma } from '../lib/prisma';
import * as steamAdapter from '../platforms/steam.adapter';
import * as raAdapter from '../platforms/retroachievements.adapter';

const mockGameFindUnique = prisma.game.findUnique as jest.Mock;
const mockGameUpdate = prisma.game.update as jest.Mock;
const mockAchievementUpsert = prisma.achievement.upsert as jest.Mock;
const mockFetchSteam = steamAdapter.fetchSteamAchievementDefinitions as jest.Mock;
const mockFetchRa = raAdapter.fetchRaAchievementDefinitions as jest.Mock;

const recentDate = new Date(Date.now() - 1000 * 60 * 60); // 1h atrás
const oldDate = new Date(Date.now() - 1000 * 60 * 60 * 25); // 25h atrás

beforeEach(() => {
  jest.clearAllMocks();
  mockAchievementUpsert.mockResolvedValue({ id: 'ach1' });
  mockGameUpdate.mockResolvedValue({});
});

describe('fetchAndUpsertGameAchievements', () => {
  it('lanza GAME_NOT_FOUND (404) si el juego no existe', async () => {
    mockGameFindUnique.mockResolvedValue(null);

    await expect(fetchAndUpsertGameAchievements('no-existe')).rejects.toMatchObject({
      code: 'GAME_NOT_FOUND',
      statusCode: 404,
    });
  });

  it('devuelve { achievementsAdded: 0 } si el juego ya tiene logros y fue actualizado recientemente (guard)', async () => {
    mockGameFindUnique.mockResolvedValue({
      id: 'g1',
      platform: 'STEAM',
      externalId: '440',
      title: 'Team Fortress 2',
      totalAchievements: 520,
      updatedAt: recentDate,
    });

    const result = await fetchAndUpsertGameAchievements('g1');

    expect(result.achievementsAdded).toBe(0);
    expect(mockFetchSteam).not.toHaveBeenCalled();
  });

  it('re-fetchea Steam si el juego tiene logros pero fue actualizado hace más de 24h', async () => {
    mockGameFindUnique.mockResolvedValue({
      id: 'g1',
      platform: 'STEAM',
      externalId: '440',
      title: 'Team Fortress 2',
      totalAchievements: 5,
      updatedAt: oldDate,
    });
    mockFetchSteam.mockResolvedValue([
      { externalId: 'ACH_1', title: 'First Kill', description: null, iconUrl: null, rarity: 50, normalizedPoints: 10 },
      { externalId: 'ACH_2', title: 'Medic!', description: 'Heal 1000 HP', iconUrl: null, rarity: 30, normalizedPoints: 25 },
    ]);

    const result = await fetchAndUpsertGameAchievements('g1');

    expect(mockFetchSteam).toHaveBeenCalledWith('440');
    expect(result.achievementsAdded).toBe(2);
    expect(mockAchievementUpsert).toHaveBeenCalledTimes(2);
    expect(mockGameUpdate).toHaveBeenCalledWith({
      where: { id: 'g1' },
      data: { totalAchievements: 2 },
    });
  });

  it('fetchea y persiste logros de Steam para juego con 0 logros', async () => {
    mockGameFindUnique.mockResolvedValue({
      id: 'g1',
      platform: 'STEAM',
      externalId: '440',
      title: 'Team Fortress 2',
      totalAchievements: 0,
      updatedAt: recentDate,
    });
    mockFetchSteam.mockResolvedValue([
      { externalId: 'ACH_WIN', title: 'Winner', description: 'Win a match', iconUrl: 'http://example.com/icon.jpg', rarity: 20, normalizedPoints: 50 },
    ]);

    const result = await fetchAndUpsertGameAchievements('g1');

    expect(mockFetchSteam).toHaveBeenCalledWith('440');
    expect(result.achievementsAdded).toBe(1);
    expect(mockAchievementUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { platform_gameId_externalId: { platform: 'STEAM', gameId: 'g1', externalId: 'ACH_WIN' } },
        create: expect.objectContaining({ title: 'Winner', platform: 'STEAM' }),
      }),
    );
    expect(mockGameUpdate).toHaveBeenCalledWith({
      where: { id: 'g1' },
      data: { totalAchievements: 1 },
    });
  });

  it('devuelve { achievementsAdded: 0 } si Steam no devuelve logros (juego sin schema)', async () => {
    mockGameFindUnique.mockResolvedValue({
      id: 'g2',
      platform: 'STEAM',
      externalId: '9999',
      title: 'Sin logros',
      totalAchievements: 0,
      updatedAt: recentDate,
    });
    mockFetchSteam.mockResolvedValue([]);

    const result = await fetchAndUpsertGameAchievements('g2');

    expect(result.achievementsAdded).toBe(0);
    expect(mockAchievementUpsert).not.toHaveBeenCalled();
    expect(mockGameUpdate).not.toHaveBeenCalled();
  });

  it('fetchea y persiste logros de RA para juego con 0 logros', async () => {
    mockGameFindUnique.mockResolvedValue({
      id: 'ra-g1',
      platform: 'RA',
      externalId: '1234',
      title: 'Super Mario Bros',
      totalAchievements: 0,
      updatedAt: recentDate,
    });
    mockFetchRa.mockResolvedValue([
      { externalId: '9001', title: 'Hero', description: 'Complete World 1', iconUrl: null, rawValue: 50, normalizedPoints: 10 },
      { externalId: '9002', title: 'Champion', description: null, iconUrl: null, rawValue: 25, normalizedPoints: 5 },
    ]);

    const result = await fetchAndUpsertGameAchievements('ra-g1');

    expect(mockFetchRa).toHaveBeenCalledWith('1234');
    expect(result.achievementsAdded).toBe(2);
    expect(mockAchievementUpsert).toHaveBeenCalledTimes(2);
    expect(mockGameUpdate).toHaveBeenCalledWith({
      where: { id: 'ra-g1' },
      data: { totalAchievements: 2 },
    });
  });

  it('devuelve { achievementsAdded: 0 } para juego PSN (no-op)', async () => {
    mockGameFindUnique.mockResolvedValue({
      id: 'psn-g1',
      platform: 'PSN',
      externalId: 'NPWR00001_00',
      title: 'God of War',
      totalAchievements: 0,
      updatedAt: recentDate,
    });

    const result = await fetchAndUpsertGameAchievements('psn-g1');

    expect(result.achievementsAdded).toBe(0);
    expect(mockAchievementUpsert).not.toHaveBeenCalled();
  });

  it('lanza PLATFORM_NOT_SUPPORTED (400) para juego Xbox', async () => {
    mockGameFindUnique.mockResolvedValue({
      id: 'xbox-g1',
      platform: 'XBOX',
      externalId: 'xbox-123',
      title: 'Halo',
      totalAchievements: 0,
      updatedAt: recentDate,
    });

    await expect(fetchAndUpsertGameAchievements('xbox-g1')).rejects.toMatchObject({
      code: 'PLATFORM_NOT_SUPPORTED',
      statusCode: 400,
    });
  });
});
