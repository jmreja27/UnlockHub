import type { Request, Response, NextFunction } from 'express';

import { verifyAccessToken } from '../lib/jwt';

import { AppError } from './errorHandler';

export interface AuthenticatedRequest extends Request {
  user: {
    id: string;
    email: string;
    isPremium: boolean;
  };
}

export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.headers['authorization'];
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined;

  if (!token) {
    return next(new AppError('No autenticado', 'UNAUTHORIZED', 401));
  }

  try {
    const payload = verifyAccessToken(token);
    (req as AuthenticatedRequest).user = {
      id: payload.sub,
      email: payload.email,
      isPremium: payload.isPremium,
    };
    next();
  } catch {
    next(new AppError('Token inválido o expirado', 'INVALID_TOKEN', 401));
  }
}
