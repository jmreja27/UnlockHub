import { z } from 'zod';

import { logger } from '../lib/logger';

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('30d'),
  CORS_ORIGIN: z.string().default(''),
  ENCRYPTION_KEY: z.string().length(64),
  STEAM_API_KEY: z.string().optional(),
  // PSN del sistema — usado para acceder a perfiles públicos sin token de usuario
  // Obtener en: my.playstation.com → ssocookie. Expira cada ~60 días. Renovar en Railway Variables.
  PSN_SYSTEM_NPSSO: z.string().optional(),
  // RetroAchievements del sistema — usado para verificar usuarios y sincronizar sin token individual
  // Registrar una cuenta en retroachievements.org → Settings → Keys → Web API Key
  RA_SYSTEM_USER: z.string().optional(),
  RA_SYSTEM_KEY: z.string().optional(),
  CLOUDINARY_URL: z.preprocess(
    (v) => (v === '' ? undefined : v),
    z.string().url().optional()
  ),
  // RevenueCat — bearer token que RevenueCat envía en cada webhook para verificar autenticidad
  REVENUECAT_WEBHOOK_SECRET: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(): Env {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    logger.error({ errors: result.error.flatten() }, 'Variables de entorno inválidas');
    process.exit(1);
  }
  return result.data;
}
