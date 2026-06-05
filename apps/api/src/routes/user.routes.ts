import { Router } from 'express';

import { authenticate, authenticateOptional } from '../middleware/authenticate';
import {
  getMeHandler,
  updateMeHandler,
  getPublicProfileHandler,
  getStreakMilestoneHandler,
  getMyGamesHandler,
  getMyGameAchievementsHandler,
  compareProfilesHandler,
  deleteAccountHandler,
  uploadAvatarHandler,
  uploadBannerHandler,
} from '../controllers/user.controller';
import { getMyStatsHandler } from '../controllers/stats.controller';
import { uploadAvatar, uploadBanner } from '../middleware/upload.middleware';

const router = Router();

// Rutas privadas — requieren autenticación
router.get('/me', authenticate, getMeHandler);
router.patch('/me', authenticate, updateMeHandler);
router.post('/me/avatar', authenticate, uploadAvatar, uploadAvatarHandler);
router.post('/me/banner', authenticate, uploadBanner, uploadBannerHandler);
router.get('/me/games', authenticate, getMyGamesHandler);
router.get('/me/games/:gameId/achievements', authenticate, getMyGameAchievementsHandler);
router.get('/me/streak-milestone', authenticate, getStreakMilestoneHandler);
router.get('/me/stats', authenticate, getMyStatsHandler);
router.delete('/me', authenticate, deleteAccountHandler);

// Ruta pública — perfil de cualquier usuario por username
// authenticateOptional: si hay token, extrae el userId para respetar FRIENDS_ONLY
router.get('/:username', authenticateOptional, getPublicProfileHandler);

// Ruta privada — comparar perfil autenticado con otro usuario
router.get('/:username/compare', authenticate, compareProfilesHandler);

export default router;
