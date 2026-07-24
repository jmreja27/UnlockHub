import { Router } from 'express';

import { authenticate } from '../middleware/authenticate';
import * as achievementChallengeController from '../controllers/achievement-challenge.controller';

const router = Router();

router.use(authenticate);

router.get('/me', achievementChallengeController.listMyChallengesHandler);
router.post('/:id/accept', achievementChallengeController.acceptChallengeHandler);
router.post('/:id/reject', achievementChallengeController.rejectChallengeHandler);

export default router;
