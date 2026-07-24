import * as service from '../services/achievement-challenge.service';

jest.mock('../lib/prisma', () => ({
  prisma: {
    achievement: { findUnique: jest.fn() },
    friendship: { findFirst: jest.fn() },
    achievementChallenge: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    notification: { create: jest.fn() },
  },
}));

jest.mock('../services/points.service', () => ({
  awardPoints: jest.fn(),
}));

import { prisma } from '../lib/prisma';
import { awardPoints } from '../services/points.service';

const mockAchievement = prisma.achievement.findUnique as jest.Mock;
const mockFriendship = prisma.friendship.findFirst as jest.Mock;
const mockFindChallenge = prisma.achievementChallenge.findUnique as jest.Mock;
const mockFindFirstChallenge = prisma.achievementChallenge.findFirst as jest.Mock;
const mockCreateChallenge = prisma.achievementChallenge.create as jest.Mock;
const mockUpdateChallenge = prisma.achievementChallenge.update as jest.Mock;
const mockFindManyChallenges = prisma.achievementChallenge.findMany as jest.Mock;
const mockCountChallenges = prisma.achievementChallenge.count as jest.Mock;
const mockNotification = prisma.notification.create as jest.Mock;
const mockAwardPoints = awardPoints as jest.Mock;

const CHALLENGER_ID = 'cchallenger1';
const CHALLENGED_ID = 'cchallenged1';
const ACHIEVEMENT_ID = 'cachievement1';
const CHALLENGE_ID = 'cchallengerow1';

function makeChallengeRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: CHALLENGE_ID,
    challengerId: CHALLENGER_ID,
    challengedId: CHALLENGED_ID,
    achievementId: ACHIEVEMENT_ID,
    status: 'PENDING',
    createdAt: new Date(),
    acceptedAt: null,
    expiresAt: null,
    resolvedAt: null,
    winnerId: null,
    pointsAwarded: null,
    challenger: { id: CHALLENGER_ID, username: 'retador', avatar: null },
    challenged: { id: CHALLENGED_ID, username: 'retado', avatar: null },
    achievement: { id: ACHIEVEMENT_ID, title: 'Primer platino', iconUrl: null },
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockNotification.mockResolvedValue({});
  mockAwardPoints.mockResolvedValue(undefined);
});

