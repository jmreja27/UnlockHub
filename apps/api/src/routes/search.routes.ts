import { Router } from 'express';
import rateLimit from 'express-rate-limit';

import { searchHandler, getGameHandler } from '../controllers/search.controller';
import { authenticateOptional } from '../middleware/authenticate';

const searchLimiter = rateLimit({ windowMs: 60_000, max: 60 });

const router = Router();

// authenticateOptional: devuelve isUnlocked en logros si hay JWT, sin 401 si no hay token
router.get('/', searchLimiter, authenticateOptional, searchHandler);
router.get('/games/:id', getGameHandler);

export default router;
