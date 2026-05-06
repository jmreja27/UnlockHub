import { Router } from 'express';

import { authenticate } from '../middleware/authenticate';
import {
  verifySubscriptionHandler,
  cancelSubscriptionHandler,
  getSubscriptionStatusHandler,
} from '../controllers/subscription.controller';

const router = Router();

// Todos los endpoints de suscripción requieren autenticación
router.post('/verify', authenticate, verifySubscriptionHandler);
router.delete('/', authenticate, cancelSubscriptionHandler);
router.get('/status', authenticate, getSubscriptionStatusHandler);

export default router;
