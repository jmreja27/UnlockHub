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

export type LinkSteamAccountInput = z.infer<typeof linkSteamAccountSchema>;
export type LinkRetroAchievementsInput = z.infer<typeof linkRetroAchievementsSchema>;
