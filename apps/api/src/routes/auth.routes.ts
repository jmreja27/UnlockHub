import { Router } from 'express';

import { authRateLimiter } from '../middleware/rateLimiter';
import { authenticate } from '../middleware/authenticate';
import {
  registerHandler,
  loginHandler,
  refreshHandler,
  logoutHandler,
  logoutAllHandler,
  meHandler,
  forgotPasswordHandler,
  resetPasswordHandler,
  resetRedirectHandler,
} from '../controllers/auth.controller';

const router = Router();

router.post('/register', authRateLimiter, registerHandler);
router.post('/login', authRateLimiter, loginHandler);
router.post('/refresh', refreshHandler);
router.post('/logout', logoutHandler);
router.post('/logout-all', authenticate, logoutAllHandler);
router.get('/me', authenticate, meHandler);
router.post('/forgot-password', authRateLimiter, forgotPasswordHandler);
router.post('/reset-password', authRateLimiter, resetPasswordHandler);
// Público — sirve la página intermedia https:// que dispara el deep link unlockhub://
router.get('/reset-redirect', resetRedirectHandler);

export default router;
