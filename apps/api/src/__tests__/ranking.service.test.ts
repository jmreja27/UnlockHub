import * as rankingService from '../services/ranking.service';

jest.mock('../lib/redis', () => ({
  redis: {
    pipeline: jest.fn(),
    zrevrange: jest.fn(),
    zcard: jest.fn(),
    zrevrank: jest.fn(),
    zscore: jest.fn(),
    zadd: jest.fn(),
    zrem: jest.fn(),
  },
}));

jest.mock('../lib/prisma', () => ({
  prisma: {
    user: { findMany: jest.fn() },
    userAchievement: { findMany: jest.fn() },
    rankingSnapshot: { createMany: jest.fn() },
  },
}));

import { redis } from '../lib/redis';
import { prisma } from '../lib/prisma';

const mockRedis = redis as jest.Mocked<typeof redis>;
const mockPrisma = prisma as jest.Mocked<typeof prisma>;

const users = [
  { id: 'u1', username: 'alpha', avatar: null, countryCode: 'ES' },
  { id: 'u2', username: 'beta', avatar: null, countryCode: 'ES' },
];

beforeEach(() => {
  jest.clearAllMocks();
  // Por defecto getPlatformXp devuelve 0 (sin logros en esa plataforma)
  (mockPrisma.userAchievement.findMany as jest.Mock).mockResolvedValue([]);
});

describe('rankingService.getGlobalRanking', () => {
  it('devuelve ranking paginado correctamente', async () => {
    mockRedis.zcard.mockResolvedValue(2);
    mockRedis.zrevrange.mockResolvedValue(['u1', '500', 'u2', '300'] as never);
    (mockPrisma.user.findMany as jest.Mock).mockResolvedValue(users);

    const result = await rankingService.getGlobalRanking(1, 20);

    expect(result.total).toBe(2);
    expect(result.data[0]?.rank).toBe(1);
    expect(result.data[0]?.username).toBe('alpha');
    expect(result.data[0]?.xp).toBe(500);
    expect(result.data[1]?.rank).toBe(2);
  });

  it('devuelve lista vacía si no hay usuarios en el ranking', async () => {
    mockRedis.zcard.mockResolvedValue(0);

    const result = await rankingService.getGlobalRanking(1, 20);

    expect(result.data).toHaveLength(0);
    expect(result.total).toBe(0);
  });
});

describe('rankingService.getUserRank', () => {
  it('devuelve la posición global del usuario (1-indexed)', async () => {
    mockRedis.zrevrank.mockResolvedValue(0);
    mockRedis.zscore.mockResolvedValue('1500');

    const result = await rankingService.getUserRank('u1');

    expect(result.rank).toBe(1);
    expect(result.xp).toBe(1500);
    // BUG-3: sin filtro de plataforma debe leer del sorted set global
    expect(mockRedis.zrevrank).toHaveBeenCalledWith('ranking:global', 'u1');
    expect(mockRedis.zscore).toHaveBeenCalledWith('ranking:global', 'u1');
  });

  it('devuelve null si el usuario no está en el ranking', async () => {
    mockRedis.zrevrank.mockResolvedValue(null);
    mockRedis.zscore.mockResolvedValue(null);

    const result = await rankingService.getUserRank('unknown');

    expect(result.rank).toBeNull();
    expect(result.xp).toBe(0);
  });

  // BUG-3: filtro de plataforma — debe leer del sorted set de plataforma, no del global
  it('BUG-3: con platform=PSN lee del sorted set ranking:platform:psn', async () => {
    mockRedis.zrevrank.mockResolvedValue(2);
    mockRedis.zscore.mockResolvedValue('850');

    const result = await rankingService.getUserRank('u1', 'PSN');

    expect(mockRedis.zrevrank).toHaveBeenCalledWith('ranking:platform:psn', 'u1');
    expect(mockRedis.zscore).toHaveBeenCalledWith('ranking:platform:psn', 'u1');
    expect(result.rank).toBe(3);
    expect(result.xp).toBe(850);
  });

  it('BUG-3: con platform=STEAM lee del sorted set ranking:platform:steam', async () => {
    mockRedis.zrevrank.mockResolvedValue(0);
    mockRedis.zscore.mockResolvedValue('2000');

    const result = await rankingService.getUserRank('u1', 'STEAM');

    expect(mockRedis.zrevrank).toHaveBeenCalledWith('ranking:platform:steam', 'u1');
    expect(result.xp).toBe(2000);
  });

  it('BUG-3: XP de getUserRank(platform=PSN) es el XP del sorted set PSN, no user.xp global', async () => {
    // El XP global del usuario es 5000, pero solo tiene 900 XP de PSN
    mockRedis.zrevrank.mockResolvedValue(5);
    mockRedis.zscore.mockResolvedValue('900'); // XP específico de PSN en el sorted set

    const result = await rankingService.getUserRank('u1', 'PSN');

    // El XP devuelto debe ser el de PSN (900), no el total (5000)
    expect(result.xp).toBe(900);
    // Debe leer del sorted set correcto
    expect(mockRedis.zscore).toHaveBeenCalledWith('ranking:platform:psn', 'u1');
  });
});

