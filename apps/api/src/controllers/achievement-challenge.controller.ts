import type { Request, Response, NextFunction } from 'express';
import {
  createAchievementChallengeBodySchema,
  achievementChallengeParamsSchema,
  listAchievementChallengesQuerySchema,
} from '@unlockhub/validators';

import * as achievementChallengeService from '../services/achievement-challenge.service';
import type { AuthenticatedRequest } from '../middleware/authenticate';

/**
 * POST /api/v1/achievements/:id/challenge
 * Crea (o reutiliza) un reto 1v1 sobre el logro :id contra el usuario indicado.
 */
export async function createChallengeHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const challengerId = (req as AuthenticatedRequest).user.id;
    const achievementId = req.params['id'] as string;
    const { challengedUserId } = createAchievementChallengeBodySchema.parse(req.body);

    const challenge = await achievementChallengeService.createChallenge(challengerId, challengedUserId, achievementId);

    res.status(200).json(challenge);
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/v1/achievement-challenges/:id/accept
 */
export async function acceptChallengeHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = (req as AuthenticatedRequest).user.id;
    const { id } = achievementChallengeParamsSchema.parse(req.params);

    const challenge = await achievementChallengeService.acceptChallenge(id, userId);

    res.status(200).json(challenge);
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/v1/achievement-challenges/:id/reject
 */
export async function rejectChallengeHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = (req as AuthenticatedRequest).user.id;
    const { id } = achievementChallengeParamsSchema.parse(req.params);

    const challenge = await achievementChallengeService.rejectChallenge(id, userId);

    res.status(200).json(challenge);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/v1/achievement-challenges/me
 */
export async function listMyChallengesHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = (req as AuthenticatedRequest).user.id;
    const { status, page, limit } = listAchievementChallengesQuerySchema.parse(req.query);

    const result = await achievementChallengeService.listMyChallenges(userId, status, page, limit);

    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}
