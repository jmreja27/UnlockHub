import { z } from 'zod';

export const createAchievementChallengeBodySchema = z.object({
  challengedUserId: z.string().cuid({ message: 'challengedUserId debe ser un CUID válido' }),
});

export const achievementChallengeParamsSchema = z.object({
  id: z.string().cuid({ message: 'id debe ser un CUID válido' }),
});

export const listAchievementChallengesQuerySchema = z.object({
  status: z
    .enum(['PENDING', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'RESOLVED_WIN', 'RESOLVED_DRAW'])
    .optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export type CreateAchievementChallengeInput = z.infer<typeof createAchievementChallengeBodySchema>;
export type AchievementChallengeParamsInput = z.infer<typeof achievementChallengeParamsSchema>;
export type ListAchievementChallengesQueryInput = z.infer<typeof listAchievementChallengesQuerySchema>;
