import type { Request, Response, NextFunction } from 'express';

import { AppError } from './errorHandler';
import type { AuthenticatedRequest } from './authenticate';

// Middleware que bloquea el acceso a endpoints premium-only.
// Usar después de `authenticate`.
export function requirePremium(req: Request, _res: Response, next: NextFunction): void {
  const authReq = req as AuthenticatedRequest;
  if (!authReq.user?.isPremium) {
    next(new AppError('Esta función requiere una suscripción premium', 'PREMIUM_REQUIRED', 403));
    return;
  }
  next();
}
