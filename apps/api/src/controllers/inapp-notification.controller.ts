import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';

import type { AuthenticatedRequest } from '../middleware/authenticate';
import {
  getNotifications,
  markAllRead,
  markOneRead,
  getUnreadCount,
} from '../services/inapp-notification.service';

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export async function getNotificationsHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = (req as AuthenticatedRequest).user.id;
    const { page, limit } = paginationSchema.parse(req.query);
    const result = await getNotifications(userId, page, limit);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function getUnreadCountHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = (req as AuthenticatedRequest).user.id;
    const count = await getUnreadCount(userId);
    res.json({ count });
  } catch (err) {
    next(err);
  }
}

export async function markAllReadHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = (req as AuthenticatedRequest).user.id;
    await markAllRead(userId);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

export async function markOneReadHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = (req as AuthenticatedRequest).user.id;
    const { id } = z.object({ id: z.string().cuid() }).parse(req.params);
    await markOneRead(userId, id);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}
