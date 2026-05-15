import { Router } from 'express';

import { authenticate } from '../middleware/authenticate';
import { getFriendsFeedHandler, getPublicFeedHandler } from '../controllers/activity.controller';

const router = Router();

router.get('/feed', authenticate, getFriendsFeedHandler);
router.get('/public', getPublicFeedHandler);

export default router;
