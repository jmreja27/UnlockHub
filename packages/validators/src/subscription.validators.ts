import { z } from 'zod';

// Schema de validación para verificar y activar una suscripción premium
export const verifySubscriptionSchema = z.object({
  plan: z.enum(['MONTHLY', 'ANNUAL'], {
    errorMap: () => ({ message: 'El plan debe ser MONTHLY o ANNUAL' }),
  }),
  provider: z.enum(['GOOGLE_PLAY', 'APP_STORE'], {
    errorMap: () => ({ message: 'El proveedor debe ser GOOGLE_PLAY o APP_STORE' }),
  }),
  storeTransactionId: z
    .string()
    .min(1, 'El ID de transacción es obligatorio')
    .max(500, 'El ID de transacción es demasiado largo'),
  expiresAt: z.string().datetime({ message: 'La fecha de vencimiento debe ser un ISO 8601 válido' }),
});

export type VerifySubscriptionInput = z.infer<typeof verifySubscriptionSchema>;
