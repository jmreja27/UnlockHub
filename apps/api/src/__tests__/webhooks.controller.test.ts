import type { Request, Response } from 'express';

import { revenueCatWebhookHandler } from '../controllers/webhooks.controller';
import * as subscriptionService from '../services/subscription.service';

jest.mock('../services/subscription.service');
jest.mock('../lib/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const mockCreateOrUpdate = subscriptionService.createOrUpdateSubscription as jest.Mock;
const mockExpire = subscriptionService.expireSubscriptionFromWebhook as jest.Mock;

function buildReq(body: unknown, authHeader?: string): Partial<Request> {
  return {
    body,
    path: '/webhooks/revenuecat',
    headers: authHeader ? { authorization: authHeader } : {},
  };
}

function buildRes(): { res: Partial<Response>; statusMock: jest.Mock; jsonMock: jest.Mock } {
  const jsonMock = jest.fn().mockReturnThis();
  const statusMock = jest.fn().mockReturnValue({ json: jsonMock });
  const res: Partial<Response> = {
    status: statusMock,
    json: jsonMock,
  };
  return { res, statusMock, jsonMock };
}

const INITIAL_PURCHASE_PAYLOAD = {
  api_version: '1.0',
  event: {
    type: 'INITIAL_PURCHASE',
    app_user_id: 'user-1',
    product_id: 'unlockhub_premium_monthly',
    store: 'PLAY_STORE',
    transaction_id: 'GPA.xxx',
    expiration_at_ms: Date.now() + 30 * 24 * 60 * 60 * 1000,
    environment: 'PRODUCTION',
  },
};

const EXPIRATION_PAYLOAD = {
  api_version: '1.0',
  event: {
    type: 'EXPIRATION',
    app_user_id: 'user-1',
    product_id: 'unlockhub_premium_monthly',
    store: 'PLAY_STORE',
    transaction_id: 'GPA.xxx',
    expiration_at_ms: Date.now() - 1000,
    environment: 'PRODUCTION',
  },
};

describe('revenueCatWebhookHandler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env['REVENUECAT_WEBHOOK_SECRET'];
  });

  describe('sin REVENUECAT_WEBHOOK_SECRET configurado', () => {
    it('INITIAL_PURCHASE activa la suscripción del usuario', async () => {
      mockCreateOrUpdate.mockResolvedValue(undefined);
      const { res, jsonMock } = buildRes();

      await revenueCatWebhookHandler(buildReq(INITIAL_PURCHASE_PAYLOAD) as Request, res as Response);

      expect(mockCreateOrUpdate).toHaveBeenCalledWith('user-1', expect.objectContaining({
        plan: 'MONTHLY',
        provider: 'GOOGLE_PLAY',
      }));
      expect(jsonMock).toHaveBeenCalledWith({ received: true });
    });

    it('RENEWAL también activa la suscripción', async () => {
      mockCreateOrUpdate.mockResolvedValue(undefined);
      const payload = { ...INITIAL_PURCHASE_PAYLOAD, event: { ...INITIAL_PURCHASE_PAYLOAD.event, type: 'RENEWAL' } };
      const { res, jsonMock } = buildRes();

      await revenueCatWebhookHandler(buildReq(payload) as Request, res as Response);

      expect(mockCreateOrUpdate).toHaveBeenCalled();
      expect(jsonMock).toHaveBeenCalledWith({ received: true });
    });

    it('EXPIRATION revoca el premium del usuario', async () => {
      mockExpire.mockResolvedValue(undefined);
      const { res, jsonMock } = buildRes();

      await revenueCatWebhookHandler(buildReq(EXPIRATION_PAYLOAD) as Request, res as Response);

      expect(mockExpire).toHaveBeenCalledWith('user-1', 'GPA.xxx');
      expect(jsonMock).toHaveBeenCalledWith({ received: true });
    });

    it('CANCELLATION también expira la suscripción', async () => {
      mockExpire.mockResolvedValue(undefined);
      const payload = { ...EXPIRATION_PAYLOAD, event: { ...EXPIRATION_PAYLOAD.event, type: 'CANCELLATION' } };
      const { res, jsonMock } = buildRes();

      await revenueCatWebhookHandler(buildReq(payload) as Request, res as Response);

      expect(mockExpire).toHaveBeenCalled();
      expect(jsonMock).toHaveBeenCalledWith({ received: true });
    });

    it('devuelve 200 aunque el userId no exista', async () => {
      mockCreateOrUpdate.mockRejectedValue(new Error('USER_NOT_FOUND'));
      const { res, jsonMock } = buildRes();

      await revenueCatWebhookHandler(buildReq(INITIAL_PURCHASE_PAYLOAD) as Request, res as Response);

      expect(jsonMock).toHaveBeenCalledWith({ received: true });
    });

    it('devuelve 200 con payload malformado', async () => {
      const { res, jsonMock } = buildRes();

      await revenueCatWebhookHandler(buildReq({ garbage: true }) as Request, res as Response);

      expect(mockCreateOrUpdate).not.toHaveBeenCalled();
      expect(jsonMock).toHaveBeenCalledWith({ received: true });
    });

    it('resuelve ANNUAL para product_id con "annual"', async () => {
      mockCreateOrUpdate.mockResolvedValue(undefined);
      const payload = {
        ...INITIAL_PURCHASE_PAYLOAD,
        event: { ...INITIAL_PURCHASE_PAYLOAD.event, product_id: 'unlockhub_premium_annual' },
      };
      const { res } = buildRes();

      await revenueCatWebhookHandler(buildReq(payload) as Request, res as Response);

      expect(mockCreateOrUpdate).toHaveBeenCalledWith('user-1', expect.objectContaining({
        plan: 'ANNUAL',
      }));
    });
  });

  describe('con REVENUECAT_WEBHOOK_SECRET configurado', () => {
    beforeEach(() => {
      process.env['REVENUECAT_WEBHOOK_SECRET'] = 'test-secret-abc';
    });

    it('acepta la petición con firma válida', async () => {
      mockCreateOrUpdate.mockResolvedValue(undefined);
      const { res, jsonMock } = buildRes();

      await revenueCatWebhookHandler(
        buildReq(INITIAL_PURCHASE_PAYLOAD, 'Bearer test-secret-abc') as Request,
        res as Response,
      );

      expect(mockCreateOrUpdate).toHaveBeenCalled();
      expect(jsonMock).toHaveBeenCalledWith({ received: true });
    });

    it('rechaza la petición con firma inválida — devuelve 401', async () => {
      const { res, statusMock, jsonMock } = buildRes();

      await revenueCatWebhookHandler(
        buildReq(INITIAL_PURCHASE_PAYLOAD, 'Bearer wrong-secret') as Request,
        res as Response,
      );

      expect(mockCreateOrUpdate).not.toHaveBeenCalled();
      expect(statusMock).toHaveBeenCalledWith(401);
      expect(jsonMock).toHaveBeenCalledWith({ error: 'Unauthorized' });
    });

    it('rechaza la petición sin header Authorization', async () => {
      const { res, statusMock } = buildRes();

      await revenueCatWebhookHandler(
        buildReq(INITIAL_PURCHASE_PAYLOAD) as Request,
        res as Response,
      );

      expect(statusMock).toHaveBeenCalledWith(401);
    });
  });
});
