import { Router } from 'express';

import authRouter from './auth.routes';
import syncRouter from './sync.routes';
import rankingRouter from './ranking.routes';
import userRouter from './user.routes';
import platformRouter from './platform.routes';
import subscriptionRouter from './subscription.routes';
import friendshipRouter from './friendship.routes';
import pointsRouter from './points.routes';
import activityRouter from './activity.routes';
import challengeRouter from './challenge.routes';
import notificationRouter from './notification.routes';
import wrappedRouter from './wrapped.routes';
import adminRouter from './admin.routes';
import searchRouter from './search.routes';
import achievementRouter from './achievement.routes';
import guideRouter from './guide.routes';

const router = Router();

router.get('/', (_req, res) => {
  res.json({ name: 'UnlockHub API', version: '1.0.0' });
});

router.use('/auth', authRouter);
router.use('/sync', syncRouter);
router.use('/rankings', rankingRouter);
router.use('/users', userRouter);
router.use('/platforms', platformRouter);
router.use('/subscriptions', subscriptionRouter);
router.use('/friends', friendshipRouter);
router.use('/users/me/points', pointsRouter);
router.use('/activity', activityRouter);
router.use('/challenges', challengeRouter);
router.use('/notifications', notificationRouter);
router.use('/wrapped', wrappedRouter);
router.use('/admin', adminRouter);
router.use('/search', searchRouter);
router.use('/achievements', achievementRouter);
router.use('/guides', guideRouter);

export default router;
