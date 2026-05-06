import type { Request, Response, NextFunction } from 'express';

import * as userService from '../services/user.service';
import type { AuthenticatedRequest } from '../middleware/authenticate';
import { updateProfileSchema } from '@unlockhub/validators';
import { redis } from '../lib/redis';

// GET /api/v1/users/me — perfil del usuario autenticado
export async function getMeHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = (req as AuthenticatedRequest).user.id;
    const profile = await userService.getProfile(userId);
    res.json(profile);
  } catch (err) {
    next(err);
  }
}

// PATCH /api/v1/users/me — actualizar bio y countryCode del usuario autenticado
export async function updateMeHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = (req as AuthenticatedRequest).user.id;
    const data = updateProfileSchema.parse(req.body);
    const updatedUser = await userService.updateProfile(userId, data);
    res.json(updatedUser);
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/users/me/streak-milestone — milestone de racha pendiente de mostrar
export async function getStreakMilestoneHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = (req as AuthenticatedRequest).user.id;
    const key = `streak:milestone:${userId}`;
    const raw = await redis.get(key);

    if (!raw) {
      res.json({ milestone: null });
      return;
    }

    // Eliminar tras leer para que solo se muestre una vez
    await redis.del(key);
    res.json({ milestone: parseInt(raw, 10) });
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/users/:username — perfil público de un usuario
export async function getPublicProfileHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { username } = req.params as { username: string };
    const profile = await userService.getPublicProfile(username);
    res.json(profile);
  } catch (err) {
    next(err);
  }
}
