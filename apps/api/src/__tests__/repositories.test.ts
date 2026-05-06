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
  },
}));

import { prisma } from '../lib/prisma';
import * as userRepo from '../repositories/user.repository';
import * as tokenRepo from '../repositories/refreshToken.repository';

beforeEach(() => {
  jest.clearAllMocks();
  process.env['JWT_ACCESS_SECRET'] = 'test_secret_at_least_32_characters_long_x';
});

// ─── user.repository ──────────────────────────────────────────────────────────

describe('userRepository.findUserByEmail', () => {
  it('llama a prisma.user.findUnique con where email', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
    await userRepo.findUserByEmail('test@example.com');
    expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { email: 'test@example.com' } });
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
