import { Router } from 'express';

import { authenticate } from '../middleware/authenticate';
import {
  linkSteamHandler,
  unlinkSteamHandler,
  linkRetroAchievementsHandler,
  unlinkRetroAchievementsHandler,
  linkPsnHandler,
  unlinkPsnHandler,
  linkXboxHandler,
  unlinkXboxHandler,
  getLinkedPlatformsHandler,
} from '../controllers/platform.controller';

const router = Router();

// Todas las rutas de plataforma requieren autenticación
router.post('/steam/link', authenticate, linkSteamHandler);
router.delete('/steam/unlink', authenticate, unlinkSteamHandler);
router.post('/ra/link', authenticate, linkRetroAchievementsHandler);
router.delete('/ra/unlink', authenticate, unlinkRetroAchievementsHandler);
router.post('/psn/link', authenticate, linkPsnHandler);
router.delete('/psn/unlink', authenticate, unlinkPsnHandler);
router.post('/xbox/link', authenticate, linkXboxHandler);
router.delete('/xbox/unlink', authenticate, unlinkXboxHandler);
router.get('/', authenticate, getLinkedPlatformsHandler);

export default router;
