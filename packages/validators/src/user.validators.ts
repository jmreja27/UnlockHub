import { z } from 'zod';

// Schema para actualizar el perfil público del usuario
export const updateProfileSchema = z.object({
  bio: z.string().max(300, 'La bio no puede superar los 300 caracteres').optional(),
  countryCode: z
    .string()
    .length(2, 'El código de país debe tener exactamente 2 caracteres')
    .toUpperCase()
    .optional(),
  profileVisibility: z.enum(['PUBLIC', 'FRIENDS_ONLY', 'PRIVATE']).optional(),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
