import type { Request, Response, NextFunction } from 'express';

import type { AuthenticatedRequest } from '../middleware/authenticate';
import { getWrapped, getMonthlyWrapped } from '../services/wrapped.service';

// Acepta period en formato "YYYY" (anual) o "YYYY-MM" (mensual).
export async function getWrappedHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = (req as AuthenticatedRequest).user.id;
    const period = req.params['period'] ?? '';

    const monthlyMatch = /^(\d{4})-(\d{2})$/.exec(period);
    const annualMatch = /^(\d{4})$/.exec(period);

    if (monthlyMatch) {
      const year = parseInt(monthlyMatch[1]!, 10);
      const month = parseInt(monthlyMatch[2]!, 10);

      if (year < 2024 || month < 1 || month > 12) {
        res.status(400).json({ error: 'Período mensual inválido.', code: 'INVALID_PERIOD' });
        return;
      }

      const wrapped = await getMonthlyWrapped(userId, year, month);
      res.json({ wrapped });
      return;
    }

    if (annualMatch) {
      const year = parseInt(annualMatch[1]!, 10);

      if (year < 2024 || year > new Date().getFullYear()) {
        res.status(400).json({ error: 'Año inválido.', code: 'INVALID_YEAR' });
        return;
      }

      const wrapped = await getWrapped(userId, year);
      res.json({ wrapped });
      return;
    }

    res.status(400).json({
      error: 'Formato de período inválido. Usa "YYYY" para anual o "YYYY-MM" para mensual.',
      code: 'INVALID_PERIOD_FORMAT',
    });
  } catch (err) {
    next(err);
  }
}
