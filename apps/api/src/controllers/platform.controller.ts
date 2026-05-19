import type { Request, Response, NextFunction } from 'express';
import {
  linkSteamAccountSchema,
  linkRetroAchievementsSchema,
  linkPsnAccountSchema,
  linkXboxAccountSchema,
} from '@unlockhub/validators';

import * as platformService from '../services/platform.service';
import { triggerExpressSync, queueInitialSync } from '../services/sync.service';
import type { AuthenticatedRequest } from '../middleware/authenticate';
import { getSystemPsnAuth, lookupPsnUser } from '../platforms/psn.adapter';
import { exchangeXboxCodeForTokens } from '../platforms/xbox.adapter';

const EXPRESS_SYNC_TIMEOUT_MS = 25_000;

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

    await Promise.race([
      triggerExpressSync(userId, 'STEAM'),
      new Promise<void>((resolve) => setTimeout(resolve, EXPRESS_SYNC_TIMEOUT_MS)),
    ]);
    void queueInitialSync(userId, 'STEAM');

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

    await Promise.race([
      triggerExpressSync(userId, 'RA'),
      new Promise<void>((resolve) => setTimeout(resolve, EXPRESS_SYNC_TIMEOUT_MS)),
    ]);
    void queueInitialSync(userId, 'RA');

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

// POST /api/v1/platforms/psn/link — vincular cuenta de PlayStation Network por username público
export async function linkPsnHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = (req as AuthenticatedRequest).user.id;
    const { username } = linkPsnAccountSchema.parse(req.body);

    // El backend usa sus propias credenciales (PSN_SYSTEM_NPSSO) — el usuario no proporciona NPSSO
    const auth = await getSystemPsnAuth();
    const { accountId, onlineId } = await lookupPsnUser(auth, username);

    const account = await platformService.linkPlatform(
      userId,
      'PSN',
      accountId,
      onlineId,
      '',  // PSN no usa token de usuario — el sistema usa PSN_SYSTEM_NPSSO
    );

    await Promise.race([
      triggerExpressSync(userId, 'PSN'),
      new Promise<void>((resolve) => setTimeout(resolve, EXPRESS_SYNC_TIMEOUT_MS)),
    ]);
    void queueInitialSync(userId, 'PSN');

    res.status(201).json(account);
  } catch (err) {
    next(err);
  }
}

// DELETE /api/v1/platforms/psn/unlink — desvincular cuenta de PSN
export async function unlinkPsnHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = (req as AuthenticatedRequest).user.id;
    await platformService.unlinkPlatform(userId, 'PSN');
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

// POST /api/v1/platforms/xbox/link — vincular cuenta de Xbox Live
export async function linkXboxHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = (req as AuthenticatedRequest).user.id;
    const { code, codeVerifier, redirectUri } = linkXboxAccountSchema.parse(req.body);

    const { encryptedTokenJson, xuid, gamertag } = await exchangeXboxCodeForTokens(
      code,
      codeVerifier,
      redirectUri,
    );

    const account = await platformService.linkPlatform(
      userId,
      'XBOX',
      xuid,
      gamertag,
      encryptedTokenJson,
    );
    res.status(201).json(account);
  } catch (err) {
    next(err);
  }
}

// DELETE /api/v1/platforms/xbox/unlink — desvincular cuenta de Xbox
export async function unlinkXboxHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = (req as AuthenticatedRequest).user.id;
    await platformService.unlinkPlatform(userId, 'XBOX');
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
