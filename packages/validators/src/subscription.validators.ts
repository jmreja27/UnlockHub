import { z } from 'zod';

export const verifySubscriptionSchema = z
  .object({
    plan: z.enum(['MONTHLY', 'ANNUAL', 'LIFETIME'], {
      errorMap: () => ({ message: 'El plan debe ser MONTHLY, ANNUAL o LIFETIME' }),
    }),
    provider: z.enum(['GOOGLE_PLAY', 'APP_STORE'], {
      errorMap: () => ({ message: 'El proveedor debe ser GOOGLE_PLAY o APP_STORE' }),
    }),
    storeTransactionId: z
      .string()
      .min(1, 'El ID de transacción es obligatorio')
      .max(500, 'El ID de transacción es demasiado largo'),
    // expiresAt es obligatorio para MONTHLY/ANNUAL, no aplica para LIFETIME
    expiresAt: z.string().datetime({ message: 'La fecha de vencimiento debe ser un ISO 8601 válido' }).optional(),
  })
  .refine((data) => data.plan === 'LIFETIME' || !!data.expiresAt, {
    message: 'expiresAt es obligatorio para planes de suscripción recurrentes',
    path: ['expiresAt'],
  });

export type VerifySubscriptionInput = z.infer<typeof verifySubscriptionSchema>;
