import { Router } from 'express';

import { authenticate } from '../middleware/authenticate';
import { upvoteGuideHandler, reportGuideHandler } from '../controllers/guide.controller';

const router = Router();

/**
 * POST /api/v1/guides/:id/upvote
 * Suma 1 upvote a la guía indicada.
 */
router.post('/:id/upvote', authenticate, upvoteGuideHandler);

/**
 * POST /api/v1/guides/:id/report
 * Marca la guía como reportada para moderación.
 */
router.post('/:id/report', authenticate, reportGuideHandler);

export default router;
