import type { Request, Response, NextFunction } from 'express';
import type { AuthenticatedRequest } from '../middleware/authenticate';
import { getActiveChallenge, getUserChallengeStatus } from '../services/challenge.service';

export async function getActiveChallengeHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const challenge = await getActiveChallenge();
    res.json({ challenge });
  } catch (err) {
    next(err);
  }
}

export async function getMyChallengeStatusHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = (req as AuthenticatedRequest).user.id;
    const status = await getUserChallengeStatus(userId);
    res.json({ status });
  } catch (err) {
    next(err);
  }
}
