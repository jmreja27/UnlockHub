import { z } from 'zod';

const MIN_AGE_YEARS = 16;

function isOldEnough(birthDate: Date): boolean {
  const today = new Date();
  const cutoff = new Date(
    today.getFullYear() - MIN_AGE_YEARS,
    today.getMonth(),
    today.getDate(),
  );
  return birthDate <= cutoff;
}

export const registerSchema = z.object({
  username: z
    .string()
    .min(3, 'El nombre de usuario debe tener al menos 3 caracteres')
    .max(30, 'El nombre de usuario no puede superar los 30 caracteres')
    .regex(
      /^[a-zA-Z0-9_-]+$/,
      'El nombre de usuario solo puede contener letras, números, _ y -',
    ),
  email: z.string().email('Email inválido'),
  password: z
    .string()
    .min(8, 'La contraseña debe tener al menos 8 caracteres')
    .regex(/[A-Z]/, 'La contraseña debe contener al menos una mayúscula')
    .regex(/[0-9]/, 'La contraseña debe contener al menos un número'),
  birthDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha de nacimiento debe tener el formato YYYY-MM-DD')
    .transform((s) => new Date(s))
    .refine(isOldEnough, `Debes tener al menos ${MIN_AGE_YEARS} años para registrarte`),
});

export const loginSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(1, 'La contraseña es obligatoria'),
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'El refresh token es obligatorio'),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>;
