import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { getActiveChallengeHandler, getMyChallengeStatusHandler } from '../controllers/challenge.controller';

const router = Router();

router.get('/active', getActiveChallengeHandler);
router.get('/me', authenticate, getMyChallengeStatusHandler);

export default router;
