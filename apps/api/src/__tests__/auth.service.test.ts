import bcrypt from 'bcrypt';

import * as authService from '../services/auth.service';
import * as userRepo from '../repositories/user.repository';
import * as tokenRepo from '../repositories/refreshToken.repository';
import { AppError } from '../middleware/errorHandler';

jest.mock('../repositories/user.repository');
jest.mock('../repositories/refreshToken.repository');
jest.mock('../services/email.service', () => ({
  sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../lib/prisma', () => ({
  prisma: {
    passwordResetToken: {
      deleteMany: jest.fn().mockResolvedValue({}),
      create: jest.fn().mockResolvedValue({}),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    user: { update: jest.fn() },
    refreshToken: { updateMany: jest.fn() },
    $transaction: jest.fn().mockResolvedValue([]),
  },
}));
jest.mock('../services/ranking.service', () => ({
  upsertUserScore: jest.fn().mockResolvedValue(undefined),
}));

import { prisma } from '../lib/prisma';
import * as emailService from '../services/email.service';
import { upsertUserScore } from '../services/ranking.service';

const mockUserRepo = userRepo as jest.Mocked<typeof userRepo>;
const mockTokenRepo = tokenRepo as jest.Mocked<typeof tokenRepo>;
const mockUpsertUserScore = upsertUserScore as jest.Mock;

const baseUser = {
  id: 'user-1',
  username: 'testuser',
  email: 'test@example.com',
  passwordHash: '',
  birthDate: new Date('2000-01-01'),
  avatar: null,
  banner: null,
  bio: null,
  level: 1,
  xp: 0,
  streakDays: 0,
  streakShields: 0,
  countryCode: null,
  role: 'USER' as const,
  isPremium: false,
  premiumUntil: null,
  lastSyncAt: null,
  profileVisibility: 'PUBLIC' as const,
  deletedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

beforeEach(() => {
  jest.clearAllMocks();
  process.env['JWT_ACCESS_SECRET'] = 'test_secret_at_least_32_characters_long_x';
  process.env['JWT_REFRESH_SECRET'] = 'test_refresh_secret_at_least_32_chars_xx';
  process.env['ENCRYPTION_KEY'] = '0'.repeat(64);
});

describe('authService.register', () => {
  it('crea usuario y devuelve tokens cuando el email y username son únicos', async () => {
    mockUserRepo.findUserByEmail.mockResolvedValue(null);
    mockUserRepo.findUserByUsername.mockResolvedValue(null);
    mockUserRepo.createUser.mockResolvedValue(baseUser);
    mockTokenRepo.createRefreshToken.mockResolvedValue({} as never);

    const result = await authService.register({
      username: 'testuser',
      email: 'test@example.com',
      password: 'Password1',
      birthDate: new Date('2000-01-01'),
    });

    expect(result.user.id).toBe('user-1');
    expect(result.accessToken).toBeTruthy();
    expect(result.refreshToken).toBeTruthy();
  });

  it('T145: añade al usuario al ranking global con XP 0 desde el alta (el perfil nace PUBLIC, sin plataformas vinculadas)', async () => {
    mockUserRepo.findUserByEmail.mockResolvedValue(null);
    mockUserRepo.findUserByUsername.mockResolvedValue(null);
    mockUserRepo.createUser.mockResolvedValue(baseUser);
    mockTokenRepo.createRefreshToken.mockResolvedValue({} as never);

    await authService.register({
      username: 'testuser',
      email: 'test@example.com',
      password: 'Password1',
      birthDate: new Date('2000-01-01'),
    });

    expect(mockUpsertUserScore).toHaveBeenCalledWith('user-1', 0, []);
  });

  it('lanza EMAIL_TAKEN si el email ya existe', async () => {
    mockUserRepo.findUserByEmail.mockResolvedValue(baseUser);
    mockUserRepo.findUserByUsername.mockResolvedValue(null);

    await expect(
      authService.register({
        username: 'otro',
        email: 'test@example.com',
        password: 'Password1',
        birthDate: new Date('2000-01-01'),
      }),
    ).rejects.toMatchObject({ code: 'EMAIL_TAKEN', statusCode: 409 });
  });

  it('lanza USERNAME_TAKEN si el username ya existe', async () => {
    mockUserRepo.findUserByEmail.mockResolvedValue(null);
    mockUserRepo.findUserByUsername.mockResolvedValue(baseUser);

    await expect(
      authService.register({
        username: 'testuser',
        email: 'nuevo@example.com',
        password: 'Password1',
        birthDate: new Date('2000-01-01'),
      }),
    ).rejects.toMatchObject({ code: 'USERNAME_TAKEN', statusCode: 409 });
  });
});

describe('authService.login', () => {
  it('devuelve tokens con credenciales correctas', async () => {
    const hash = await bcrypt.hash('Password1', 12);
    mockUserRepo.findUserByEmail.mockResolvedValue({ ...baseUser, passwordHash: hash });
    mockTokenRepo.createRefreshToken.mockResolvedValue({} as never);

    const result = await authService.login({ email: 'test@example.com', password: 'Password1' });

    expect(result.accessToken).toBeTruthy();
    expect(result.refreshToken).toBeTruthy();
  });

  it('lanza INVALID_CREDENTIALS con contraseña incorrecta', async () => {
    const hash = await bcrypt.hash('Password1', 12);
    mockUserRepo.findUserByEmail.mockResolvedValue({ ...baseUser, passwordHash: hash });

    await expect(
      authService.login({ email: 'test@example.com', password: 'Wrong1234' }),
    ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS', statusCode: 401 });
  });

  it('lanza INVALID_CREDENTIALS si el usuario no existe', async () => {
    mockUserRepo.findUserByEmail.mockResolvedValue(null);

    await expect(
      authService.login({ email: 'noexiste@example.com', password: 'Password1' }),
    ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS', statusCode: 401 });
  });
});

describe('authService.refresh', () => {
  it('rota el refresh token y devuelve nuevos tokens', async () => {
    mockTokenRepo.findValidRefreshToken.mockResolvedValue({
      id: 'tok-1',
      userId: 'user-1',
      tokenHash: 'hash',
      expiresAt: new Date(Date.now() + 10000),
      createdAt: new Date(),
      revokedAt: null,
      user: baseUser,
    } as never);
    mockTokenRepo.revokeRefreshToken.mockResolvedValue();
    mockTokenRepo.createRefreshToken.mockResolvedValue({} as never);

    const result = await authService.refresh('valid-raw-token');

    expect(result.accessToken).toBeTruthy();
    expect(result.refreshToken).toBeTruthy();
    expect(mockTokenRepo.revokeRefreshToken).toHaveBeenCalledWith('valid-raw-token');
  });

  it('lanza INVALID_REFRESH_TOKEN si el token no existe o está revocado', async () => {
    mockTokenRepo.findValidRefreshToken.mockResolvedValue(null);

    await expect(authService.refresh('bad-token')).rejects.toMatchObject({
      code: 'INVALID_REFRESH_TOKEN',
      statusCode: 401,
    });
  });
});

describe('authService.logout', () => {
  it('revoca el refresh token', async () => {
    mockTokenRepo.revokeRefreshToken.mockResolvedValue();

    await authService.logout('raw-token');

    expect(mockTokenRepo.revokeRefreshToken).toHaveBeenCalledWith('raw-token');
  });
});

describe('authService.logoutAll', () => {
  it('revoca todos los tokens del usuario', async () => {
    mockTokenRepo.revokeAllUserTokens.mockResolvedValue();

    await authService.logoutAll('user-1');

    expect(mockTokenRepo.revokeAllUserTokens).toHaveBeenCalledWith('user-1');
  });
});

describe('authService.forgotPassword', () => {
  it('no lanza si el email no existe (user enumeration protection)', async () => {
    mockUserRepo.findUserByEmail.mockResolvedValue(null);

    await expect(authService.forgotPassword('noexiste@example.com')).resolves.toBeUndefined();
    expect(emailService.sendPasswordResetEmail).not.toHaveBeenCalled();
  });

  it('crea token y envía email cuando el usuario existe', async () => {
    mockUserRepo.findUserByEmail.mockResolvedValue(baseUser);

    await authService.forgotPassword('test@example.com');

    expect(prisma.passwordResetToken.deleteMany).toHaveBeenCalledWith({ where: { userId: 'user-1' } });
    expect(prisma.passwordResetToken.create).toHaveBeenCalled();
    expect(emailService.sendPasswordResetEmail).toHaveBeenCalledWith(
      'test@example.com',
      expect.stringContaining('reset-redirect'),
    );
  });

  // T115 — el email debe apuntar a la página https:// de redirección, no al scheme
  // unlockhub:// directo (algunos clientes de email bloquean/reescriben esquemas custom).
  it('la URL del email es https:// (endpoint reset-redirect), no unlockhub:// directo', async () => {
    mockUserRepo.findUserByEmail.mockResolvedValue(baseUser);

    await authService.forgotPassword('test@example.com');

    const [, resetUrl] = (emailService.sendPasswordResetEmail as jest.Mock).mock.calls[0] as [
      string,
      string,
    ];

    expect(resetUrl.startsWith('https://')).toBe(true);
    expect(resetUrl).toContain('/api/v1/auth/reset-redirect?token=');
    expect(resetUrl).not.toMatch(/^unlockhub:\/\//);
  });
});

describe('authService.resetPassword', () => {
  const validRecord = {
    id: 'prt-1',
    userId: 'user-1',
    tokenHash: expect.any(String),
    usedAt: null,
    expiresAt: new Date(Date.now() + 3600 * 1000),
    createdAt: new Date(),
  };

  it('lanza INVALID_RESET_TOKEN si el token no existe', async () => {
    (prisma.passwordResetToken.findUnique as jest.Mock).mockResolvedValue(null);

    await expect(authService.resetPassword('bad-token', 'NewPass1!')).rejects.toMatchObject({
      code: 'INVALID_RESET_TOKEN',
      statusCode: 400,
    });
  });

  it('lanza INVALID_RESET_TOKEN si el token ya fue usado', async () => {
    (prisma.passwordResetToken.findUnique as jest.Mock).mockResolvedValue({
      ...validRecord,
      usedAt: new Date(),
    });

    await expect(authService.resetPassword('used-token', 'NewPass1!')).rejects.toMatchObject({
      code: 'INVALID_RESET_TOKEN',
    });
  });

  it('actualiza la contraseña y ejecuta transacción cuando el token es válido', async () => {
    (prisma.passwordResetToken.findUnique as jest.Mock).mockResolvedValue(validRecord);

    await authService.resetPassword('valid-token', 'NewPass1!');

    expect(prisma.$transaction).toHaveBeenCalled();
  });
});

describe('AppError', () => {
  it('es instancia de Error', () => {
    const err = new AppError('msg', 'CODE', 400);
    expect(err).toBeInstanceOf(Error);
    expect(err.code).toBe('CODE');
    expect(err.statusCode).toBe(400);
  });
});
