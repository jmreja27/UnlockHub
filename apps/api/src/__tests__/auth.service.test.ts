import bcrypt from 'bcrypt';

import * as authService from '../services/auth.service';
import * as userRepo from '../repositories/user.repository';
import * as tokenRepo from '../repositories/refreshToken.repository';
import { AppError } from '../middleware/errorHandler';

jest.mock('../repositories/user.repository');
jest.mock('../repositories/refreshToken.repository');
jest.mock('../lib/prisma', () => ({ prisma: {} }));

const mockUserRepo = userRepo as jest.Mocked<typeof userRepo>;
const mockTokenRepo = tokenRepo as jest.Mocked<typeof tokenRepo>;

const baseUser = {
  id: 'user-1',
  username: 'testuser',
  email: 'test@example.com',
  passwordHash: '',
  avatar: null,
  banner: null,
  bio: null,
  level: 1,
  xp: 0,
  streakDays: 0,
  countryCode: null,
  isPremium: false,
  premiumUntil: null,
  lastSyncAt: null,
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
    });

    expect(result.user.id).toBe('user-1');
    expect(result.accessToken).toBeTruthy();
    expect(result.refreshToken).toBeTruthy();
  });

  it('lanza EMAIL_TAKEN si el email ya existe', async () => {
    mockUserRepo.findUserByEmail.mockResolvedValue(baseUser);
    mockUserRepo.findUserByUsername.mockResolvedValue(null);

    await expect(
      authService.register({ username: 'otro', email: 'test@example.com', password: 'Password1' }),
    ).rejects.toMatchObject({ code: 'EMAIL_TAKEN', statusCode: 409 });
  });

  it('lanza USERNAME_TAKEN si el username ya existe', async () => {
    mockUserRepo.findUserByEmail.mockResolvedValue(null);
    mockUserRepo.findUserByUsername.mockResolvedValue(baseUser);

    await expect(
      authService.register({ username: 'testuser', email: 'nuevo@example.com', password: 'Password1' }),
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

describe('AppError', () => {
  it('es instancia de Error', () => {
    const err = new AppError('msg', 'CODE', 400);
    expect(err).toBeInstanceOf(Error);
    expect(err.code).toBe('CODE');
    expect(err.statusCode).toBe(400);
  });
});
