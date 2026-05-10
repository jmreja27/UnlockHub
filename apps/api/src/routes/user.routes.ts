import { Router } from 'express';

import { authenticate } from '../middleware/authenticate';
import {
  getMeHandler,
  updateMeHandler,
  getPublicProfileHandler,
  getStreakMilestoneHandler,
  getMyGamesHandler,
} from '../controllers/user.controller';

const router = Router();

// Rutas privadas — requieren autenticación
router.get('/me', authenticate, getMeHandler);
router.patch('/me', authenticate, updateMeHandler);
router.get('/me/games', authenticate, getMyGamesHandler);
router.get('/me/streak-milestone', authenticate, getStreakMilestoneHandler);

// Ruta pública — perfil de cualquier usuario por username
router.get('/:username', getPublicProfileHandler);

export default router;
