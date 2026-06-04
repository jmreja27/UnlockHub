import { prisma } from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';

// Forma del objeto de guía devuelto al cliente
interface GuideDto {
  id: string;
  content: string;
  upvotes: number;
  reported: boolean;
  createdAt: string;
  user: {
    id: string;
    username: string;
    avatar: string | null;
  };
}

interface PaginatedGuides {
  data: GuideDto[];
  total: number;
  page: number;
  limit: number;
}

function toGuideDto(row: {
  id: string;
  content: string;
  upvotes: number;
  reported: boolean;
  createdAt: Date;
  user: { id: string; username: string; avatar: string | null };
}): GuideDto {
  return {
    id: row.id,
    content: row.content,
    upvotes: row.upvotes,
    reported: row.reported,
    createdAt: row.createdAt.toISOString(),
    user: row.user,
  };
}

/**
 * Devuelve las guías de un logro paginadas, ordenadas por upvotes DESC y luego por fecha DESC.
 */
export async function getGuides(
  achievementId: string,
  page: number,
  limit: number,
): Promise<PaginatedGuides> {
  const skip = (page - 1) * limit;

  const [rows, total] = await Promise.all([
    prisma.achievementGuide.findMany({
      where: { achievementId },
      orderBy: [{ upvotes: 'desc' }, { createdAt: 'desc' }],
      skip,
      take: limit,
      select: {
        id: true,
        content: true,
        upvotes: true,
        reported: true,
        createdAt: true,
        user: {
          select: { id: true, username: true, avatar: true },
        },
      },
    }),
    prisma.achievementGuide.count({ where: { achievementId } }),
  ]);

  return {
    data: rows.map(toGuideDto),
    total,
    page,
    limit,
  };
}

/**
 * Crea una guía para un logro. Valida que el logro exista y que el contenido
 * tenga entre 20 y 5000 caracteres (validación también en el controlador con Zod).
 */
export async function createGuide(
  userId: string,
  achievementId: string,
  content: string,
): Promise<GuideDto> {
  // Verificar que el logro existe
  const achievement = await prisma.achievement.findUnique({
    where: { id: achievementId },
    select: { id: true },
  });

  if (!achievement) {
    throw new AppError('Logro no encontrado', 'ACHIEVEMENT_NOT_FOUND', 404);
  }

  const guide = await prisma.achievementGuide.create({
    data: { userId, achievementId, content },
    select: {
      id: true,
      content: true,
      upvotes: true,
      reported: true,
      createdAt: true,
      user: {
        select: { id: true, username: true, avatar: true },
      },
    },
  });

  return toGuideDto(guide);
}

/**
 * Incrementa en 1 el contador de upvotes de una guía.
 * Sin deduplicación en v1 — cada llamada suma 1.
 */
export async function upvoteGuide(
  _userId: string,
  guideId: string,
): Promise<GuideDto> {
  // Verificar que la guía existe antes de intentar actualizar
  const exists = await prisma.achievementGuide.findUnique({
    where: { id: guideId },
    select: { id: true },
  });

  if (!exists) {
    throw new AppError('Guía no encontrada', 'GUIDE_NOT_FOUND', 404);
  }

  const updated = await prisma.achievementGuide.update({
    where: { id: guideId },
    data: { upvotes: { increment: 1 } },
    select: {
      id: true,
      content: true,
      upvotes: true,
      reported: true,
      createdAt: true,
      user: {
        select: { id: true, username: true, avatar: true },
      },
    },
  });

  return toGuideDto(updated);
}

/**
 * Marca una guía como reportada. Idempotente: llamar varias veces no es error.
 */
export async function reportGuide(
  _userId: string,
  guideId: string,
): Promise<{ ok: true }> {
  const exists = await prisma.achievementGuide.findUnique({
    where: { id: guideId },
    select: { id: true },
  });

  if (!exists) {
    throw new AppError('Guía no encontrada', 'GUIDE_NOT_FOUND', 404);
  }

  await prisma.achievementGuide.update({
    where: { id: guideId },
    data: { reported: true },
  });

  return { ok: true };
}
