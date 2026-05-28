import type { Request, Response } from 'express';
import { z } from 'zod';

import * as subscriptionService from '../services/subscription.service';
import { logger } from '../lib/logger';

// Tipos de evento de RevenueCat que gestionamos
const PURCHASE_EVENTS = new Set(['INITIAL_PURCHASE', 'RENEWAL', 'PRODUCT_CHANGE']);
const EXPIRATION_EVENTS = new Set(['EXPIRATION', 'CANCELLATION', 'BILLING_ISSUE']);

const revenueCatEventSchema = z.object({
  api_version: z.string(),
  event: z.object({
    type: z.string(),
    app_user_id: z.string(),
    product_id: z.string(),
    store: z.enum(['PLAY_STORE', 'APP_STORE']),
    transaction_id: z.string().optional(),
    original_transaction_id: z.string().optional(),
    expiration_at_ms: z.number().nullable().optional(),
    environment: z.string().optional(),
  }),
});

function resolveTransactionId(event: z.infer<typeof revenueCatEventSchema>['event']): string {
  return event.transaction_id ?? event.original_transaction_id ?? `rc-${Date.now()}`;
}

function resolveProvider(store: string): 'GOOGLE_PLAY' | 'APP_STORE' {
  return store === 'PLAY_STORE' ? 'GOOGLE_PLAY' : 'APP_STORE';
}

function resolvePlan(productId: string): 'MONTHLY' | 'ANNUAL' {
  if (productId.includes('annual')) return 'ANNUAL';
  return 'MONTHLY';
}

// POST /api/v1/webhooks/revenuecat — punto de entrada de eventos de RevenueCat
export async function revenueCatWebhookHandler(req: Request, res: Response): Promise<void> {
  // RevenueCat siempre debe recibir 200 — reintenta indefinidamente ante cualquier otro código
  try {
    const secret = process.env['REVENUECAT_WEBHOOK_SECRET'];
    if (secret) {
      const authHeader = req.headers.authorization;
      const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
      if (token !== secret) {
        logger.warn({ path: req.path }, 'Webhook RevenueCat: firma inválida');
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }
    }

    const parsed = revenueCatEventSchema.safeParse(req.body);
    if (!parsed.success) {
      logger.warn({ errors: parsed.error.flatten() }, 'Webhook RevenueCat: payload inválido');
      // Devolver 200 — payload malformado no se reintenta útilmente
      res.status(200).json({ received: true });
      return;
    }

    const { event } = parsed.data;
    const userId = event.app_user_id;

    if (PURCHASE_EVENTS.has(event.type)) {
      const expiresAt = event.expiration_at_ms ? new Date(event.expiration_at_ms) : undefined;
      await subscriptionService.createOrUpdateSubscription(userId, {
        plan: resolvePlan(event.product_id),
        provider: resolveProvider(event.store),
        storeTransactionId: resolveTransactionId(event),
        expiresAt,
      });
      logger.info({ userId, type: event.type, product: event.product_id }, 'Webhook RevenueCat: suscripción activada');
    } else if (EXPIRATION_EVENTS.has(event.type)) {
      await subscriptionService.expireSubscriptionFromWebhook(userId, resolveTransactionId(event));
      logger.info({ userId, type: event.type }, 'Webhook RevenueCat: suscripción expirada');
    } else {
      logger.debug({ userId, type: event.type }, 'Webhook RevenueCat: evento ignorado');
    }

    res.status(200).json({ received: true });
  } catch (err) {
    // Loguear pero devolver 200 — evitar reintentos innecesarios de RevenueCat en errores transitorios
    logger.error({ err }, 'Webhook RevenueCat: error inesperado');
    res.status(200).json({ received: true });
  }
}
