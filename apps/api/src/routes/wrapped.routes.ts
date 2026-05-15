import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { getWrappedHandler } from '../controllers/wrapped.controller';

const router = Router();

router.get('/:period', authenticate, getWrappedHandler);

export default router;
