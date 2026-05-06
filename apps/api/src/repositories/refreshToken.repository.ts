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

export async function findValidRefreshToken(rawToken: string) {
  return prisma.refreshToken.findFirst({
    where: {
      tokenHash: hashToken(rawToken),
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
    include: { user: true },
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
