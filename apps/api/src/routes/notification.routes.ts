import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { registerDeviceTokenHandler, removeDeviceTokenHandler } from '../controllers/notification.controller';
import {
  getNotificationsHandler,
  getUnreadCountHandler,
  markAllReadHandler,
  markOneReadHandler,
} from '../controllers/inapp-notification.controller';

const router = Router();

// Tokens de dispositivo para push notifications
router.post('/device-token', authenticate, registerDeviceTokenHandler);
router.delete('/device-token', authenticate, removeDeviceTokenHandler);

// Centro de notificaciones in-app
router.get('/me', authenticate, getNotificationsHandler);
router.get('/me/unread-count', authenticate, getUnreadCountHandler);
router.patch('/me/read-all', authenticate, markAllReadHandler);
router.patch('/me/:id/read', authenticate, markOneReadHandler);

export default router;
