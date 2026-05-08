import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { sendAll } from '../services/notification.service';

const maintenanceNotifySchema = z.object({
  title: z.string().min(1).max(100),
  body: z.string().min(1).max(300),
});

export async function notifyMaintenanceHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { title, body } = maintenanceNotifySchema.parse(req.body);

    // Responder inmediatamente — el envío masivo se hace en background
    res.json({ ok: true, message: 'Notificación en proceso de envío' });

    // Fire-and-forget: no bloquea la respuesta
    void sendAll(title, body, { type: 'maintenance' }).catch((err: unknown) => {
      console.error('[admin] Error enviando notificación de mantenimiento:', err);
    });
  } catch (err) {
    next(err);
  }
}
