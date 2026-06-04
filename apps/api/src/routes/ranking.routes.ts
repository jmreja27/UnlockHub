import { Router } from 'express';

import { authenticate } from '../middleware/authenticate';
import {
  getGlobalRankingHandler,
  getPlatformRankingHandler,
  getMyRankHandler,
} from '../controllers/ranking.controller';

const router = Router();

// GET /api/v1/rankings/global?page=1&limit=20
router.get('/global', getGlobalRankingHandler);

// GET /api/v1/rankings/platform/:platform?page=1&limit=20
router.get('/platform/:platform', getPlatformRankingHandler);

// GET /api/v1/rankings/me  — posición del usuario autenticado
router.get('/me', authenticate, getMyRankHandler);

export default router;
