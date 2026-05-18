import { Router } from 'express';

import { authenticate } from '../middleware/authenticate';
import {
  triggerSyncHandler,
  getSyncStatusHandler,
  getActiveSyncStatusHandler,
} from '../controllers/sync.controller';

const router = Router();

// GET  /api/v1/sync/status — estado de todos los syncs activos del usuario
router.get('/status', authenticate, getActiveSyncStatusHandler);

// POST /api/v1/sync/:platform  — dispara sync manual
router.post('/:platform', authenticate, triggerSyncHandler);

// GET  /api/v1/sync/:platform/status — estado del sync y cooldown restante
router.get('/:platform/status', authenticate, getSyncStatusHandler);

export default router;
