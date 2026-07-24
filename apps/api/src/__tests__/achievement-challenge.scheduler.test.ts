import { sendChallengeReminders, expireAchievementChallenges } from '../jobs/achievement-challenge.scheduler';

jest.mock('../lib/prisma', () => ({
  prisma: {
    achievementChallenge: {
      findMany: jest.fn(),
      update: jest.fn(),
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

jest.mock('../services/inapp-notification.service', () => ({
  createNotification: jest.fn().mockResolvedValue(undefined),
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
import { createNotification } from '../services/inapp-notification.service';

const mockPrisma = prisma as jest.Mocked<typeof prisma>;
const mockCreateNotification = createNotification as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('sendChallengeReminders', () => {
  it('notifica a ambos participantes de cada reto ACCEPTED vigente con los días restantes', async () => {
    const now = new Date('2026-07-24T00:00:00.000Z');
    jest.useFakeTimers().setSystemTime(now);

    const expiresAt = new Date('2026-07-27T00:00:00.000Z'); // +3 días
    (mockPrisma.achievementChallenge.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'challenge-1',
        challengerId: 'user-a',
        challengedId: 'user-b',
        expiresAt,
        achievement: { title: 'Speedrunner' },
      },
    ]);

    await sendChallengeReminders();

    expect(mockCreateNotification).toHaveBeenCalledTimes(2);
    expect(mockCreateNotification).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-a', type: 'ACHIEVEMENT_CHALLENGE', relatedId: 'challenge-1' }),
    );
    expect(mockCreateNotification).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-b', type: 'ACHIEVEMENT_CHALLENGE', relatedId: 'challenge-1' }),
    );
    const call = mockCreateNotification.mock.calls[0][0];
    expect(call.body).toContain('3 días');

    jest.useRealTimers();
  });

  it('no falla si no hay retos activos (idempotente, no-op limpio)', async () => {
    (mockPrisma.achievementChallenge.findMany as jest.Mock).mockResolvedValue([]);

    await expect(sendChallengeReminders()).resolves.not.toThrow();

    expect(mockCreateNotification).not.toHaveBeenCalled();
  });

  it('solo consulta retos ACCEPTED con expiresAt en el futuro', async () => {
    (mockPrisma.achievementChallenge.findMany as jest.Mock).mockResolvedValue([]);

    await sendChallengeReminders();

    expect(mockPrisma.achievementChallenge.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: 'ACCEPTED', expiresAt: { gt: expect.any(Date) } },
      }),
    );
  });

  it('calcula "1 día" (singular) cuando expira justo al día siguiente', async () => {
    const now = new Date('2026-07-24T12:00:00.000Z');
    jest.useFakeTimers().setSystemTime(now);

    const expiresAt = new Date('2026-07-25T10:00:00.000Z'); // <24h restantes, redondea a 1 día
    (mockPrisma.achievementChallenge.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'challenge-2',
        challengerId: 'user-a',
        challengedId: 'user-b',
        expiresAt,
        achievement: { title: 'Last Day' },
      },
    ]);

    await sendChallengeReminders();

    const call = mockCreateNotification.mock.calls[0][0];
    expect(call.body).toContain('1 día');
    expect(call.body).not.toContain('1 días');

    jest.useRealTimers();
  });
});

describe('expireAchievementChallenges', () => {
  it('marca como EXPIRED los retos ACCEPTED cuyo plazo venció y notifica a ambos participantes', async () => {
    (mockPrisma.achievementChallenge.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'challenge-1',
        challengerId: 'user-a',
        challengedId: 'user-b',
        achievement: { title: 'Speedrunner' },
      },
    ]);
    (mockPrisma.achievementChallenge.update as jest.Mock).mockResolvedValue({});

    await expireAchievementChallenges();

    expect(mockPrisma.achievementChallenge.update).toHaveBeenCalledWith({
      where: { id: 'challenge-1' },
      data: { status: 'EXPIRED', resolvedAt: expect.any(Date) },
    });
    expect(mockCreateNotification).toHaveBeenCalledTimes(2);
    expect(mockCreateNotification).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-a', relatedId: 'challenge-1', title: 'Reto expirado' }),
    );
    expect(mockCreateNotification).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-b', relatedId: 'challenge-1', title: 'Reto expirado' }),
    );
  });

  it('no falla si no hay retos que expirar (idempotente, no-op limpio)', async () => {
    (mockPrisma.achievementChallenge.findMany as jest.Mock).mockResolvedValue([]);

    await expect(expireAchievementChallenges()).resolves.not.toThrow();

    expect(mockPrisma.achievementChallenge.update).not.toHaveBeenCalled();
    expect(mockCreateNotification).not.toHaveBeenCalled();
  });

  it('solo consulta retos ACCEPTED con expiresAt <= ahora', async () => {
    (mockPrisma.achievementChallenge.findMany as jest.Mock).mockResolvedValue([]);

    await expireAchievementChallenges();

    expect(mockPrisma.achievementChallenge.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: 'ACCEPTED', expiresAt: { lte: expect.any(Date) } },
      }),
    );
  });

  it('idempotencia: en una segunda pasada, el filtro status=ACCEPTED excluye el ya expirado', async () => {
    // Primera pasada: 1 reto ACCEPTED vencido
    (mockPrisma.achievementChallenge.findMany as jest.Mock).mockResolvedValueOnce([
      {
        id: 'challenge-1',
        challengerId: 'user-a',
        challengedId: 'user-b',
        achievement: { title: 'Speedrunner' },
      },
    ]);
    (mockPrisma.achievementChallenge.update as jest.Mock).mockResolvedValue({});

    await expireAchievementChallenges();
    expect(mockPrisma.achievementChallenge.update).toHaveBeenCalledTimes(1);
    expect(mockCreateNotification).toHaveBeenCalledTimes(2);

    jest.clearAllMocks();

    // Segunda pasada: la query real filtraría status=ACCEPTED, así que el mock simula
    // que el reto ya EXPIRED no vuelve a aparecer en el resultado.
    (mockPrisma.achievementChallenge.findMany as jest.Mock).mockResolvedValueOnce([]);

    await expireAchievementChallenges();
    expect(mockPrisma.achievementChallenge.update).not.toHaveBeenCalled();
    expect(mockCreateNotification).not.toHaveBeenCalled();
  });
});
