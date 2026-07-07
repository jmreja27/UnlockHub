import type { Request, Response, NextFunction } from 'express';
import { registerSchema, loginSchema } from '@unlockhub/validators';
import { z } from 'zod';

import * as authService from '../services/auth.service';
import * as userService from '../services/user.service';
import { AppError } from '../middleware/errorHandler';
import type { AuthenticatedRequest } from '../middleware/authenticate';

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
        streakDays: user.streakDays,
        streakShields: user.streakShields,
        countryCode: user.countryCode,
        avatar: user.avatar,
        banner: user.banner,
        profileVisibility: user.profileVisibility,
        role: user.role,
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

export async function meHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = (req as AuthenticatedRequest).user;
    const profile = await userService.getProfile(id);
    res.json(profile);
  } catch (err) {
    next(err);
  }
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

// El token de reset es siempre crypto.randomBytes(32).toString('hex') — 64 caracteres hexadecimales
const RESET_TOKEN_HEX_PATTERN = /^[0-9a-f]{64}$/;

// GET /api/v1/auth/reset-redirect — página intermedia https:// que dispara el deep link unlockhub://
// Necesaria porque algunos clientes de email (Gmail, Outlook) bloquean o reescriben enlaces con
// esquemas custom (unlockhub://) en el botón/link del email, pero sí permiten https://.
export function resetRedirectHandler(req: Request, res: Response): void {
  const rawToken = req.query['token'];
  const token = typeof rawToken === 'string' ? rawToken : '';

  res.setHeader('Content-Type', 'text/html; charset=utf-8');

  if (!RESET_TOKEN_HEX_PATTERN.test(token)) {
    res.status(400).send(`<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8" /><title>Enlace no válido — UnlockHub</title></head>
<body style="font-family:sans-serif;text-align:center;padding:48px 16px;background:#0f0f1a;color:#e5e7eb;">
  <h1 style="color:#6366f1;">UnlockHub</h1>
  <p>Este enlace de recuperación no es válido.</p>
</body>
</html>`);
    return;
  }

  const appScheme = process.env['APP_SCHEME'] ?? 'unlockhub';
  const deepLink = `${appScheme}://reset-password?token=${token}`;

  res.send(`<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Restablecer contraseña — UnlockHub</title>
  <meta http-equiv="refresh" content="0; url=${deepLink}" />
</head>
<body style="font-family:sans-serif;text-align:center;padding:48px 16px;background:#0f0f1a;color:#e5e7eb;">
  <h1 style="color:#6366f1;margin-bottom:8px;">UnlockHub</h1>
  <p style="color:#9ca3af;margin-bottom:24px;">Abriendo la aplicación para restablecer tu contraseña...</p>
  <a href="${deepLink}"
     style="display:inline-block;background:#6366f1;color:#ffffff;font-weight:600;padding:14px 28px;border-radius:10px;text-decoration:none;font-size:15px;">
    Abrir en la aplicación
  </a>
  <p style="color:#6b7280;font-size:12px;margin-top:32px;">
    Si no se abre automáticamente, abre este enlace desde tu móvil con UnlockHub instalado.
  </p>
  <script>window.location.href = ${JSON.stringify(deepLink)};</script>
</body>
</html>`);
}
