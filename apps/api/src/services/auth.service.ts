import bcrypt from 'bcrypt';

import { AppError } from '../middleware/errorHandler';
import * as userRepo from '../repositories/user.repository';
import * as tokenRepo from '../repositories/refreshToken.repository';
import {
  signAccessToken,
  signRefreshToken,
} from '../lib/jwt';
import type { RegisterInput, LoginInput } from '@unlockhub/validators';

const BCRYPT_ROUNDS = 12;

export async function register(input: RegisterInput) {
  const [existingEmail, existingUsername] = await Promise.all([
    userRepo.findUserByEmail(input.email),
    userRepo.findUserByUsername(input.username),
  ]);

  if (existingEmail) {
    throw new AppError('El email ya está registrado', 'EMAIL_TAKEN', 409);
  }
  if (existingUsername) {
    throw new AppError('El nombre de usuario ya está en uso', 'USERNAME_TAKEN', 409);
  }

  const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
  const user = await userRepo.createUser({
    username: input.username,
    email: input.email,
    passwordHash,
  });

  const rawRefreshToken = signRefreshToken();
  await tokenRepo.createRefreshToken(user.id, rawRefreshToken);

  const accessToken = signAccessToken({
    sub: user.id,
    email: user.email,
    isPremium: user.isPremium,
  });

  return { user, accessToken, refreshToken: rawRefreshToken };
}

export async function login(input: LoginInput) {
  const user = await userRepo.findUserByEmail(input.email);

  // Comparar siempre para evitar timing attacks aunque el usuario no exista
  const dummyHash = '$2b$12$invalidhashfortimingattackprevention00000000000000000000';
  const valid = await bcrypt.compare(input.password, user?.passwordHash ?? dummyHash);

  if (!user || !valid) {
    throw new AppError('Credenciales incorrectas', 'INVALID_CREDENTIALS', 401);
  }

  const rawRefreshToken = signRefreshToken();
  await tokenRepo.createRefreshToken(user.id, rawRefreshToken);

  const accessToken = signAccessToken({
    sub: user.id,
    email: user.email,
    isPremium: user.isPremium,
  });

  return { user, accessToken, refreshToken: rawRefreshToken };
}

export async function refresh(rawRefreshToken: string) {
  const tokenRecord = await tokenRepo.findValidRefreshToken(rawRefreshToken);
  if (!tokenRecord) {
    throw new AppError('Refresh token inválido o expirado', 'INVALID_REFRESH_TOKEN', 401);
  }

  // Rotación de refresh token: revocamos el anterior y emitimos uno nuevo
  await tokenRepo.revokeRefreshToken(rawRefreshToken);
  const newRawRefreshToken = signRefreshToken();
  await tokenRepo.createRefreshToken(tokenRecord.userId, newRawRefreshToken);

  const accessToken = signAccessToken({
    sub: tokenRecord.user.id,
    email: tokenRecord.user.email,
    isPremium: tokenRecord.user.isPremium,
  });

  return { accessToken, refreshToken: newRawRefreshToken };
}

export async function logout(rawRefreshToken: string) {
  await tokenRepo.revokeRefreshToken(rawRefreshToken);
}

export async function logoutAll(userId: string) {
  await tokenRepo.revokeAllUserTokens(userId);
}