describe('createChallenge', () => {
  it('lanza SELF_CHALLENGE si el usuario se reta a sí mismo', async () => {
    await expect(
      service.createChallenge(CHALLENGER_ID, CHALLENGER_ID, ACHIEVEMENT_ID),
    ).rejects.toMatchObject({ code: 'SELF_CHALLENGE', statusCode: 400 });
    expect(mockAchievement).not.toHaveBeenCalled();
  });

  it('lanza ACHIEVEMENT_NOT_FOUND si el logro no existe', async () => {
    mockAchievement.mockResolvedValue(null);

    await expect(
      service.createChallenge(CHALLENGER_ID, CHALLENGED_ID, ACHIEVEMENT_ID),
    ).rejects.toMatchObject({ code: 'ACHIEVEMENT_NOT_FOUND', statusCode: 404 });
    expect(mockFriendship).not.toHaveBeenCalled();
  });

  it('lanza NOT_FRIENDS si no hay amistad aceptada', async () => {
    mockAchievement.mockResolvedValue({ id: ACHIEVEMENT_ID, title: 'Logro' });
    mockFriendship.mockResolvedValue(null);

    await expect(
      service.createChallenge(CHALLENGER_ID, CHALLENGED_ID, ACHIEVEMENT_ID),
    ).rejects.toMatchObject({ code: 'NOT_FRIENDS', statusCode: 403 });
    expect(mockFindChallenge).not.toHaveBeenCalled();
  });

  it('crea el reto y notifica al retado cuando no existe fila previa', async () => {
    mockAchievement.mockResolvedValue({ id: ACHIEVEMENT_ID, title: 'Primer platino' });
    mockFriendship.mockResolvedValue({ id: 'f-1' });
    mockFindChallenge.mockResolvedValue(null);
    mockCreateChallenge.mockResolvedValue(makeChallengeRow());

    const result = await service.createChallenge(CHALLENGER_ID, CHALLENGED_ID, ACHIEVEMENT_ID);

    expect(result.status).toBe('PENDING');
    expect(mockCreateChallenge).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { challengerId: CHALLENGER_ID, challengedId: CHALLENGED_ID, achievementId: ACHIEVEMENT_ID, status: 'PENDING' },
      }),
    );
    expect(mockUpdateChallenge).not.toHaveBeenCalled();
    expect(mockNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: CHALLENGED_ID, type: 'ACHIEVEMENT_CHALLENGE', relatedId: CHALLENGE_ID }),
      }),
    );
  });

  it('lanza CHALLENGE_ALREADY_ACTIVE (409) si ya hay un reto PENDING para el mismo trío', async () => {
    mockAchievement.mockResolvedValue({ id: ACHIEVEMENT_ID, title: 'Logro' });
    mockFriendship.mockResolvedValue({ id: 'f-1' });
    mockFindChallenge.mockResolvedValue({ id: CHALLENGE_ID, status: 'PENDING' });

    await expect(
      service.createChallenge(CHALLENGER_ID, CHALLENGED_ID, ACHIEVEMENT_ID),
    ).rejects.toMatchObject({ code: 'CHALLENGE_ALREADY_ACTIVE', statusCode: 409 });
    expect(mockCreateChallenge).not.toHaveBeenCalled();
    expect(mockUpdateChallenge).not.toHaveBeenCalled();
  });

  it('lanza CHALLENGE_ALREADY_ACTIVE (409) si ya hay un reto ACCEPTED para el mismo trío', async () => {
    mockAchievement.mockResolvedValue({ id: ACHIEVEMENT_ID, title: 'Logro' });
    mockFriendship.mockResolvedValue({ id: 'f-1' });
    mockFindChallenge.mockResolvedValue({ id: CHALLENGE_ID, status: 'ACCEPTED' });

    await expect(
      service.createChallenge(CHALLENGER_ID, CHALLENGED_ID, ACHIEVEMENT_ID),
    ).rejects.toMatchObject({ code: 'CHALLENGE_ALREADY_ACTIVE', statusCode: 409 });
  });

  it.each(['REJECTED', 'EXPIRED', 'RESOLVED_WIN', 'RESOLVED_DRAW'])(
    'reutiliza la fila reseteando a PENDING cuando el estado previo es %s',
    async (previousStatus) => {
      mockAchievement.mockResolvedValue({ id: ACHIEVEMENT_ID, title: 'Logro' });
      mockFriendship.mockResolvedValue({ id: 'f-1' });
      mockFindChallenge.mockResolvedValue({ id: CHALLENGE_ID, status: previousStatus });
      mockUpdateChallenge.mockResolvedValue(makeChallengeRow());

      await service.createChallenge(CHALLENGER_ID, CHALLENGED_ID, ACHIEVEMENT_ID);

      expect(mockUpdateChallenge).toHaveBeenCalledWith({
        where: { id: CHALLENGE_ID },
        data: {
          status: 'PENDING',
          acceptedAt: null,
          expiresAt: null,
          resolvedAt: null,
          winnerId: null,
          pointsAwarded: null,
        },
        select: expect.any(Object),
      });
      expect(mockCreateChallenge).not.toHaveBeenCalled();
    },
  );
});

describe('acceptChallenge', () => {
  it('lanza CHALLENGE_NOT_FOUND si no existe', async () => {
    mockFindChallenge.mockResolvedValue(null);

    await expect(service.acceptChallenge(CHALLENGE_ID, CHALLENGED_ID)).rejects.toMatchObject({
      code: 'CHALLENGE_NOT_FOUND',
      statusCode: 404,
    });
  });

  it('lanza FORBIDDEN si quien acepta no es el retado', async () => {
    mockFindChallenge.mockResolvedValue({
      id: CHALLENGE_ID,
      challengedId: CHALLENGED_ID,
      challengerId: CHALLENGER_ID,
      status: 'PENDING',
    });

    await expect(service.acceptChallenge(CHALLENGE_ID, CHALLENGER_ID)).rejects.toMatchObject({
      code: 'FORBIDDEN',
      statusCode: 403,
    });
    expect(mockUpdateChallenge).not.toHaveBeenCalled();
  });

  it('lanza CHALLENGE_NOT_PENDING si ya no está PENDING (incluye doble aceptación)', async () => {
    mockFindChallenge.mockResolvedValue({
      id: CHALLENGE_ID,
      challengedId: CHALLENGED_ID,
      challengerId: CHALLENGER_ID,
      status: 'ACCEPTED',
    });

    await expect(service.acceptChallenge(CHALLENGE_ID, CHALLENGED_ID)).rejects.toMatchObject({
      code: 'CHALLENGE_NOT_PENDING',
      statusCode: 409,
    });
  });

  it('acepta el reto, fija expiresAt = acceptedAt + 7 días exactos y notifica al retador', async () => {
    mockFindChallenge.mockResolvedValue({
      id: CHALLENGE_ID,
      challengedId: CHALLENGED_ID,
      challengerId: CHALLENGER_ID,
      status: 'PENDING',
    });
    mockUpdateChallenge.mockResolvedValue(makeChallengeRow({ status: 'ACCEPTED' }));

    await service.acceptChallenge(CHALLENGE_ID, CHALLENGED_ID);

    const updateCall = mockUpdateChallenge.mock.calls[0][0];
    expect(updateCall.data.status).toBe('ACCEPTED');
    const acceptedAt: Date = updateCall.data.acceptedAt;
    const expiresAt: Date = updateCall.data.expiresAt;
    expect(expiresAt.getTime() - acceptedAt.getTime()).toBe(7 * 24 * 60 * 60 * 1000);

    expect(mockNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: CHALLENGER_ID, type: 'ACHIEVEMENT_CHALLENGE', relatedId: CHALLENGE_ID }),
      }),
    );
  });
});

