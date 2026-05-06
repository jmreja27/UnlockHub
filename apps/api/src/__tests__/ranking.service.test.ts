import * as rankingService from '../services/ranking.service';

jest.mock('../lib/redis', () => ({
  redis: {
    pipeline: jest.fn(),
    zrevrange: jest.fn(),
    zcard: jest.fn(),
    zrevrank: jest.fn(),
    zadd: jest.fn(),
    zrem: jest.fn(),
  },
}));

jest.mock('../lib/prisma', () => ({
  prisma: {
    user: { findMany: jest.fn() },
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

beforeEach(() => jest.clearAllMocks());

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
    mockRedis.zrevrank.mockResolvedValue(0); // posición 0 = rank 1
    mockRedis.zcard.mockResolvedValue(100);

    const result = await rankingService.getUserRank('u1');

    expect(result.global).toBe(1);
    expect(result.globalTotal).toBe(100);
  });

  it('devuelve null si el usuario no está en el ranking', async () => {
    mockRedis.zrevrank.mockResolvedValue(null);
    mockRedis.zcard.mockResolvedValue(50);

    const result = await rankingService.getUserRank('unknown');

    expect(result.global).toBeNull();
  });
});

describe('rankingService.upsertUserScore', () => {
  it('llama a zadd para global, país y plataformas', async () => {
    const execMock = jest.fn().mockResolvedValue([]);
    const pipelineMock = { zadd: jest.fn().mockReturnThis(), exec: execMock };
    mockRedis.pipeline.mockReturnValue(pipelineMock as never);

    await rankingService.upsertUserScore('u1', 500, 'ES', ['STEAM']);

    expect(pipelineMock.zadd).toHaveBeenCalledTimes(3); // global + ES + steam
    expect(execMock).toHaveBeenCalled();
  });

  it('no añade clave de país si countryCode es null', async () => {
    const execMock = jest.fn().mockResolvedValue([]);
    const pipelineMock = { zadd: jest.fn().mockReturnThis(), exec: execMock };
    mockRedis.pipeline.mockReturnValue(pipelineMock as never);

    await rankingService.upsertUserScore('u1', 500, null, ['STEAM']);

    expect(pipelineMock.zadd).toHaveBeenCalledTimes(2); // global + steam
  });
});
