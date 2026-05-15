import crypto from 'crypto';

import bcrypt from 'bcrypt';
import type { RegisterInput, LoginInput } from '@unlockhub/validators';

import { AppError } from '../middleware/errorHandler';
import * as userRepo from '../repositories/user.repository';
import * as tokenRepo from '../repositories/refreshToken.repository';
import {
  signAccessToken,
  signRefreshToken,
} from '../lib/jwt';
import { prisma } from '../lib/prisma';

import { sendPasswordResetEmail } from './email.service';

const RESET_TOKEN_EXPIRY_MS = 60 * 60 * 1000; // 1 hora

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
    birthDate: input.birthDate,
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

// Genera un token de reset, lo persiste hasheado y envía el email
export async function forgotPassword(email: string): Promise<void> {
  const user = await userRepo.findUserByEmail(email);

  // Responder siempre igual para no revelar si el email existe (user enumeration)
  if (!user) return;

  // Eliminar tokens previos del usuario
  await prisma.passwordResetToken.deleteMany({ where: { userId: user.id } });

  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const expiresAt = new Date(Date.now() + RESET_TOKEN_EXPIRY_MS);

  await prisma.passwordResetToken.create({
    data: { userId: user.id, tokenHash, expiresAt },
  });

  const APP_SCHEME = process.env['APP_SCHEME'] ?? 'unlockhub';
  const resetUrl = `${APP_SCHEME}://reset-password?token=${rawToken}`;

  await sendPasswordResetEmail(user.email, resetUrl);
}

// Valida el token y actualiza la contraseña
export async function resetPassword(rawToken: string, newPassword: string): Promise<void> {
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

  const record = await prisma.passwordResetToken.findUnique({ where: { tokenHash } });

  if (!record || record.usedAt || record.expiresAt < new Date()) {
    throw new AppError('El enlace de recuperación no es válido o ha expirado', 'INVALID_RESET_TOKEN', 400);
  }

  const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);

  await prisma.$transaction([
    prisma.user.update({ where: { id: record.userId }, data: { passwordHash } }),
    prisma.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
    // Revocar todos los refresh tokens para forzar re-login
    prisma.refreshToken.updateMany({
      where: { userId: record.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);
}
