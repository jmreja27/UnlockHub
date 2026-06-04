import type { Request, Response, NextFunction } from 'express';

import * as statsService from '../services/stats.service';
import type { AuthenticatedRequest } from '../middleware/authenticate';
import { AppError } from '../middleware/errorHandler';

// GET /api/v1/users/me/stats — estadísticas avanzadas del usuario autenticado (solo premium)
export async function getMyStatsHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest;
    const { id: userId, isPremium } = authReq.user;

    // Endpoint exclusivo para usuarios premium
    if (!isPremium) {
      throw new AppError(
        'Las estadísticas avanzadas son una función premium',
        'PREMIUM_REQUIRED',
        403,
      );
    }

    const stats = await statsService.getUserStats(userId);
    res.json(stats);
  } catch (err) {
    next(err);
  }
}
