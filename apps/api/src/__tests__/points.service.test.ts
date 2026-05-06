jest.mock('../lib/prisma', () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    userPoint: { create: jest.fn(), findMany: jest.fn(), count: jest.fn(), aggregate: jest.fn() },
  },
}));

import { awardPoints, getPointsHistory, getPointsTotal } from '../services/points.service';
import { prisma } from '../lib/prisma';

const mockFindUnique = prisma.user.findUnique as jest.Mock;
const mockCreate = prisma.userPoint.create as jest.Mock;
const mockFindMany = prisma.userPoint.findMany as jest.Mock;
const mockCount = prisma.userPoint.count as jest.Mock;
const mockAggregate = prisma.userPoint.aggregate as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockCreate.mockResolvedValue({});
  mockAggregate.mockResolvedValue({ _sum: { amount: null } });
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
