import crypto from 'crypto';
import type { Request, Response, NextFunction } from 'express';

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
