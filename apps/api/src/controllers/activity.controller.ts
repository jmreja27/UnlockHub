import type { Request, Response, NextFunction } from 'express';
import { paginationSchema } from '@unlockhub/validators';

import type { AuthenticatedRequest } from '../middleware/authenticate';
import { getFriendsFeed, getPublicFeed } from '../services/activity.service';

export async function getFriendsFeedHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { page, limit } = paginationSchema.parse(req.query);
    const userId = (req as AuthenticatedRequest).user.id;
    const result = await getFriendsFeed(userId, page, limit);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function getPublicFeedHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { page, limit } = paginationSchema.parse(req.query);
    const result = await getPublicFeed(page, limit);
    res.json(result);
  } catch (err) {
    next(err);
  }
}
