import type { Request, Response, NextFunction } from 'express';
import { platformSchema } from '@unlockhub/validators';
import type { Platform } from '@unlockhub/types';

import type { AuthenticatedRequest } from '../middleware/authenticate';
import * as syncService from '../services/sync.service';

export async function triggerSyncHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { id: userId, isPremium } = (req as AuthenticatedRequest).user;
    const platform = platformSchema.parse(req.params['platform']?.toUpperCase()) as Platform;

    const result = await syncService.triggerManualSync(userId, platform, isPremium);
    // 202 cuando ya hay un sync activo (in_progress) — el cliente lo ignorará vía useSyncProgress
    if ('status' in result && result.status === 'in_progress') {
      res.status(202).json(result);
      return;
    }
    // 200 cuando Steam fue omitido por cuota (sin job encolado); 202 para sync real iniciado.
    res.status('skippedByQuota' in result && result.skippedByQuota ? 200 : 202).json(result);
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

export async function getActiveSyncStatusHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { id: userId } = (req as AuthenticatedRequest).user;
    const statuses = await syncService.getActiveSyncStatus(userId);
    res.json(statuses);
  } catch (err) {
    next(err);
  }
}

export async function getAggregateSyncStatusHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { id: userId, isPremium } = (req as AuthenticatedRequest).user;
    const summary = await syncService.getAggregateSyncStatus(userId, isPremium);
    res.json(summary);
  } catch (err) {
    next(err);
  }
}

export async function appOpenSyncHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { id: userId, isPremium } = (req as AuthenticatedRequest).user;
    const result = await syncService.triggerAppOpenSync(userId, isPremium);
    res.status(202).json(result);
  } catch (err) {
    next(err);
  }
}
