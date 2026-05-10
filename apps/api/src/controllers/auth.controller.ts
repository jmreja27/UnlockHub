import type { Request, Response, NextFunction } from 'express';

import * as authService from '../services/auth.service';
import { AppError } from '../middleware/errorHandler';
import type { AuthenticatedRequest } from '../middleware/authenticate';
import { registerSchema, loginSchema } from '@unlockhub/validators';
import { z } from 'zod';

const forgotPasswordSchema = z.object({ email: z.string().email() });
const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8).max(128),
});

export async function registerHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const input = registerSchema.parse(req.body);
    const { user, accessToken, refreshToken } = await authService.register(input);

    res.status(201).json({
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        isPremium: user.isPremium,
        createdAt: user.createdAt,
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function loginHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const input = loginSchema.parse(req.body);
    const { user, accessToken, refreshToken } = await authService.login(input);

    res.json({
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        isPremium: user.isPremium,
        level: user.level,
        xp: user.xp,
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function refreshHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const rawRefreshToken = req.body['refreshToken'] as string | undefined;
    if (!rawRefreshToken) {
      throw new AppError('Refresh token no encontrado', 'MISSING_REFRESH_TOKEN', 401);
    }

    const { accessToken, refreshToken } = await authService.refresh(rawRefreshToken);
    res.json({ accessToken, refreshToken });
  } catch (err) {
    next(err);
  }
}

export async function logoutHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const rawRefreshToken = req.body['refreshToken'] as string | undefined;
    if (rawRefreshToken) {
      await authService.logout(rawRefreshToken);
    }
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

export async function logoutAllHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = (req as AuthenticatedRequest).user.id;
    await authService.logoutAll(userId);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

export function meHandler(req: Request, res: Response) {
  const { id, email, isPremium } = (req as AuthenticatedRequest).user;
  res.json({ id, email, isPremium });
}

export async function forgotPasswordHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { email } = forgotPasswordSchema.parse(req.body);
    await authService.forgotPassword(email);
    // Respuesta siempre igual para no revelar si el email existe
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

export async function resetPasswordHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { token, password } = resetPasswordSchema.parse(req.body);
    await authService.resetPassword(token, password);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}
