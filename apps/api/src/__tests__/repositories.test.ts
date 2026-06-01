jest.mock('../lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    refreshToken: {
      create: jest.fn(),
      findFirst: jest.fn(),
      updateMany: jest.fn(),
    },
    friendship: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
  },
}));

import { prisma } from '../lib/prisma';
import * as userRepo from '../repositories/user.repository';
import * as tokenRepo from '../repositories/refreshToken.repository';
import { friendshipRepository } from '../repositories/friendship.repository';

beforeEach(() => {
  jest.clearAllMocks();
  process.env['JWT_ACCESS_SECRET'] = 'test_secret_at_least_32_characters_long_x';
});

// ─── user.repository ──────────────────────────────────────────────────────────

describe('userRepository.findUserByEmail', () => {
  it('llama a prisma.user.findUnique con where email y deletedAt null (GDPR)', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
    await userRepo.findUserByEmail('test@example.com');
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { email: 'test@example.com', deletedAt: null },
    });
  });
});

describe('userRepository.findUserByUsername', () => {
  it('llama a prisma.user.findUnique con where username', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
    await userRepo.findUserByUsername('testuser');
    expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { username: 'testuser' } });
  });
});

describe('userRepository.createUser', () => {
  it('crea usuario con los datos proporcionados', async () => {
    const data = { username: 'u', email: 'e@e.com', passwordHash: 'hash' };
    (prisma.user.create as jest.Mock).mockResolvedValue({ id: '1', ...data });
    await userRepo.createUser(data);
    expect(prisma.user.create).toHaveBeenCalledWith({ data });
  });
});

describe('userRepository.updateUser', () => {
  it('actualiza el usuario por id', async () => {
    (prisma.user.update as jest.Mock).mockResolvedValue({});
    await userRepo.updateUser('user-1', { isPremium: true });
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { isPremium: true },
    });
  });
});

// ─── refreshToken.repository ──────────────────────────────────────────────────

describe('tokenRepository.createRefreshToken', () => {
  it('guarda el token hasheado, no en texto plano', async () => {
    (prisma.refreshToken.create as jest.Mock).mockResolvedValue({});
    const rawToken = 'mi-token-secreto';

    await tokenRepo.createRefreshToken('user-1', rawToken);

    const call = (prisma.refreshToken.create as jest.Mock).mock.calls[0][0] as { data: Record<string, unknown> };
    expect(call.data['tokenHash']).toBeDefined();
    expect(call.data['tokenHash']).not.toBe(rawToken);
    expect(call.data['userId']).toBe('user-1');
    expect(call.data['expiresAt']).toBeInstanceOf(Date);
  });
});

describe('tokenRepository.revokeRefreshToken', () => {
  it('llama a updateMany con el hash del token', async () => {
    (prisma.refreshToken.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
    await tokenRepo.revokeRefreshToken('raw-token');
    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { revokedAt: expect.any(Date) } }),
    );
  });
});

describe('tokenRepository.revokeAllUserTokens', () => {
  it('revoca todos los tokens activos del usuario', async () => {
    (prisma.refreshToken.updateMany as jest.Mock).mockResolvedValue({ count: 3 });
    await tokenRepo.revokeAllUserTokens('user-1');
    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ userId: 'user-1' }) }),
    );
  });
});

// ─── friendship.repository ────────────────────────────────────────────────────

const friendshipMock = prisma.friendship as jest.Mocked<typeof prisma.friendship>;

describe('friendshipRepository.findBetween', () => {
  it('busca amistad en ambas direcciones con OR', async () => {
    (friendshipMock.findFirst as jest.Mock).mockResolvedValue(null);
    await friendshipRepository.findBetween('userA', 'userB');
    expect(friendshipMock.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { OR: [{ senderId: 'userA', receiverId: 'userB' }, { senderId: 'userB', receiverId: 'userA' }] },
      }),
    );
  });
});

describe('friendshipRepository.findById', () => {
  it('busca amistad por id único', async () => {
    (friendshipMock.findUnique as jest.Mock).mockResolvedValue(null);
    await friendshipRepository.findById('friendship-1');
    expect(friendshipMock.findUnique).toHaveBeenCalledWith({ where: { id: 'friendship-1' } });
  });
});

describe('friendshipRepository.create', () => {
  it('crea amistad con status PENDING', async () => {
    (friendshipMock.create as jest.Mock).mockResolvedValue({ id: 'f1' });
    await friendshipRepository.create('sender', 'receiver');
    expect(friendshipMock.create).toHaveBeenCalledWith({
      data: { senderId: 'sender', receiverId: 'receiver', status: 'PENDING' },
    });
  });
});

describe('friendshipRepository.updateStatus', () => {
  it('actualiza el estado de la amistad', async () => {
    (friendshipMock.update as jest.Mock).mockResolvedValue({});
    await friendshipRepository.updateStatus('f1', 'ACCEPTED');
    expect(friendshipMock.update).toHaveBeenCalledWith({
      where: { id: 'f1' },
      data: { status: 'ACCEPTED' },
    });
  });
});

describe('friendshipRepository.delete', () => {
  it('elimina la amistad por id', async () => {
    (friendshipMock.delete as jest.Mock).mockResolvedValue({});
    await friendshipRepository.delete('f1');
    expect(friendshipMock.delete).toHaveBeenCalledWith({ where: { id: 'f1' } });
  });
});

describe('friendshipRepository.findAcceptedFriends', () => {
  it('devuelve amigos aceptados con paginación y count total', async () => {
    (friendshipMock.findMany as jest.Mock).mockResolvedValue([]);
    (friendshipMock.count as jest.Mock).mockResolvedValue(5);
    const [rows, total] = await friendshipRepository.findAcceptedFriends('user-1', 1, 10);
    expect(rows).toEqual([]);
    expect(total).toBe(5);
    expect(friendshipMock.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: 'ACCEPTED', OR: expect.any(Array) }, skip: 0, take: 10 }),
    );
  });
});

describe('friendshipRepository.findPendingReceived', () => {
  it('devuelve solicitudes pendientes recibidas con paginación', async () => {
    (friendshipMock.findMany as jest.Mock).mockResolvedValue([{ id: 'f2' }]);
    (friendshipMock.count as jest.Mock).mockResolvedValue(1);
    const [rows, total] = await friendshipRepository.findPendingReceived('user-2', 2, 5);
    expect(rows).toHaveLength(1);
    expect(total).toBe(1);
    expect(friendshipMock.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { receiverId: 'user-2', status: 'PENDING' }, skip: 5, take: 5 }),
    );
  });
});

describe('friendshipRepository.findAcceptedFriendIds', () => {
  it('devuelve los IDs del otro participante de cada amistad aceptada', async () => {
    (friendshipMock.findMany as jest.Mock).mockResolvedValue([
      { senderId: 'me', receiverId: 'friend-1' },
      { senderId: 'friend-2', receiverId: 'me' },
    ]);
    const ids = await friendshipRepository.findAcceptedFriendIds('me');
    expect(ids).toEqual(['friend-1', 'friend-2']);
  });
});
