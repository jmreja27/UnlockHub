import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';

import * as achievementChallengeService from '../services/achievement-challenge.service';
import type { AuthenticatedRequest } from '../middleware/authenticate';

// Schema de validación para el body del reto
const challengeFriendBodySchema = z.object({
  friendUserId: z.string().cuid({ message: 'friendUserId debe ser un CUID válido' }),
});

/**
 * POST /api/v1/achievements/:id/challenge
 * Reta a un amigo a conseguir el logro indicado en :id.
 */
export async function challengeFriendHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const challengerUserId = (req as AuthenticatedRequest).user.id;
    const achievementId = req.params['id'] as string;
    const { friendUserId } = challengeFriendBodySchema.parse(req.body);

    const result = await achievementChallengeService.challengeFriend(
      challengerUserId,
      achievementId,
      friendUserId,
    );

    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}
