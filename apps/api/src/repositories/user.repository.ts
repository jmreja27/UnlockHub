import { prisma } from '../lib/prisma';

export async function findUserByEmail(email: string) {
  // deletedAt: null garantiza que usuarios con soft delete GDPR no pueden volver a autenticarse
  return prisma.user.findUnique({ where: { email, deletedAt: null } });
}

export async function findUserById(id: string) {
  return prisma.user.findUnique({ where: { id } });
}

export async function findUserByUsername(username: string) {
  return prisma.user.findUnique({ where: { username } });
}

export async function createUser(data: {
  username: string;
  email: string;
  passwordHash: string;
  birthDate?: Date;
}) {
  return prisma.user.create({ data });
}

export async function updateUser(id: string, data: Partial<{ isPremium: boolean; premiumUntil: Date; xp: number; level: number; streakDays: number; lastSyncAt: Date; avatar: string; banner: string; bio: string }>) {
  return prisma.user.update({ where: { id }, data });
}
