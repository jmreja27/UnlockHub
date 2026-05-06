import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { registerDeviceTokenHandler, removeDeviceTokenHandler } from '../controllers/notification.controller';

const router = Router();

router.post('/device-token', authenticate, registerDeviceTokenHandler);
router.delete('/device-token', authenticate, removeDeviceTokenHandler);

export default router;