describe('rankingService.upsertUserScore', () => {
  it('usa XP total para global y XP por plataforma para los sorted sets de plataforma', async () => {
    mockRedis.zadd.mockResolvedValue(1 as never);
    // Steam: 200 XP en BD
    (mockPrisma.userAchievement.findMany as jest.Mock).mockResolvedValueOnce([
      { achievement: { normalizedPoints: 200 } },
    ]);

    await rankingService.upsertUserScore('u1', 500, ['STEAM']);

    expect(mockRedis.zadd).toHaveBeenCalledWith('ranking:global', 500, 'u1');
    expect(mockRedis.zadd).toHaveBeenCalledWith('ranking:platform:steam', 200, 'u1');
    expect(mockRedis.zadd).toHaveBeenCalledTimes(2);
  });

  it('actualiza múltiples plataformas con su XP específico desde BD', async () => {
    mockRedis.zadd.mockResolvedValue(1 as never);
    (mockPrisma.userAchievement.findMany as jest.Mock)
      .mockResolvedValueOnce([{ achievement: { normalizedPoints: 100 } }])  // Steam 100 XP
      .mockResolvedValueOnce([{ achievement: { normalizedPoints: 50 } }]);  // RA 50 XP

    await rankingService.upsertUserScore('u1', 150, ['STEAM', 'RA']);

    expect(mockRedis.zadd).toHaveBeenCalledWith('ranking:global', 150, 'u1');
    expect(mockRedis.zadd).toHaveBeenCalledWith('ranking:platform:steam', 100, 'u1');
    expect(mockRedis.zadd).toHaveBeenCalledWith('ranking:platform:ra', 50, 'u1');
    expect(mockRedis.zadd).toHaveBeenCalledTimes(3);
  });

  it('sin plataformas solo actualiza el ranking global', async () => {
    mockRedis.zadd.mockResolvedValue(1 as never);

    await rankingService.upsertUserScore('u1', 500, []);

    expect(mockRedis.zadd).toHaveBeenCalledTimes(1);
    expect(mockRedis.zadd).toHaveBeenCalledWith('ranking:global', 500, 'u1');
  });

  it('no hay sorted set de país — ranking nacional eliminado', async () => {
    mockRedis.zadd.mockResolvedValue(1 as never);

    await rankingService.upsertUserScore('u1', 500, []);

    const calls = (mockRedis.zadd as jest.Mock).mock.calls as string[][];
    const countryCall = calls.find((c) => (c[0] as string).includes('ranking:global:'));
    expect(countryCall).toBeUndefined();
  });
});

describe('rankingService.removeUserFromRankings', () => {
  it('llama a zrem para global y plataformas', async () => {
    const execMock = jest.fn().mockResolvedValue([]);
    const pipelineMock = { zrem: jest.fn().mockReturnThis(), exec: execMock };
    mockRedis.pipeline.mockReturnValue(pipelineMock as never);

    await rankingService.removeUserFromRankings('u1', ['STEAM', 'RA']);

    expect(pipelineMock.zrem).toHaveBeenCalledTimes(3); // global + steam + ra
    expect(execMock).toHaveBeenCalled();
  });

  it('solo borra global si no hay plataformas', async () => {
    const execMock = jest.fn().mockResolvedValue([]);
    const pipelineMock = { zrem: jest.fn().mockReturnThis(), exec: execMock };
    mockRedis.pipeline.mockReturnValue(pipelineMock as never);

    await rankingService.removeUserFromRankings('u1', []);

    expect(pipelineMock.zrem).toHaveBeenCalledTimes(1);
  });
});

