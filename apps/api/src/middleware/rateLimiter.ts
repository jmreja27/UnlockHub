import rateLimit from 'express-rate-limit';
import type { ApiError } from '@unlockhub/types';

function rateLimitMessage(message: string, code: string): ApiError {
  return { error: message, code };
}

export const globalRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
  message: rateLimitMessage(
    'Demasiadas peticiones, inténtalo de nuevo más tarde',
    'RATE_LIMIT_EXCEEDED',
  ),
});

// Rate limit estricto para /auth/* según CLAUDE.md
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: rateLimitMessage(
    'Demasiados intentos de autenticación, inténtalo en 15 minutos',
    'AUTH_RATE_LIMIT_EXCEEDED',
  ),
});
