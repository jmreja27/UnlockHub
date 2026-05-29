import type { Request, Response, NextFunction } from 'express';
import { paginationSchema, platformSchema } from '@unlockhub/validators';

import * as rankingService from '../services/ranking.service';
import type { AuthenticatedRequest } from '../middleware/authenticate';

export async function getGlobalRankingHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { page, limit } = paginationSchema.parse(req.query);
    const result = await rankingService.getGlobalRanking(page, limit);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function getPlatformRankingHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { page, limit } = paginationSchema.parse(req.query);
    const platform = platformSchema.parse((req.params['platform'] ?? '').toUpperCase());
    const result = await rankingService.getPlatformRanking(platform, page, limit);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function getMyRankHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { id: userId } = (req as AuthenticatedRequest).user;
    const result = await rankingService.getUserRank(userId);
    res.json(result);
  } catch (err) {
    next(err);
  }
}
