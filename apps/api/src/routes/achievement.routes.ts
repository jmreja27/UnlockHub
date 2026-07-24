import { Router } from 'express';

import { authenticate } from '../middleware/authenticate';
import { createChallengeHandler } from '../controllers/achievement-challenge.controller';
import { getGuidesHandler, createGuideHandler } from '../controllers/guide.controller';

const router = Router();

/**
 * POST /api/v1/achievements/:id/challenge
 * Crea (o reutiliza) un reto 1v1 a otro usuario sobre el logro indicado.
 */
router.post('/:id/challenge', authenticate, createChallengeHandler);

/**
 * GET  /api/v1/achievements/:achievementId/guides
 * Lista las guías de un logro (público — no requiere auth).
 *
 * POST /api/v1/achievements/:achievementId/guides
 * Crea una guía para el logro (requiere auth).
 */
router.get('/:achievementId/guides', getGuidesHandler);
router.post('/:achievementId/guides', authenticate, createGuideHandler);

export default router;
