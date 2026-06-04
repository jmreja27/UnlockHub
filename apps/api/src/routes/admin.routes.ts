import { Router } from 'express';

import { adminAuth } from '../middleware/adminAuth';
import {
  notifyMaintenanceHandler,
  getMetricsHandler,
  getDashboardHandler,
  triggerSeedCatalogHandler,
} from '../controllers/admin.controller';

const router = Router();

// Dashboard HTML — accesible con autenticación Bearer ADMIN_SECRET
router.get('/', adminAuth, getDashboardHandler);

// API de métricas — devuelve JSON con todas las métricas de monitoreo
router.get('/metrics', adminAuth, getMetricsHandler);

// Notificación de mantenimiento masiva
router.post('/maintenance/notify', adminAuth, notifyMaintenanceHandler);

// Seed manual del catálogo de juegos y logros (Steam + RA)
router.post('/seed-catalog', adminAuth, triggerSeedCatalogHandler);

export default router;
