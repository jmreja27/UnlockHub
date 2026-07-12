import type { Request, Response, NextFunction } from 'express';
import * as Sentry from '@sentry/node';

import { verifyAccessToken } from '../lib/jwt';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';

import { AppError } from './errorHandler';

/** Delays entre reintentos cuando la query de verificación de cuenta falla (BD caída/hipo transitorio). */
const AUTH_CHECK_RETRY_DELAYS_MS = [50, 150];

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Reintenta la comprobación de soft-delete ante fallos transitorios de BD.
// Devuelve el usuario (o null si está borrado/no existe) — nunca "se salta" el check:
// si todos los intentos fallan, propaga el error para que el caller falle CERRADO.
async function findActiveUserWithRetry(userId: string): Promise<{ id: string } | null> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= AUTH_CHECK_RETRY_DELAYS_MS.length; attempt++) {
    try {
      return await prisma.user.findUnique({
        where: { id: userId, deletedAt: null },
        select: { id: true },
      });
    } catch (err) {
      lastError = err;
      const retryDelay = AUTH_CHECK_RETRY_DELAYS_MS[attempt];
      if (retryDelay !== undefined) {
        await delay(retryDelay);
      }
    }
  }
  throw lastError;
}

export interface AuthenticatedRequest extends Request {
  user: {
    id: string;
    email: string;
    isPremium: boolean;
  };
}

export interface OptionallyAuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    isPremium: boolean;
  };
}

export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.headers['authorization'];
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined;

  if (!token) {
    next(new AppError('No autenticado', 'UNAUTHORIZED', 401));
    return;
  }

  let payload: { sub: string; email: string; isPremium: boolean };
  try {
    payload = verifyAccessToken(token);
  } catch {
    next(new AppError('Token inválido o expirado', 'INVALID_TOKEN', 401));
    return;
  }

  // Verificar que el usuario no está eliminado (soft delete GDPR)
  findActiveUserWithRetry(payload.sub)
    .then((dbUser) => {
      if (!dbUser) {
        next(new AppError('Cuenta eliminada o no encontrada', 'ACCOUNT_DELETED', 401));
        return;
      }
      (req as AuthenticatedRequest).user = {
        id: payload.sub,
        email: payload.email,
        isPremium: payload.isPremium,
      };
      next();
    })
    .catch((err) => {
      // BD inalcanzable tras reintentos — fail CLOSED, nunca autenticar sin verificar la cuenta.
      logger.error(
        { err, userId: payload.sub },
        '[authenticate] Fallo persistente verificando cuenta en BD — denegando por fail-closed',
      );
      Sentry.captureException(err, { tags: { scope: 'authenticate' }, extra: { userId: payload.sub } });
      next(
        new AppError(
          'Servicio de autenticación no disponible temporalmente',
          'AUTH_CHECK_FAILED',
          503,
        ),
      );
    });
}

// Extrae el usuario del JWT si el token está presente, pero no falla si no hay token.
// Usar en endpoints que devuelven datos diferentes según si el usuario está autenticado o no.
export function authenticateOptional(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.headers['authorization'];
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined;

  if (token) {
    try {
      const payload = verifyAccessToken(token);
      (req as OptionallyAuthenticatedRequest).user = {
        id: payload.sub,
        email: payload.email,
        isPremium: payload.isPremium,
      };
    } catch {
      // Token inválido — continuar sin autenticar en lugar de devolver 401
    }
  }

  next();
}
