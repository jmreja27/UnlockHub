import { Router } from 'express';

import { authenticate } from '../middleware/authenticate';
import { getHistoryHandler, getTotalHandler, rewardedAdHandler } from '../controllers/points.controller';

const router = Router();

router.use(authenticate);

router.get('/', getHistoryHandler);
router.get('/total', getTotalHandler);
router.post('/rewarded-ad', rewardedAdHandler);

export default router;
