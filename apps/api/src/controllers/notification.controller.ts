import type { Request, Response, NextFunction } from 'express';
import type { AuthenticatedRequest } from '../middleware/authenticate';
import { saveDeviceToken, removeDeviceToken } from '../services/notification.service';
import { z } from 'zod';

const registerSchema = z.object({
  token: z.string().min(1),
  platform: z.enum(['ios', 'android']),
});

export async function registerDeviceTokenHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = (req as AuthenticatedRequest).user.id;
    const { token, platform } = registerSchema.parse(req.body);
    await saveDeviceToken(userId, token, platform);
    res.status(201).json({ ok: true });
  } catch (err) {
    next(err);
  }
}

export async function removeDeviceTokenHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = (req as AuthenticatedRequest).user.id;
    const { token } = z.object({ token: z.string().min(1) }).parse(req.body);
    await removeDeviceToken(userId, token);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}
