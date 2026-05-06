import { z } from 'zod';

const CHALLENGE_METRICS = ['ACHIEVEMENTS_UNLOCKED', 'XP_GAINED', 'GAMES_PLAYED', 'STREAK_MAINTAINED'] as const;

export const createChallengeSchema = z.object({
  title: z.string().min(3).max(100),
  description: z.string().min(10).max(500),
  metric: z.enum(CHALLENGE_METRICS),
  targetValue: z.number().int().positive(),
  xpReward: z.number().int().positive().default(500),
  startAt: z.string().datetime(),
  endAt: z.string().datetime(),
}).refine((data) => new Date(data.endAt) > new Date(data.startAt), {
  message: 'endAt debe ser posterior a startAt',
  path: ['endAt'],
});

export type CreateChallengeInput = z.infer<typeof createChallengeSchema>;
