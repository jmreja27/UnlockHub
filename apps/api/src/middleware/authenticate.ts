import type { Request, Response, NextFunction } from 'express';

import { verifyAccessToken } from '../lib/jwt';
import { prisma } from '../lib/prisma';

import { AppError } from './errorHandler';

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
  prisma.user
    .findUnique({ where: { id: payload.sub, deletedAt: null }, select: { id: true } })
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
    .catch(() => {
      // Error de BD transitorio — continuar sin bloquear la request
      (req as AuthenticatedRequest).user = {
        id: payload.sub,
        email: payload.email,
        isPremium: payload.isPremium,
      };
      next();
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
