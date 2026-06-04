import { Router } from 'express';

import { authenticateOptional } from '../middleware/authenticate';
import { getGameAchievementsHandler } from '../controllers/games.controller';

const router = Router();

// JWT opcional: devuelve isUnlocked si hay token válido, sin 401 si no hay token
router.get('/:id/achievements', authenticateOptional, getGameAchievementsHandler);

export default router;
