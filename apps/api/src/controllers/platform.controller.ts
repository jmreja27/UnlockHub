import type { Request, Response, NextFunction } from 'express';
import {
  linkSteamAccountSchema,
  linkRetroAchievementsSchema,
  linkPsnAccountSchema,
  linkXboxAccountSchema,
} from '@unlockhub/validators';

import * as platformService from '../services/platform.service';
import { triggerExpressSync, queueInitialSync } from '../services/sync.service';
import { logger } from '../lib/logger';
import type { AuthenticatedRequest } from '../middleware/authenticate';
import { getSystemPsnAuth, lookupPsnUser, checkPsnProfilePrivacy } from '../platforms/psn.adapter';
import { resolveVanityUrl } from '../platforms/steam.adapter';
import { lookupRaUser } from '../platforms/retroachievements.adapter';
import { exchangeXboxCodeForTokens } from '../platforms/xbox.adapter';

const EXPRESS_SYNC_TIMEOUT_MS = 25_000;

// POST /api/v1/platforms/steam/link — vincular cuenta de Steam por username o SteamID64
export async function linkSteamHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = (req as AuthenticatedRequest).user.id;
    const { username } = linkSteamAccountSchema.parse(req.body);

    // Resuelve vanityURL → SteamID64 (o usa SteamID64 directo si son 17 dígitos)
    const steamId = await resolveVanityUrl(username);

    // Steam no requiere token de usuario — el sistema usa STEAM_API_KEY
    const account = await platformService.linkPlatform(userId, 'STEAM', steamId, username, '');

    await Promise.race([
      triggerExpressSync(userId, 'STEAM'),
      new Promise<void>((resolve) => setTimeout(resolve, EXPRESS_SYNC_TIMEOUT_MS)),
    ]);
    queueInitialSync(userId, 'STEAM').catch((err: unknown) => {
      logger.error({ err: (err as Error).message, userId, platform: 'STEAM' }, '[Platform] queueInitialSync fallido');
    });

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
    const result = await platformService.unlinkPlatform(userId, 'STEAM');
    res.json({ ok: true, deletedAchievements: result.deletedAchievements });
  } catch (err) {
    next(err);
  }
}

// POST /api/v1/platforms/ra/link — vincular cuenta de RetroAchievements por username público
export async function linkRetroAchievementsHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = (req as AuthenticatedRequest).user.id;
    const { username } = linkRetroAchievementsSchema.parse(req.body);

    // Verificar que el usuario existe en RetroAchievements con las credenciales del sistema
    await lookupRaUser(username);

    // RA no requiere token de usuario — el sistema usa RA_SYSTEM_KEY
    const account = await platformService.linkPlatform(userId, 'RA', username, username, '');

    await Promise.race([
      triggerExpressSync(userId, 'RA'),
      new Promise<void>((resolve) => setTimeout(resolve, EXPRESS_SYNC_TIMEOUT_MS)),
    ]);
    queueInitialSync(userId, 'RA').catch((err: unknown) => {
      logger.error({ err: (err as Error).message, userId, platform: 'RA' }, '[Platform] queueInitialSync fallido');
    });

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
    const result = await platformService.unlinkPlatform(userId, 'RA');
    res.json({ ok: true, deletedAchievements: result.deletedAchievements });
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

    // Detectar si el perfil tiene los trofeos privados antes de vincular
    const isPrivate = await checkPsnProfilePrivacy(auth, accountId);

    const account = await platformService.linkPlatform(
      userId,
      'PSN',
      accountId,
      onlineId,
      '',  // PSN no usa token de usuario — el sistema usa PSN_SYSTEM_NPSSO
      { psnProfilePrivate: isPrivate },
    );

    if (!isPrivate) {
      // Solo sincronizar si el perfil es público — no tiene sentido si los trofeos son privados
      await Promise.race([
        triggerExpressSync(userId, 'PSN'),
        new Promise<void>((resolve) => setTimeout(resolve, EXPRESS_SYNC_TIMEOUT_MS)),
      ]);
      queueInitialSync(userId, 'PSN').catch((err: unknown) => {
        logger.error({ err: (err as Error).message, userId, platform: 'PSN' }, '[Platform] queueInitialSync fallido');
      });
    }

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
    const result = await platformService.unlinkPlatform(userId, 'PSN');
    res.json({ ok: true, deletedAchievements: result.deletedAchievements });
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
    const result = await platformService.unlinkPlatform(userId, 'XBOX');
    res.json({ ok: true, deletedAchievements: result.deletedAchievements });
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
