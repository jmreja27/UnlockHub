import crypto from 'crypto';

import type { Request, Response, NextFunction } from 'express';

/**
 * Middleware de autenticación del dashboard de administración.
 * Compara el header `Authorization: Bearer <ADMIN_SECRET>` en tiempo constante
 * para evitar timing attacks. Devuelve 503 si ADMIN_SECRET no está configurado.
 */
export function adminAuth(req: Request, res: Response, next: NextFunction): void {
  const secret = process.env['ADMIN_SECRET'];
  if (!secret) {
    res.status(503).json({ error: 'Admin no configurado', code: 'ADMIN_NOT_CONFIGURED' });
    return;
  }
  const auth = req.headers['authorization'] ?? '';
  const expected = `Bearer ${secret}`;
  // timingSafeEqual previene timing attacks comparando en tiempo constante
  const valid =
    auth.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(auth), Buffer.from(expected));
  if (!valid) {
    res.status(401).json({ error: 'No autorizado', code: 'UNAUTHORIZED' });
    return;
  }
  next();
}
