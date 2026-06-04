import { prisma } from '../lib/prisma';

/** Busca usuario por email. Excluye soft-deleted (GDPR). Usado en login y forgot-password. */
export async function findUserByEmail(email: string) {
  return prisma.user.findUnique({ where: { email, deletedAt: null } });
}

/** Busca usuario por ID. Excluye soft-deleted (GDPR). */
export async function findUserById(id: string) {
  return prisma.user.findUnique({ where: { id, deletedAt: null } });
}

/** Busca usuario por username. Excluye soft-deleted (GDPR). */
export async function findUserByUsername(username: string) {
  return prisma.user.findUnique({ where: { username, deletedAt: null } });
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
