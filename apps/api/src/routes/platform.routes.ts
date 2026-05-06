import { Router } from 'express';

import { authenticate } from '../middleware/authenticate';
import {
  linkSteamHandler,
  unlinkSteamHandler,
  linkRetroAchievementsHandler,
  unlinkRetroAchievementsHandler,
  getLinkedPlatformsHandler,
} from '../controllers/platform.controller';

const router = Router();

// Todas las rutas de plataforma requieren autenticación
router.post('/steam/link', authenticate, linkSteamHandler);
router.delete('/steam/unlink', authenticate, unlinkSteamHandler);
router.post('/ra/link', authenticate, linkRetroAchievementsHandler);
router.delete('/ra/unlink', authenticate, unlinkRetroAchievementsHandler);
router.get('/', authenticate, getLinkedPlatformsHandler);

export default router;
