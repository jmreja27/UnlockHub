import { Router } from 'express';

import authRouter from './auth.routes';
import syncRouter from './sync.routes';
import rankingRouter from './ranking.routes';
import userRouter from './user.routes';
import platformRouter from './platform.routes';
import subscriptionRouter from './subscription.routes';
import friendshipRouter from './friendship.routes';

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

export default router;
