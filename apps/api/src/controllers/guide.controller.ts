import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';

import * as guideService from '../services/guide.service';
import type { AuthenticatedRequest } from '../middleware/authenticate';

// ── Schemas de validación ─────────────────────────────────────────────────────

const createGuideBodySchema = z.object({
  content: z
    .string()
    .min(20, { message: 'El contenido debe tener al menos 20 caracteres' })
    .max(5000, { message: 'El contenido no puede superar los 5000 caracteres' }),
});

const paginationQuerySchema = z.object({
  page: z
    .string()
    .optional()
    .transform((v) => (v ? parseInt(v, 10) : 1))
    .pipe(z.number().int().min(1)),
  limit: z
    .string()
    .optional()
    .transform((v) => (v ? Math.min(parseInt(v, 10), 20) : 10))
    .pipe(z.number().int().min(1).max(20)),
});

// ── Handlers ──────────────────────────────────────────────────────────────────

/**
 * GET /api/v1/achievements/:achievementId/guides
 * Lista paginada de guías de un logro, ordenadas por upvotes DESC.
 */
export async function getGuidesHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const achievementId = req.params['achievementId'] as string;
    const { page, limit } = paginationQuerySchema.parse(req.query);

    const result = await guideService.getGuides(achievementId, page, limit);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/v1/achievements/:achievementId/guides
 * Crea una nueva guía para el logro indicado.
 */
export async function createGuideHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = (req as AuthenticatedRequest).user.id;
    const achievementId = req.params['achievementId'] as string;
    const { content } = createGuideBodySchema.parse(req.body);

    const guide = await guideService.createGuide(userId, achievementId, content);
    res.status(201).json(guide);
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/v1/guides/:id/upvote
 * Incrementa en 1 el upvote de una guía.
 */
export async function upvoteGuideHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = (req as AuthenticatedRequest).user.id;
    const guideId = req.params['id'] as string;

    const updated = await guideService.upvoteGuide(userId, guideId);
    res.json(updated);
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/v1/guides/:id/report
 * Reporta una guía para moderación.
 */
export async function reportGuideHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = (req as AuthenticatedRequest).user.id;
    const guideId = req.params['id'] as string;

    const result = await guideService.reportGuide(userId, guideId);
    res.json(result);
  } catch (err) {
    next(err);
  }
}
