import { Router } from 'express';

import authRouter from './auth.routes';
import syncRouter from './sync.routes';
import rankingRouter from './ranking.routes';

const router = Router();

router.get('/', (_req, res) => {
  res.json({ name: 'UnlockHub API', version: '1.0.0' });
});

router.use('/auth', authRouter);
router.use('/sync', syncRouter);
router.use('/rankings', rankingRouter);

// Se irán añadiendo en los pasos siguientes:
// router.use('/users', userRouter);
// router.use('/platforms', platformRouter);
// router.use('/achievements', achievementRouter);
// router.use('/rankings', rankingRouter);

export default router;
