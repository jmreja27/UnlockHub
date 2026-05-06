jest.mock('../lib/prisma', () => ({
  prisma: {
    weeklyChallenge: { findFirst: jest.fn(), create: jest.fn() },
    userChallenge: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
  },
}));
jest.mock('../services/points.service', () => ({ awardPoints: jest.fn() }));
jest.mock('../services/activity.service', () => ({ createEvent: jest.fn() }));

import { getActiveChallenge, getUserChallengeStatus, updateProgress, createWeeklyChallenge } from '../services/challenge.service';
import { prisma } from '../lib/prisma';
import { awardPoints } from '../services/points.service';

const mockChallengeFind = prisma.weeklyChallenge.findFirst as jest.Mock;
const mockChallengeCreate = prisma.weeklyChallenge.create as jest.Mock;
const mockUCFind = prisma.userChallenge.findUnique as jest.Mock;
const mockUCCreate = prisma.userChallenge.create as jest.Mock;
const mockUCUpdate = prisma.userChallenge.update as jest.Mock;
const mockAwardPoints = awardPoints as jest.Mock;

const makeChallenge = (overrides = {}) => ({
  id: 'c1', title: 'Reto semanal', description: 'Desbloquea 10 logros',
  metric: 'ACHIEVEMENTS_UNLOCKED', targetValue: 10, xpReward: 500,
  startAt: new Date('2026-01-06'), endAt: new Date('2026-01-13'),
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();
  mockAwardPoints.mockResolvedValue(undefined);
  mockUCUpdate.mockResolvedValue({});
});

describe('getActiveChallenge', () => {
  it('devuelve el reto activo como DTO', async () => {
    mockChallengeFind.mockResolvedValue(makeChallenge());
    const result = await getActiveChallenge();
    expect(result?.metric).toBe('ACHIEVEMENTS_UNLOCKED');
    expect(result?.startAt).toBe('2026-01-06T00:00:00.000Z');
  });

  it('devuelve null si no hay reto activo', async () => {
    mockChallengeFind.mockResolvedValue(null);
    const result = await getActiveChallenge();
    expect(result).toBeNull();
  });
});

describe('getUserChallengeStatus', () => {
  it('devuelve el estado del usuario si ya está inscrito', async () => {
    mockChallengeFind.mockResolvedValue(makeChallenge());
    mockUCFind.mockResolvedValue({ id: 'uc1', userId: 'u1', challengeId: 'c1', progress: 3, completedAt: null, challenge: makeChallenge() });
    const result = await getUserChallengeStatus('u1');
    expect(result?.progress).toBe(3);
  });

  it('crea UserChallenge con progreso 0 si no existe', async () => {
    mockChallengeFind.mockResolvedValue(makeChallenge());
    mockUCFind.mockResolvedValue(null);
    mockUCCreate.mockResolvedValue({ id: 'uc1', userId: 'u1', challengeId: 'c1', progress: 0, completedAt: null, challenge: makeChallenge() });
    const result = await getUserChallengeStatus('u1');
    expect(result?.progress).toBe(0);
    expect(mockUCCreate).toHaveBeenCalled();
  });

  it('devuelve null si no hay reto activo', async () => {
    mockChallengeFind.mockResolvedValue(null);
    const result = await getUserChallengeStatus('u1');
    expect(result).toBeNull();
  });
});

describe('updateProgress', () => {
  it('no hace nada si el reto ya está completado', async () => {
    mockUCFind.mockResolvedValue({ progress: 10, completedAt: new Date(), challenge: makeChallenge() });
    await updateProgress('u1', 'c1', 1);
    expect(mockUCUpdate).not.toHaveBeenCalled();
  });

  it('actualiza el progreso sin completar si no alcanza el target', async () => {
    mockUCFind.mockResolvedValue({ progress: 4, completedAt: null, challenge: makeChallenge() });
    await updateProgress('u1', 'c1', 3);
    expect(mockUCUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ progress: 7, completedAt: null }) }));
    expect(mockAwardPoints).not.toHaveBeenCalled();
  });

  it('marca como completado y otorga puntos al alcanzar el target', async () => {
    mockUCFind.mockResolvedValue({ progress: 8, completedAt: null, challenge: makeChallenge() });
    await updateProgress('u1', 'c1', 5);
    expect(mockUCUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ completedAt: expect.any(Date) }) }));
    expect(mockAwardPoints).toHaveBeenCalledWith('u1', 500, 'CHALLENGE');
  });
});

describe('createWeeklyChallenge', () => {
  it('crea un reto si no hay solapamiento de fechas', async () => {
    mockChallengeFind.mockResolvedValue(null);
    mockChallengeCreate.mockResolvedValue(makeChallenge());
    const result = await createWeeklyChallenge({
      title: 'Test', description: 'Desc', metric: 'XP_GAINED',
      targetValue: 1000, xpReward: 500,
      startAt: new Date('2026-01-20'), endAt: new Date('2026-01-27'),
    });
    expect(result.title).toBe('Reto semanal');
  });

  it('lanza error si hay solapamiento de fechas', async () => {
    mockChallengeFind.mockResolvedValue(makeChallenge());
    await expect(createWeeklyChallenge({
      title: 'Test', description: 'Desc', metric: 'XP_GAINED',
      targetValue: 1000, xpReward: 500,
      startAt: new Date('2026-01-06'), endAt: new Date('2026-01-13'),
    })).rejects.toMatchObject({ code: 'CHALLENGE_OVERLAP' });
  });
});
