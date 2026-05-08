jest.mock('../lib/prisma', () => ({
  prisma: { user: { findMany: jest.fn(), update: jest.fn() } },
}));
jest.mock('../lib/redis', () => ({
  redis: { set: jest.fn(), del: jest.fn(), get: jest.fn(), on: jest.fn(), pipeline: jest.fn(() => ({ zadd: jest.fn(), exec: jest.fn() })) },
}));
jest.mock('../services/user.service', () => ({ addXp: jest.fn() }));
jest.mock('../services/activity.service', () => ({ createEvent: jest.fn() }));
jest.mock('bullmq', () => ({
  Worker: jest.fn().mockImplementation(() => ({ on: jest.fn(), close: jest.fn() })),
  Queue: jest.fn().mockImplementation(() => ({
    add: jest.fn(),
    getRepeatableJobs: jest.fn().mockResolvedValue([]),
    removeRepeatableByKey: jest.fn(),
  })),
}));

import { processStreaks } from '../jobs/streak.worker';
import { prisma } from '../lib/prisma';
import { redis } from '../lib/redis';
import { addXp } from '../services/user.service';

const mockFindMany = prisma.user.findMany as jest.Mock;
const mockUpdate = prisma.user.update as jest.Mock;
const mockSet = redis.set as jest.Mock;
const mockAddXp = addXp as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  // El loop rompe cuando users.length < BATCH, así que si sólo hay 1 usuario
  // no se hace una segunda llamada. Ponemos [] como valor por defecto para
  // que las llamadas adicionales no devuelvan undefined (que rompería .length).
  mockFindMany.mockResolvedValue([]);
});

describe('processStreaks', () => {
  it('incrementa racha y otorga XP si el usuario tuvo actividad reciente', async () => {
    const recentSync = new Date(Date.now() - 60 * 60 * 1000);
    mockFindMany.mockResolvedValueOnce([
      { id: 'u1', streakDays: 3, countryCode: null, lastSyncAt: recentSync },
    ]);

    await processStreaks();

    expect(mockUpdate).toHaveBeenCalledWith({ where: { id: 'u1' }, data: { streakDays: 4 } });
    expect(mockAddXp).toHaveBeenCalledWith('u1', 50, 'STREAK');
  });

  it('resetea la racha a 0 si no hubo actividad en las últimas 24h', async () => {
    const oldSync = new Date(Date.now() - 25 * 60 * 60 * 1000);
    mockFindMany.mockResolvedValueOnce([
      { id: 'u2', streakDays: 10, countryCode: null, lastSyncAt: oldSync },
    ]);

    await processStreaks();

    expect(mockUpdate).toHaveBeenCalledWith({ where: { id: 'u2' }, data: { streakDays: 0 } });
    expect(mockAddXp).not.toHaveBeenCalled();
  });

  it('resetea la racha si lastSyncAt es null', async () => {
    mockFindMany.mockResolvedValueOnce([
      { id: 'u3', streakDays: 5, countryCode: null, lastSyncAt: null },
    ]);

    await processStreaks();

    expect(mockUpdate).toHaveBeenCalledWith({ where: { id: 'u3' }, data: { streakDays: 0 } });
    expect(mockAddXp).not.toHaveBeenCalled();
  });

  it('guarda milestone en Redis al alcanzar 7 días', async () => {
    const recentSync = new Date(Date.now() - 60 * 60 * 1000);
    mockFindMany.mockResolvedValueOnce([
      { id: 'u4', streakDays: 6, countryCode: null, lastSyncAt: recentSync },
    ]);

    await processStreaks();

    expect(mockSet).toHaveBeenCalledWith('streak:milestone:u4', 7, 'EX', expect.any(Number));
  });

  it('no guarda milestone para rachas que no son hito', async () => {
    const recentSync = new Date(Date.now() - 60 * 60 * 1000);
    mockFindMany.mockResolvedValueOnce([
      { id: 'u5', streakDays: 4, countryCode: null, lastSyncAt: recentSync },
    ]);

    await processStreaks();

    expect(mockSet).not.toHaveBeenCalled();
  });

  it('no hace nada si no hay usuarios', async () => {
    // mockFindMany ya devuelve [] por defecto (beforeEach)
    await processStreaks();

    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockAddXp).not.toHaveBeenCalled();
  });
});