describe('rankingService.getPlatformRanking', () => {
  it('devuelve ranking paginado por plataforma', async () => {
    mockRedis.zcard.mockResolvedValue(2);
    mockRedis.zrevrange.mockResolvedValue(['u1', '400', 'u2', '100'] as never);
    (mockPrisma.user.findMany as jest.Mock).mockResolvedValue(users);

    const result = await rankingService.getPlatformRanking('STEAM', 1, 20);

    expect(result.total).toBe(2);
    expect(result.data[0]?.rank).toBe(1);
  });

  it('devuelve lista vacía si no hay usuarios en la plataforma', async () => {
    mockRedis.zcard.mockResolvedValue(0);

    const result = await rankingService.getPlatformRanking('PSN', 1, 20);

    expect(result.data).toHaveLength(0);
  });
});

describe('rankingService.takeRankingSnapshot', () => {
  it('no hace nada si el ranking global está vacío', async () => {
    mockRedis.zcard.mockResolvedValue(0);

    await rankingService.takeRankingSnapshot();

    expect(mockRedis.zrevrange).not.toHaveBeenCalled();
    expect(mockPrisma.rankingSnapshot.createMany).not.toHaveBeenCalled();
  });

  it('crea snapshots desde las entradas del ranking global', async () => {
    mockRedis.zcard.mockResolvedValue(2);
    mockRedis.zrevrange.mockResolvedValue(['u1', '500', 'u2', '300'] as never);
    (mockPrisma.rankingSnapshot.createMany as jest.Mock).mockResolvedValue({ count: 2 });

    await rankingService.takeRankingSnapshot();

    expect(mockPrisma.rankingSnapshot.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({ userId: 'u1', rank: 1, xp: 500 }),
          expect.objectContaining({ userId: 'u2', rank: 2, xp: 300 }),
        ]),
        skipDuplicates: true,
      }),
    );
  });

  it('ignora entradas con userId vacío o xp NaN', async () => {
    mockRedis.zcard.mockResolvedValue(2);
    mockRedis.zrevrange.mockResolvedValue(['', '500', 'u2', 'abc'] as never);
    (mockPrisma.rankingSnapshot.createMany as jest.Mock).mockResolvedValue({ count: 0 });

    await rankingService.takeRankingSnapshot();

    const call = (mockPrisma.rankingSnapshot.createMany as jest.Mock).mock.calls[0]?.[0];
    expect(call?.data).toHaveLength(0);
  });
});

describe('rankingService.seedRankingsFromDb', () => {
  it('reconstruye el ranking en Redis desde todos los usuarios de la BD', async () => {
    (mockPrisma.user.findMany as jest.Mock).mockResolvedValue([
      { id: 'u1', xp: 500, platformAccounts: [{ platform: 'STEAM' }] },
      { id: 'u2', xp: 200, platformAccounts: [] },
    ]);
    mockRedis.zadd.mockResolvedValue(1 as never);
    // u1 tiene 300 XP de Steam
    (mockPrisma.userAchievement.findMany as jest.Mock).mockResolvedValueOnce([
      { achievement: { normalizedPoints: 300 } },
    ]);

    await rankingService.seedRankingsFromDb();

    // u1: global(500) + steam(300) = 2; u2: global(200) = 1 → 3 total
    expect(mockRedis.zadd).toHaveBeenCalledTimes(3);
    expect(mockRedis.zadd).toHaveBeenCalledWith('ranking:global', 500, 'u1');
    expect(mockRedis.zadd).toHaveBeenCalledWith('ranking:platform:steam', 300, 'u1');
    expect(mockRedis.zadd).toHaveBeenCalledWith('ranking:global', 200, 'u2');
  });
});
