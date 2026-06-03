import { prisma } from '../lib/prisma';
import { hashToken, getRefreshTokenExpiry } from '../lib/jwt';

export async function createRefreshToken(userId: string, rawToken: string) {
  return prisma.refreshToken.create({
    data: {
      userId,
      tokenHash: hashToken(rawToken),
      expiresAt: getRefreshTokenExpiry(),
    },
  });
}

/** Busca un refresh token válido y devuelve solo los campos del usuario necesarios para emitir nuevos tokens. */
export async function findValidRefreshToken(rawToken: string) {
  return prisma.refreshToken.findFirst({
    where: {
      tokenHash: hashToken(rawToken),
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
    select: {
      id: true,
      userId: true,
      user: {
        select: { id: true, email: true, isPremium: true },
      },
    },
  });
}

export async function revokeRefreshToken(rawToken: string) {
  await prisma.refreshToken.updateMany({
    where: { tokenHash: hashToken(rawToken) },
    data: { revokedAt: new Date() },
  });
}

export async function revokeAllUserTokens(userId: string) {
  await prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
