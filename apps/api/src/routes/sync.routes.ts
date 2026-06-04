import { Router } from 'express';

import { authenticate } from '../middleware/authenticate';
import {
  triggerSyncHandler,
  getSyncStatusHandler,
  getActiveSyncStatusHandler,
  getAggregateSyncStatusHandler,
} from '../controllers/sync.controller';

const router = Router();

// GET  /api/v1/sync/status — estado de todos los syncs activos del usuario
router.get('/status', authenticate, getActiveSyncStatusHandler);

// GET  /api/v1/sync/my-summary — resumen agregado para la UI (cooldown, próximo auto, syncs usados hoy)
router.get('/my-summary', authenticate, getAggregateSyncStatusHandler);

// POST /api/v1/sync/:platform  — dispara sync manual
router.post('/:platform', authenticate, triggerSyncHandler);

// GET  /api/v1/sync/:platform/status — estado del sync y cooldown restante
router.get('/:platform/status', authenticate, getSyncStatusHandler);

export default router;
