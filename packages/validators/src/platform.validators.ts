import { z } from 'zod';

export const platformSchema = z.enum(['STEAM', 'RA', 'XBOX', 'PSN']);

export const linkSteamAccountSchema = z.object({
  steamId: z.string().min(1, 'El Steam ID es obligatorio'),
  apiKey: z.string().min(1, 'La API key de Steam es obligatoria'),
});

export const linkRetroAchievementsSchema = z.object({
  username: z.string().min(1, 'El username de RetroAchievements es obligatorio'),
  apiKey: z.string().min(1, 'La API key de RetroAchievements es obligatoria'),
});

export const linkPsnAccountSchema = z.object({
  username: z
    .string()
    .min(3, 'El username de PSN debe tener al menos 3 caracteres')
    .max(16, 'El username de PSN no puede superar los 16 caracteres')
    .regex(/^[A-Za-z0-9_\-]+$/, 'El username de PSN solo puede contener letras, números, guiones y guiones bajos'),
});

export const linkXboxAccountSchema = z.object({
  code: z.string().min(1, 'El código de autorización OAuth2 es obligatorio'),
  codeVerifier: z
    .string()
    .min(43, 'El code_verifier PKCE debe tener al menos 43 caracteres')
    .max(128, 'El code_verifier PKCE no puede superar los 128 caracteres'),
  redirectUri: z.string().url('La redirectUri debe ser una URL válida'),
});

export type LinkSteamAccountInput = z.infer<typeof linkSteamAccountSchema>;
export type LinkRetroAchievementsInput = z.infer<typeof linkRetroAchievementsSchema>;
export type LinkPsnAccountInput = z.infer<typeof linkPsnAccountSchema>; // { username: string }
export type LinkXboxAccountInput = z.infer<typeof linkXboxAccountSchema>;
