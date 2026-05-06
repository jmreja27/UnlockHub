import type { Request, Response, NextFunction } from 'express';

import * as authService from '../services/auth.service';
import { AppError } from '../middleware/errorHandler';
import type { AuthenticatedRequest } from '../middleware/authenticate';
import { registerSchema, loginSchema } from '@unlockhub/validators';

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env['NODE_ENV'] === 'production',
  sameSite: 'strict' as const,
};

const ACCESS_COOKIE_OPTIONS = {
  ...COOKIE_OPTIONS,
  maxAge: 15 * 60 * 1000, // 15 minutos
};

const REFRESH_COOKIE_OPTIONS = {
  ...COOKIE_OPTIONS,
  maxAge: 30 * 24 * 60 * 60 * 1000, // 30 días
  path: '/api/v1/auth/refresh',
};

export async function registerHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const input = registerSchema.parse(req.body);
    const { user, accessToken, refreshToken } = await authService.register(input);

    res
      .cookie('access_token', accessToken, ACCESS_COOKIE_OPTIONS)
      .cookie('refresh_token', refreshToken, REFRESH_COOKIE_OPTIONS)
      .status(201)
      .json({
        id: user.id,
        username: user.username,
        email: user.email,
        isPremium: user.isPremium,
        createdAt: user.createdAt,
      });
  } catch (err) {
    next(err);
  }
}

export async function loginHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const input = loginSchema.parse(req.body);
    const { user, accessToken, refreshToken } = await authService.login(input);

    res
      .cookie('access_token', accessToken, ACCESS_COOKIE_OPTIONS)
      .cookie('refresh_token', refreshToken, REFRESH_COOKIE_OPTIONS)
      .json({
        id: user.id,
        username: user.username,
        email: user.email,
        isPremium: user.isPremium,
        level: user.level,
        xp: user.xp,
      });
  } catch (err) {
    next(err);
  }
}

export async function refreshHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const rawRefreshToken = req.cookies['refresh_token'] as string | undefined;
    if (!rawRefreshToken) {
      throw new AppError('Refresh token no encontrado', 'MISSING_REFRESH_TOKEN', 401);
    }

    const { accessToken, refreshToken } = await authService.refresh(rawRefreshToken);

    res
      .cookie('access_token', accessToken, ACCESS_COOKIE_OPTIONS)
      .cookie('refresh_token', refreshToken, REFRESH_COOKIE_OPTIONS)
      .json({ ok: true });
  } catch (err) {
    next(err);
  }
}

export async function logoutHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const rawRefreshToken = req.cookies['refresh_token'] as string | undefined;
    if (rawRefreshToken) {
      await authService.logout(rawRefreshToken);
    }

    res
      .clearCookie('access_token')
      .clearCookie('refresh_token', { path: '/api/v1/auth/refresh' })
      .json({ ok: true });
  } catch (err) {
    next(err);
  }
}

export async function logoutAllHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = (req as AuthenticatedRequest).user.id;
    await authService.logoutAll(userId);

    res
      .clearCookie('access_token')
      .clearCookie('refresh_token', { path: '/api/v1/auth/refresh' })
      .json({ ok: true });
  } catch (err) {
    next(err);
  }
}

export function meHandler(req: Request, res: Response) {
  const { id, email, isPremium } = (req as AuthenticatedRequest).user;
  res.json({ id, email, isPremium });
}
