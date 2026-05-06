import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { getHistoryHandler, getTotalHandler } from '../controllers/points.controller';

const router = Router();

router.use(authenticate);

router.get('/', getHistoryHandler);
router.get('/total', getTotalHandler);

export default router;
