import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { updateProfileSchema } from '@unlockhub/validators';

import * as userService from '../services/user.service';
import type { AuthenticatedRequest } from '../middleware/authenticate';
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

const myGamesQuerySchema = z.object({
  platform: z.enum(['STEAM', 'RA', 'XBOX', 'PSN']).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(50).default(20),
});

// GET /api/v1/users/me/games — juegos con logros del usuario autenticado (paginado)
export async function getMyGamesHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = (req as AuthenticatedRequest).user.id;
    const { platform, page, limit } = myGamesQuerySchema.parse(req.query);
    const result = await userService.getMyGames(userId, platform, page, limit);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/users/me/games/:gameId/achievements — logros del usuario en un juego
export async function getMyGameAchievementsHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = (req as AuthenticatedRequest).user.id;
    const { gameId } = req.params as { gameId: string };
    const result = await userService.getMyGameAchievements(userId, gameId);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/users/:username/compare — comparación de perfiles
export async function compareProfilesHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const myUserId = (req as AuthenticatedRequest).user.id;
    const { username } = req.params as { username: string };
    const result = await userService.compareProfiles(myUserId, username);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

// DELETE /api/v1/users/me — elimina la cuenta del usuario autenticado (GDPR)
export async function deleteAccountHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = (req as AuthenticatedRequest).user.id;
    await userService.deleteAccount(userId);
    // Limpiar cookie de refresh token
    res.clearCookie('refreshToken', { httpOnly: true, sameSite: 'strict' });
    res.status(200).json({ message: 'Cuenta eliminada correctamente' });
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

// POST /api/v1/users/me/avatar — subir avatar del usuario autenticado
export async function uploadAvatarHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = (req as AuthenticatedRequest).user.id;

    if (!req.file) {
      res.status(400).json({ error: 'No se proporcionó ningún archivo', code: 'NO_FILE' });
      return;
    }

    const updated = await userService.uploadAvatar(userId, req.file.buffer, req.file.mimetype);
    res.json(updated);
  } catch (err) {
    next(err);
  }
}

// POST /api/v1/users/me/banner — subir banner del usuario autenticado
export async function uploadBannerHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = (req as AuthenticatedRequest).user.id;

    if (!req.file) {
      res.status(400).json({ error: 'No se proporcionó ningún archivo', code: 'NO_FILE' });
      return;
    }

    const updated = await userService.uploadBanner(userId, req.file.buffer, req.file.mimetype);
    res.json(updated);
  } catch (err) {
    next(err);
  }
}
