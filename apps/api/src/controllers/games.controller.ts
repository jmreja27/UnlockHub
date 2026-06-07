import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';

import { getGameAchievementsWithStatus } from '../services/search.service';
import { fetchAndUpsertGameAchievements } from '../services/games.service';
import { AppError } from '../middleware/errorHandler';
import type { OptionallyAuthenticatedRequest } from '../middleware/authenticate';

export async function getGameAchievementsHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const userId = (req as OptionallyAuthenticatedRequest).user?.id;
    const result = await getGameAchievementsWithStatus(id, userId);
    if (!result) throw new AppError('Juego no encontrado', 'GAME_NOT_FOUND', 404);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function fetchGameAchievementsHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const result = await fetchAndUpsertGameAchievements(id);
    res.json(result);
  } catch (err) {
    next(err);
  }
}