describe('rejectChallenge', () => {
  it('lanza CHALLENGE_NOT_FOUND si no existe', async () => {
    mockFindChallenge.mockResolvedValue(null);

    await expect(service.rejectChallenge(CHALLENGE_ID, CHALLENGED_ID)).rejects.toMatchObject({
      code: 'CHALLENGE_NOT_FOUND',
      statusCode: 404,
    });
  });

  it('lanza FORBIDDEN si quien rechaza no es el retado', async () => {
    mockFindChallenge.mockResolvedValue({
      id: CHALLENGE_ID,
      challengedId: CHALLENGED_ID,
      challengerId: CHALLENGER_ID,
      status: 'PENDING',
    });

    await expect(service.rejectChallenge(CHALLENGE_ID, CHALLENGER_ID)).rejects.toMatchObject({
      code: 'FORBIDDEN',
      statusCode: 403,
    });
  });

  it('lanza CHALLENGE_NOT_PENDING si ya fue resuelto', async () => {
    mockFindChallenge.mockResolvedValue({
      id: CHALLENGE_ID,
      challengedId: CHALLENGED_ID,
      challengerId: CHALLENGER_ID,
      status: 'REJECTED',
    });

    await expect(service.rejectChallenge(CHALLENGE_ID, CHALLENGED_ID)).rejects.toMatchObject({
      code: 'CHALLENGE_NOT_PENDING',
      statusCode: 409,
    });
  });

  it('rechaza el reto y notifica al retador', async () => {
    mockFindChallenge.mockResolvedValue({
      id: CHALLENGE_ID,
      challengedId: CHALLENGED_ID,
      challengerId: CHALLENGER_ID,
      status: 'PENDING',
    });
    mockUpdateChallenge.mockResolvedValue(makeChallengeRow({ status: 'REJECTED' }));

    const result = await service.rejectChallenge(CHALLENGE_ID, CHALLENGED_ID);

    expect(result.status).toBe('REJECTED');
    expect(mockUpdateChallenge).toHaveBeenCalledWith({
      where: { id: CHALLENGE_ID },
      data: { status: 'REJECTED' },
      select: expect.any(Object),
    });
    expect(mockNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: CHALLENGER_ID, type: 'ACHIEVEMENT_CHALLENGE', relatedId: CHALLENGE_ID }),
      }),
    );
  });

  it('reutilización tras rechazo: un 2º createChallenge tras REJECTED actualiza la fila existente', async () => {
    mockAchievement.mockResolvedValue({ id: ACHIEVEMENT_ID, title: 'Logro' });
    mockFriendship.mockResolvedValue({ id: 'f-1' });
    mockFindChallenge.mockResolvedValue({ id: CHALLENGE_ID, status: 'REJECTED' });
    mockUpdateChallenge.mockResolvedValue(makeChallengeRow());

    await service.createChallenge(CHALLENGER_ID, CHALLENGED_ID, ACHIEVEMENT_ID);

    expect(mockUpdateChallenge).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: CHALLENGE_ID }, data: expect.objectContaining({ status: 'PENDING' }) }),
    );
    expect(mockCreateChallenge).not.toHaveBeenCalled();
  });
});

