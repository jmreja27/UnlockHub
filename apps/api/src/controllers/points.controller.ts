import type { Request, Response, NextFunction } from 'express';
import { paginationSchema } from '@unlockhub/validators';

import type { AuthenticatedRequest } from '../middleware/authenticate';
import { getPointsHistory, getPointsTotal } from '../services/points.service';

export async function getHistoryHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { page, limit } = paginationSchema.parse(req.query);
    const userId = (req as AuthenticatedRequest).user.id;
    const result = await getPointsHistory(userId, page, limit);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function getTotalHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = (req as AuthenticatedRequest).user.id;
    const total = await getPointsTotal(userId);
    res.json({ total });
  } catch (err) {
    next(err);
  }
}
