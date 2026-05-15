import { Router } from 'express';

import { adminAuth } from '../middleware/adminAuth';
import {
  notifyMaintenanceHandler,
  getMetricsHandler,
  getDashboardHandler,
} from '../controllers/admin.controller';

const router = Router();

// Dashboard HTML — accesible con autenticación Bearer ADMIN_SECRET
router.get('/', adminAuth, getDashboardHandler);

// API de métricas — devuelve JSON con todas las métricas de monitoreo
router.get('/metrics', adminAuth, getMetricsHandler);

// Notificación de mantenimiento masiva
router.post('/maintenance/notify', adminAuth, notifyMaintenanceHandler);

export default router;
