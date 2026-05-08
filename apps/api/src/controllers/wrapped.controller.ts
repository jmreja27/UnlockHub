import type { Request, Response, NextFunction } from 'express';
import type { AuthenticatedRequest } from '../middleware/authenticate';
import { getWrapped } from '../services/wrapped.service';

export async function getWrappedHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = (req as AuthenticatedRequest).user.id;
    const year = parseInt(req.params['year'] ?? '', 10);

    if (isNaN(year) || year < 2024 || year > new Date().getFullYear()) {
      res.status(400).json({ error: 'Año inválido.', code: 'INVALID_YEAR' });
      return;
    }

    const wrapped = await getWrapped(userId, year);
    res.json({ wrapped });
  } catch (err) {
    next(err);
  }
}
