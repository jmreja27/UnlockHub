import type { Request, Response, NextFunction } from 'express';

import * as platformService from '../services/platform.service';
import type { AuthenticatedRequest } from '../middleware/authenticate';
import { linkSteamAccountSchema, linkRetroAchievementsSchema } from '@unlockhub/validators';

// POST /api/v1/platforms/steam/link — vincular cuenta de Steam
export async function linkSteamHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = (req as AuthenticatedRequest).user.id;
    const { steamId, apiKey } = linkSteamAccountSchema.parse(req.body);

    const account = await platformService.linkPlatform(userId, 'STEAM', steamId, steamId, apiKey);
    res.status(201).json(account);
  } catch (err) {
    next(err);
  }
}

// DELETE /api/v1/platforms/steam/unlink — desvincular cuenta de Steam
export async function unlinkSteamHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = (req as AuthenticatedRequest).user.id;
    await platformService.unlinkPlatform(userId, 'STEAM');
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

// POST /api/v1/platforms/ra/link — vincular cuenta de RetroAchievements
export async function linkRetroAchievementsHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = (req as AuthenticatedRequest).user.id;
    const { username, apiKey } = linkRetroAchievementsSchema.parse(req.body);

    const account = await platformService.linkPlatform(userId, 'RA', username, username, apiKey);
    res.status(201).json(account);
  } catch (err) {
    next(err);
  }
}

// DELETE /api/v1/platforms/ra/unlink — desvincular cuenta de RetroAchievements
export async function unlinkRetroAchievementsHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = (req as AuthenticatedRequest).user.id;
    await platformService.unlinkPlatform(userId, 'RA');
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/platforms — listar plataformas vinculadas al usuario autenticado
export async function getLinkedPlatformsHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = (req as AuthenticatedRequest).user.id;
    const platforms = await platformService.getLinkedPlatforms(userId);
    res.json(platforms);
  } catch (err) {
    next(err);
  }
}
