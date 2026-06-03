import rateLimit from 'express-rate-limit';
import type { ApiError } from '@unlockhub/types';

/** Construye la respuesta de error estándar para rate limit. */
function rateLimitMessage(message: string, code: string): ApiError {
  return { error: message, code };
}

/** Rate limiter global: 500 req / 15 min por IP. No aplica a /health (se monta antes). */
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
