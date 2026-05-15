import { Router } from 'express';

import { authenticate } from '../middleware/authenticate';
import { challengeFriendHandler } from '../controllers/achievement.controller';
import { getGuidesHandler, createGuideHandler } from '../controllers/guide.controller';

const router = Router();

/**
 * POST /api/v1/achievements/:id/challenge
 * Reta a un amigo a conseguir el logro indicado.
 */
router.post('/:id/challenge', authenticate, challengeFriendHandler);

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
