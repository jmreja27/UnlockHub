import { Router } from 'express';
import rateLimit from 'express-rate-limit';

import { searchHandler, getGameHandler } from '../controllers/search.controller';

const searchLimiter = rateLimit({ windowMs: 60_000, max: 60 });

const router = Router();

router.get('/', searchLimiter, searchHandler);
router.get('/games/:id', getGameHandler);

export default router;
