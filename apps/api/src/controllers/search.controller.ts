import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';

import { search, getGameWithAchievements } from '../services/search.service';
import { AppError } from '../middleware/errorHandler';

const searchQuerySchema = z.object({
  q: z.string().min(1).max(100),
  type: z.enum(['all', 'games', 'users']).default('all'),
});

export async function searchHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { q, type } = searchQuerySchema.parse(req.query);
    const results = await search(q, type);
    res.json(results);
  } catch (err) {
    next(err);
  }
}

export async function getGameHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const game = await getGameWithAchievements(id);
    if (!game) throw new AppError('Juego no encontrado', 'GAME_NOT_FOUND', 404);
    res.json(game);
  } catch (err) {
    next(err);
  }
}
