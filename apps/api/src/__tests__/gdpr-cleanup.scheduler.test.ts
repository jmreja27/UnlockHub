import { runGdprCleanup } from '../jobs/gdpr-cleanup.scheduler';

jest.mock('../lib/prisma', () => ({
  prisma: {
    user: {
      findMany: jest.fn(),
      delete: jest.fn(),
    },
  },
}));

jest.mock('../lib/redis', () => ({
  redis: {
    get: jest.fn(),
    set: jest.fn(),
    quit: jest.fn(),
  },
  createWorkerConnection: jest.fn().mockReturnValue({}),
}));

jest.mock('../lib/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

// BullMQ se instancia en el módulo — mock mínimo para que no rompa el import
jest.mock('bullmq', () => ({
  Queue: jest.fn().mockImplementation(() => ({
    getRepeatableJobs: jest.fn().mockResolvedValue([]),
    removeRepeatableByKey: jest.fn().mockResolvedValue(undefined),
    add: jest.fn().mockResolvedValue(undefined),
  })),
  Worker: jest.fn().mockImplementation(() => ({
    close: jest.fn().mockResolvedValue(undefined),
  })),
}));

import { prisma } from '../lib/prisma';

const mockPrisma = prisma as jest.Mocked<typeof prisma>;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('runGdprCleanup', () => {
  it('borra físicamente usuarios con deletedAt hace más de 30 días', async () => {
    (mockPrisma.user.findMany as jest.Mock).mockResolvedValue([
      { id: 'old-user-1' },
      { id: 'old-user-2' },
    ]);
    (mockPrisma.user.delete as jest.Mock).mockResolvedValue({});

    await runGdprCleanup();

    expect(mockPrisma.user.delete).toHaveBeenCalledTimes(2);
    expect(mockPrisma.user.delete).toHaveBeenCalledWith({ where: { id: 'old-user-1' } });
    expect(mockPrisma.user.delete).toHaveBeenCalledWith({ where: { id: 'old-user-2' } });
  });

  it('no borra nada cuando no hay usuarios con deletedAt expirado', async () => {
    (mockPrisma.user.findMany as jest.Mock).mockResolvedValue([]);

    await runGdprCleanup();

    expect(mockPrisma.user.delete).not.toHaveBeenCalled();
  });

  it('busca solo usuarios con deletedAt <= hace 30 días (lte en la query)', async () => {
    (mockPrisma.user.findMany as jest.Mock).mockResolvedValue([]);

    await runGdprCleanup();

    expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { deletedAt: expect.objectContaining({ lte: expect.any(Date) }) },
      }),
    );
  });

  it('la fecha lte es aproximadamente 30 días antes de ahora', async () => {
    (mockPrisma.user.findMany as jest.Mock).mockResolvedValue([]);

    const before = Date.now();
    await runGdprCleanup();
    const after = Date.now();

    const call = (mockPrisma.user.findMany as jest.Mock).mock.calls[0]?.[0];
    const lteDateMs = (call?.where?.deletedAt?.lte as Date).getTime();
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;

    expect(lteDateMs).toBeGreaterThanOrEqual(before - thirtyDaysMs - 100);
    expect(lteDateMs).toBeLessThanOrEqual(after - thirtyDaysMs + 100);
  });
});
