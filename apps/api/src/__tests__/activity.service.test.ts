jest.mock('../lib/prisma', () => ({
  prisma: {
    activityEvent: { create: jest.fn(), findMany: jest.fn(), count: jest.fn() },
  },
}));
jest.mock('../repositories/friendship.repository', () => ({
  friendshipRepository: { findAcceptedFriendIds: jest.fn() },
}));

import { createEvent, getFriendsFeed, getPublicFeed } from '../services/activity.service';
import { prisma } from '../lib/prisma';
import { friendshipRepository } from '../repositories/friendship.repository';

const mockCreate = prisma.activityEvent.create as jest.Mock;
const mockFindMany = prisma.activityEvent.findMany as jest.Mock;
const mockCount = prisma.activityEvent.count as jest.Mock;
const mockFriendIds = friendshipRepository.findAcceptedFriendIds as jest.Mock;

const makeRow = (overrides = {}) => ({
  id: 'e1',
  userId: 'u1',
  type: 'ACHIEVEMENT_UNLOCKED',
  payload: { achievementId: 'a1' },
  createdAt: new Date('2026-01-01T00:00:00Z'),
  user: { id: 'u1', username: 'player1', avatar: null },
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();
  mockFindMany.mockResolvedValue([]);
  mockCount.mockResolvedValue(0);
});

describe('createEvent', () => {
  it('crea un evento y lo devuelve como DTO', async () => {
    mockCreate.mockResolvedValue(makeRow());
    const result = await createEvent('u1', 'ACHIEVEMENT_UNLOCKED', { achievementId: 'a1' });
    expect(result.type).toBe('ACHIEVEMENT_UNLOCKED');
    expect(result.createdAt).toBe('2026-01-01T00:00:00.000Z');
    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ userId: 'u1' }) }));
  });

  it('usa payload vacío si no se proporciona', async () => {
    mockCreate.mockResolvedValue(makeRow({ payload: {} }));
    await createEvent('u1', 'LEVEL_UP');
    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ payload: {} }) }));
  });
});

describe('getFriendsFeed', () => {
  it('incluye eventos propios y de amigos', async () => {
    mockFriendIds.mockResolvedValue(['u2', 'u3']);
    mockFindMany.mockResolvedValue([makeRow()]);
    mockCount.mockResolvedValue(1);

    const result = await getFriendsFeed('u1', 1, 20);

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: { in: ['u2', 'u3', 'u1'] } } }),
    );
    expect(result.total).toBe(1);
    expect(result.data).toHaveLength(1);
  });

  it('devuelve feed vacío si no hay amigos ni eventos propios', async () => {
    mockFriendIds.mockResolvedValue([]);
    const result = await getFriendsFeed('u1', 1, 20);
    expect(result.data).toHaveLength(0);
    expect(result.total).toBe(0);
  });
});

describe('getPublicFeed', () => {
  it('devuelve eventos paginados de todos los usuarios', async () => {
    mockFindMany.mockResolvedValue([makeRow(), makeRow({ id: 'e2' })]);
    mockCount.mockResolvedValue(2);

    const result = await getPublicFeed(1, 20);

    expect(result.total).toBe(2);
    expect(result.data).toHaveLength(2);
    expect(result.data[0]?.user?.username).toBe('player1');
  });
});
