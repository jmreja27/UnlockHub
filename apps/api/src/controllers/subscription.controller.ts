import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';

import * as subscriptionService from '../services/subscription.service';
import type { AuthenticatedRequest } from '../middleware/authenticate';
import { verifySubscriptionSchema } from '@unlockhub/validators';

// Schema de validación para el canje de puntos
const redeemPointsSchema = z.object({
  points: z
    .number({ required_error: 'El campo points es obligatorio' })
    .int('Los puntos deben ser un número entero')
    .min(300, 'El mínimo de puntos a canjear es 300')
    .refine((v) => v % 300 === 0, {
      message: 'Los puntos deben ser múltiplo de 300',
    }),
});

// POST /api/v1/subscriptions/verify — verifica y activa la suscripción del usuario
export async function verifySubscriptionHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = (req as AuthenticatedRequest).user.id;
    const data = verifySubscriptionSchema.parse(req.body);

    await subscriptionService.createOrUpdateSubscription(userId, {
      plan: data.plan,
      provider: data.provider,
      storeTransactionId: data.storeTransactionId,
      expiresAt: data.expiresAt ? new Date(data.expiresAt) : undefined,
    });

    res.status(200).json({ message: 'Suscripción activada correctamente' });
  } catch (err) {
    next(err);
  }
}

// DELETE /api/v1/subscriptions — cancela la suscripción activa del usuario
export async function cancelSubscriptionHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = (req as AuthenticatedRequest).user.id;
    await subscriptionService.cancelSubscription(userId);
    res.status(200).json({ message: 'Suscripción cancelada correctamente' });
  } catch (err) {
    next(err);
  }
}

// POST /api/v1/subscriptions/redeem-points — canjear puntos por días premium
export async function redeemPointsHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = (req as AuthenticatedRequest).user.id;
    const { points } = redeemPointsSchema.parse(req.body);

    const result = await subscriptionService.redeemPointsForPremium(userId, points);

    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/subscriptions/status — estado de la suscripción del usuario autenticado
export async function getSubscriptionStatusHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = (req as AuthenticatedRequest).user.id;
    const status = await subscriptionService.getSubscriptionStatus(userId);
    res.json(status);
  } catch (err) {
    next(err);
  }
}