describe('listMyChallenges', () => {
  it('devuelve la lista paginada filtrando por challengerId OR challengedId', async () => {
    const row = makeChallengeRow();
    mockFindManyChallenges.mockResolvedValue([row]);
    mockCountChallenges.mockResolvedValue(1);

    const result = await service.listMyChallenges(CHALLENGER_ID, undefined, 1, 20);

    expect(result).toEqual({ data: [row], total: 1, page: 1, limit: 20 });
    expect(mockFindManyChallenges).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { OR: [{ challengerId: CHALLENGER_ID }, { challengedId: CHALLENGER_ID }] },
        skip: 0,
        take: 20,
      }),
    );
  });

  it('aplica el filtro opcional de status', async () => {
    mockFindManyChallenges.mockResolvedValue([]);
    mockCountChallenges.mockResolvedValue(0);

    await service.listMyChallenges(CHALLENGER_ID, 'ACCEPTED', 2, 10);

    expect(mockFindManyChallenges).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: [{ challengerId: CHALLENGER_ID }, { challengedId: CHALLENGER_ID }],
          status: 'ACCEPTED',
        },
        skip: 10,
        take: 10,
      }),
    );
  });
});

describe('resolveAchievementChallenges', () => {
  const UNLOCKED_AT = new Date('2026-07-24T10:00:00Z');

  it('no-op si no hay ningún reto ACCEPTED vigente para ese logro y usuario', async () => {
    mockFindFirstChallenge.mockResolvedValue(null);

    await service.resolveAchievementChallenges(CHALLENGER_ID, ACHIEVEMENT_ID, UNLOCKED_AT);

    expect(mockFindFirstChallenge).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          achievementId: ACHIEVEMENT_ID,
          status: 'ACCEPTED',
          OR: [{ challengerId: CHALLENGER_ID }, { challengedId: CHALLENGER_ID }],
        }),
      }),
    );
    expect(mockUpdateChallenge).not.toHaveBeenCalled();
    expect(mockAwardPoints).not.toHaveBeenCalled();
    expect(mockNotification).not.toHaveBeenCalled();
  });

  it('resuelve el reto: status RESOLVED_WIN, winnerId, pointsAwarded, puntos otorgados y ambas notificaciones', async () => {
    mockFindFirstChallenge.mockResolvedValue({
      id: CHALLENGE_ID,
      challengerId: CHALLENGER_ID,
      challengedId: CHALLENGED_ID,
      achievement: { title: 'Primer platino', normalizedPoints: 50 },
    });
    mockUpdateChallenge.mockResolvedValue(makeChallengeRow({ status: 'RESOLVED_WIN' }));

    await service.resolveAchievementChallenges(CHALLENGED_ID, ACHIEVEMENT_ID, UNLOCKED_AT);

    expect(mockUpdateChallenge).toHaveBeenCalledWith({
      where: { id: CHALLENGE_ID },
      data: {
        status: 'RESOLVED_WIN',
        winnerId: CHALLENGED_ID,
        resolvedAt: expect.any(Date),
        pointsAwarded: 50,
      },
    });
    expect(mockAwardPoints).toHaveBeenCalledWith(CHALLENGED_ID, 50, 'CHALLENGE');
    expect(mockNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: CHALLENGED_ID, type: 'ACHIEVEMENT_CHALLENGE', relatedId: CHALLENGE_ID }),
      }),
    );
    expect(mockNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: CHALLENGER_ID, type: 'ACHIEVEMENT_CHALLENGE', relatedId: CHALLENGE_ID }),
      }),
    );
    expect(mockNotification).toHaveBeenCalledTimes(2);
  });

  it('un logro perteneciente a un reto ya resuelto/expirado no se re-resuelve (filtro status ACCEPTED)', async () => {
    // El filtro status: 'ACCEPTED' del findFirst ya excluye RESOLVED_WIN/RESOLVED_DRAW/EXPIRED —
    // el mock de Prisma simula ese filtro devolviendo null, como lo haría la BD real.
    mockFindFirstChallenge.mockResolvedValue(null);

    await service.resolveAchievementChallenges(CHALLENGER_ID, ACHIEVEMENT_ID, UNLOCKED_AT);

    const callArgs = mockFindFirstChallenge.mock.calls[0][0];
    expect(callArgs.where.status).toBe('ACCEPTED');
    expect(mockUpdateChallenge).not.toHaveBeenCalled();
    expect(mockAwardPoints).not.toHaveBeenCalled();
  });
});
