import { Router } from 'express';
import { adminAuth } from '../middleware/adminAuth';
import { notifyMaintenanceHandler } from '../controllers/admin.controller';

const router = Router();

router.post('/maintenance/notify', adminAuth, notifyMaintenanceHandler);

export default router;
