import * as service from '../services/achievement-challenge.service';

jest.mock('../lib/prisma', () => ({
  prisma: {
    achievement: { findUnique: jest.fn() },
    friendship: { findFirst: jest.fn() },
    user: { findUnique: jest.fn() },
    notification: { create: jest.fn() },
  },
}));

import { prisma } from '../lib/prisma';

const mockAchievement = prisma.achievement.findUnique as jest.Mock;
const mockFriendship = prisma.friendship.findFirst as jest.Mock;
const mockUser = prisma.user.findUnique as jest.Mock;
const mockNotification = prisma.notification.create as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockNotification.mockResolvedValue({});
});

describe('challengeFriend', () => {
  it('crea notificación cuando todo es válido', async () => {
    mockAchievement.mockResolvedValue({ id: 'ach-1', title: 'Primer platino' });
    mockFriendship.mockResolvedValue({ id: 'f-1' });
    mockUser.mockResolvedValue({ username: 'player1' });

    const result = await service.challengeFriend('user-1', 'ach-1', 'user-2');

    expect(result).toEqual({ ok: true });
    expect(mockNotification).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ userId: 'user-2', type: 'ACHIEVEMENT_CHALLENGE' }) }),
    );
  });

  it('lanza SELF_CHALLENGE si el usuario se reta a sí mismo', async () => {
    await expect(service.challengeFriend('user-1', 'ach-1', 'user-1')).rejects.toMatchObject({
      code: 'SELF_CHALLENGE',
      statusCode: 400,
    });
    expect(mockAchievement).not.toHaveBeenCalled();
  });

  it('lanza ACHIEVEMENT_NOT_FOUND si el logro no existe', async () => {
    mockAchievement.mockResolvedValue(null);

    await expect(service.challengeFriend('user-1', 'no-existe', 'user-2')).rejects.toMatchObject({
      code: 'ACHIEVEMENT_NOT_FOUND',
      statusCode: 404,
    });
    expect(mockFriendship).not.toHaveBeenCalled();
  });

  it('lanza NOT_FRIENDS si no hay amistad aceptada', async () => {
    mockAchievement.mockResolvedValue({ id: 'ach-1', title: 'Logro' });
    mockFriendship.mockResolvedValue(null);

    await expect(service.challengeFriend('user-1', 'ach-1', 'user-2')).rejects.toMatchObject({
      code: 'NOT_FRIENDS',
      statusCode: 403,
    });
    expect(mockNotification).not.toHaveBeenCalled();
  });

  it('usa "Alguien" como fallback si el retador no tiene username', async () => {
    mockAchievement.mockResolvedValue({ id: 'ach-1', title: 'Logro' });
    mockFriendship.mockResolvedValue({ id: 'f-1' });
    mockUser.mockResolvedValue(null);

    await service.challengeFriend('user-1', 'ach-1', 'user-2');

    expect(mockNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ title: expect.stringContaining('Alguien') }),
      }),
    );
  });
});
