import type { Request, Response, NextFunction } from 'express';

import type { AuthenticatedRequest } from '../middleware/authenticate';
import { platformSchema } from '@unlockhub/validators';
import * as syncService from '../services/sync.service';
import type { Platform } from '@unlockhub/types';

export async function triggerSyncHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { id: userId, isPremium } = (req as AuthenticatedRequest).user;
    const platform = platformSchema.parse(req.params['platform']?.toUpperCase()) as Platform;

    const result = await syncService.triggerManualSync(userId, platform, isPremium);
    res.status(202).json(result);
  } catch (err) {
    next(err);
  }
}

export async function getSyncStatusHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { id: userId } = (req as AuthenticatedRequest).user;
    const platform = platformSchema.parse(req.params['platform']?.toUpperCase()) as Platform;

    const status = await syncService.getSyncStatus(userId, platform);
    res.json(status);
  } catch (err) {
    next(err);
  }
}
