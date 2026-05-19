jest.mock('../lib/prisma', () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    userPoint: { create: jest.fn(), findMany: jest.fn(), count: jest.fn(), aggregate: jest.fn() },
  },
}));

jest.mock('../lib/redis', () => ({
  redis: {
    get: jest.fn(),
    set: jest.fn(),
  },
}));

import { awardPoints, getPointsHistory, getPointsTotal, claimRewardedAdPoints } from '../services/points.service';
import { prisma } from '../lib/prisma';
import { redis } from '../lib/redis';

const mockFindUnique = prisma.user.findUnique as jest.Mock;
const mockCreate = prisma.userPoint.create as jest.Mock;
const mockFindMany = prisma.userPoint.findMany as jest.Mock;
const mockCount = prisma.userPoint.count as jest.Mock;
const mockAggregate = prisma.userPoint.aggregate as jest.Mock;
const mockRedisGet = redis.get as jest.Mock;
const mockRedisSet = redis.set as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockCreate.mockResolvedValue({});
  mockAggregate.mockResolvedValue({ _sum: { amount: null } });
  mockRedisGet.mockResolvedValue(null);
  mockRedisSet.mockResolvedValue('OK');
});

describe('awardPoints', () => {
  it('crea un registro UserPoint si el usuario existe', async () => {
    mockFindUnique.mockResolvedValue({ id: 'u1' });
    await awardPoints('u1', 50, 'STREAK');
    expect(mockCreate).toHaveBeenCalledWith({ data: { userId: 'u1', amount: 50, reason: 'STREAK' } });
  });

  it('lanza error si el usuario no existe', async () => {
    mockFindUnique.mockResolvedValue(null);
    await expect(awardPoints('u999', 50, 'STREAK')).rejects.toMatchObject({ code: 'USER_NOT_FOUND' });
    expect(mockCreate).not.toHaveBeenCalled();
  });
});

describe('getPointsHistory', () => {
  it('devuelve historial paginado con fechas en ISO string', async () => {
    const now = new Date();
    mockFindMany.mockResolvedValue([{ id: 'p1', amount: 100, reason: 'ACHIEVEMENT', createdAt: now }]);
    mockCount.mockResolvedValue(1);

    const result = await getPointsHistory('u1', 1, 20);

    expect(result.total).toBe(1);
    expect(result.data[0]?.createdAt).toBe(now.toISOString());
    expect(result.data[0]?.reason).toBe('ACHIEVEMENT');
  });

  it('devuelve página vacía si no hay puntos', async () => {
    mockFindMany.mockResolvedValue([]);
    mockCount.mockResolvedValue(0);
    const result = await getPointsHistory('u1', 1, 20);
    expect(result.data).toHaveLength(0);
    expect(result.total).toBe(0);
  });
});

describe('getPointsTotal', () => {
  it('devuelve la suma total de puntos', async () => {
    mockAggregate.mockResolvedValue({ _sum: { amount: 350 } });
    const total = await getPointsTotal('u1');
    expect(total).toBe(350);
  });

  it('devuelve 0 si no hay puntos registrados', async () => {
    mockAggregate.mockResolvedValue({ _sum: { amount: null } });
    const total = await getPointsTotal('u1');
    expect(total).toBe(0);
  });
});

describe('claimRewardedAdPoints', () => {
  it('otorga 10 puntos y activa cooldown Redis si no hay cooldown activo', async () => {
    mockRedisGet.mockResolvedValue(null);
    mockCreate.mockResolvedValue({});
    mockRedisSet.mockResolvedValue('OK');

    const result = await claimRewardedAdPoints('u1');

    expect(result.pointsEarned).toBe(10);
    expect(mockCreate).toHaveBeenCalledWith({
      data: { userId: 'u1', amount: 10, reason: 'REWARDED_AD' },
    });
    expect(mockRedisSet).toHaveBeenCalledWith(
      'rewarded-ad:u1',
      '1',
      'EX',
      10800,
    );
  });

  it('lanza 429 si el cooldown Redis está activo', async () => {
    mockRedisGet.mockResolvedValue('1');

    await expect(claimRewardedAdPoints('u1')).rejects.toMatchObject({
      code: 'REWARDED_AD_COOLDOWN',
      statusCode: 429,
    });
    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockRedisSet).not.toHaveBeenCalled();
  });
});
