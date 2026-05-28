import { Router } from 'express';

import { revenueCatWebhookHandler } from '../controllers/webhooks.controller';

const router = Router();

// POST /api/v1/webhooks/revenuecat — sin autenticación JWT; verificación con REVENUECAT_WEBHOOK_SECRET
router.post('/revenuecat', (req, res) => {
  void revenueCatWebhookHandler(req, res);
});

export default router;
