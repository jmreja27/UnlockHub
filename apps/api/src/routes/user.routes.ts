import { Router } from 'express';

import { authenticate } from '../middleware/authenticate';
import {
  getMeHandler,
  updateMeHandler,
  getPublicProfileHandler,
  getStreakMilestoneHandler,
  getMyGamesHandler,
  getMyGameAchievementsHandler,
  compareProfilesHandler,
  deleteAccountHandler,
} from '../controllers/user.controller';
import { getMyStatsHandler } from '../controllers/stats.controller';

const router = Router();

// Rutas privadas — requieren autenticación
router.get('/me', authenticate, getMeHandler);
router.patch('/me', authenticate, updateMeHandler);
router.get('/me/games', authenticate, getMyGamesHandler);
router.get('/me/games/:gameId/achievements', authenticate, getMyGameAchievementsHandler);
router.get('/me/streak-milestone', authenticate, getStreakMilestoneHandler);
router.get('/me/stats', authenticate, getMyStatsHandler);
router.delete('/me', authenticate, deleteAccountHandler);

// Ruta pública — perfil de cualquier usuario por username
router.get('/:username', getPublicProfileHandler);

// Ruta privada — comparar perfil autenticado con otro usuario
router.get('/:username/compare', authenticate, compareProfilesHandler);

export default router;
