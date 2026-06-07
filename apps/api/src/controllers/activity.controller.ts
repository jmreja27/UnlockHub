import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { paginationSchema } from '@unlockhub/validators';

import type { AuthenticatedRequest } from '../middleware/authenticate';
import { getFriendsFeed, getPublicFeed } from '../services/activity.service';

const feedQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export async function getFriendsFeedHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { cursor, limit } = feedQuerySchema.parse(req.query);
    const userId = (req as AuthenticatedRequest).user.id;
    const result = await getFriendsFeed(userId, limit, cursor);
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
