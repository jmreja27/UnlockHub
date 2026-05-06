import { Router } from 'express';

const router = Router();

router.get('/', (_req, res) => {
  res.json({ name: 'UnlockHub API', version: '1.0.0' });
});

// Las rutas se añadirán aquí en los pasos siguientes:
// router.use('/auth', authRouter);
// router.use('/users', userRouter);
// router.use('/platforms', platformRouter);
// router.use('/achievements', achievementRouter);
// router.use('/rankings', rankingRouter);

export default router;
