import { Router } from 'express';

import { authenticate, authenticateOptional } from '../middleware/authenticate';
import {
  getGameAchievementsHandler,
  fetchGameAchievementsHandler,
} from '../controllers/games.controller';

const router = Router();

// JWT opcional: devuelve isUnlocked si hay token válido, sin 401 si no hay token
router.get('/:id/achievements', authenticateOptional, getGameAchievementsHandler);

// Requiere auth: solo usuarios autenticados pueden disparar un fetch on-demand
router.post('/:id/fetch-achievements', authenticate, fetchGameAchievementsHandler);

export default router;
