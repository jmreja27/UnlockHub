jest.mock('../lib/prisma', () => ({
  prisma: {
    activityEvent: { create: jest.fn(), findMany: jest.fn() },
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

    const result = await getFriendsFeed('u1', 20);

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: { in: ['u2', 'u3', 'u1'] } } }),
    );
    expect(result.data).toHaveLength(1);
  });

  it('devuelve feed vacío si no hay amigos ni eventos propios', async () => {
    mockFriendIds.mockResolvedValue([]);
    const result = await getFriendsFeed('u1', 20);
    expect(result.data).toHaveLength(0);
    expect(result.nextCursor).toBeNull();
  });

  it('devuelve nextCursor igual al id del último evento cuando hay página completa', async () => {
    const rows = Array.from({ length: 20 }, (_, i) => makeRow({ id: `e${i + 1}` }));
    mockFriendIds.mockResolvedValue([]);
    mockFindMany.mockResolvedValue(rows);

    const result = await getFriendsFeed('u1', 20);

    expect(result.nextCursor).toBe('e20');
  });

  it('devuelve nextCursor null cuando hay menos eventos que el límite', async () => {
    mockFriendIds.mockResolvedValue([]);
    mockFindMany.mockResolvedValue([makeRow()]);

    const result = await getFriendsFeed('u1', 20);

    expect(result.nextCursor).toBeNull();
  });

  it('pasa el cursor como filtro id lt al hacer paginación', async () => {
    mockFriendIds.mockResolvedValue([]);
    mockFindMany.mockResolvedValue([]);

    await getFriendsFeed('u1', 20, 'cursor123');

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: { lt: 'cursor123' } }),
      }),
    );
  });

  it('no incluye filtro id cuando no se pasa cursor', async () => {
    mockFriendIds.mockResolvedValue([]);
    mockFindMany.mockResolvedValue([]);

    await getFriendsFeed('u1', 20);

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.not.objectContaining({ id: expect.anything() }),
      }),
    );
  });
});

describe('getPublicFeed', () => {
  it('devuelve eventos paginados de todos los usuarios con nextCursor correcto', async () => {
    const rows = Array.from({ length: 20 }, (_, i) => makeRow({ id: `e${i + 1}` }));
    mockFindMany.mockResolvedValue(rows);

    const result = await getPublicFeed(20);

    expect(result.data).toHaveLength(20);
    expect(result.nextCursor).toBe('e20');
    expect(result.data[0]?.user?.username).toBe('player1');
  });

  it('devuelve nextCursor null en la última página (menos eventos que el límite)', async () => {
    mockFindMany.mockResolvedValue([makeRow(), makeRow({ id: 'e2' })]);

    const result = await getPublicFeed(20);

    expect(result.data).toHaveLength(2);
    expect(result.nextCursor).toBeNull();
  });

  it('pasa el cursor como filtro id lt al paginar', async () => {
    mockFindMany.mockResolvedValue([]);

    await getPublicFeed(20, 'cursor123');

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: { lt: 'cursor123' } }),
      }),
    );
  });

  it('no incluye filtro id cuando no se pasa cursor', async () => {
    mockFindMany.mockResolvedValue([]);

    await getPublicFeed(20);

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.not.objectContaining({ id: expect.anything() }),
      }),
    );
  });

  it('no llama a count()', async () => {
    mockFindMany.mockResolvedValue([makeRow()]);

    await getPublicFeed(20);

    // prisma.activityEvent.count no existe en el mock — si se llamara lanzaría error
    expect(mockFindMany).toHaveBeenCalledTimes(1);
  });
});
