import * as adminService from '../services/admin.service';

jest.mock('../lib/prisma', () => ({
  prisma: {
    user: { count: jest.fn() },
    achievementGuide: { count: jest.fn() },
  },
}));

jest.mock('../lib/redis', () => ({
  redis: { get: jest.fn() },
}));

jest.mock('../jobs/sync.queue', () => ({
  syncQueue: {
    getJobCounts: jest.fn(),
  },
}));

import { prisma } from '../lib/prisma';
import { redis } from '../lib/redis';
import { syncQueue } from '../jobs/sync.queue';

const mockUserCount = prisma.user.count as jest.Mock;
const mockGuideCount = prisma.achievementGuide.count as jest.Mock;
const mockRedisGet = redis.get as jest.Mock;
const mockQueueCounts = syncQueue.getJobCounts as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockUserCount.mockResolvedValue(0);
  mockGuideCount.mockResolvedValue(0);
  mockRedisGet.mockResolvedValue(null);
  mockQueueCounts.mockResolvedValue({ waiting: 0, active: 0, delayed: 0 });
});

describe('getAdminMetrics', () => {
  it('devuelve métricas con valores por defecto cuando no hay datos en Redis', async () => {
    mockUserCount.mockResolvedValue(100);
    mockGuideCount.mockResolvedValue(3);

    const metrics = await adminService.getAdminMetrics();

    expect(metrics.users.total).toBe(100);
    expect(metrics.ugc.guidesReportedPending).toBe(3);
    expect(metrics.syncs.completedLast24h).toBe(0);
    expect(metrics.syncs.failedLast24h).toBe(0);
    expect(metrics.steam.apiCallsToday).toBe(0);
    expect(metrics.steam.apiCallsLimitPercent).toBe(0);
  });

  it('calcula el porcentaje de uso de la Steam API correctamente', async () => {
    mockRedisGet.mockImplementation((key: string) => {
      if (key.startsWith('steam:api:calls:')) return Promise.resolve('50000');
      return Promise.resolve(null);
    });

    const metrics = await adminService.getAdminMetrics();

    expect(metrics.steam.apiCallsToday).toBe(50000);
    expect(metrics.steam.apiCallsLimitPercent).toBe(50);
  });

  it('incluye profundidad de cola de BullMQ', async () => {
    mockQueueCounts.mockResolvedValue({ waiting: 5, active: 2, delayed: 1 });

    const metrics = await adminService.getAdminMetrics();

    expect(metrics.syncs.queueDepth).toBe(8);
  });

  it('parsea correctamente los contadores de syncs desde Redis', async () => {
    mockRedisGet.mockImplementation((key: string) => {
      if (key.startsWith('metrics:sync:completed:')) return Promise.resolve('42');
      if (key.startsWith('metrics:sync:failed:')) return Promise.resolve('3');
      if (key.startsWith('metrics:errors:5xx:')) return Promise.resolve('1');
      return Promise.resolve(null);
    });

    const metrics = await adminService.getAdminMetrics();

    expect(metrics.syncs.completedLast24h).toBe(42);
    expect(metrics.syncs.failedLast24h).toBe(3);
    expect(metrics.errors.serverErrors5xxLast24h).toBe(1);
  });
});
