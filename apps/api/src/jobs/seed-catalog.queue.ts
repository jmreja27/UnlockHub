import { Queue } from 'bullmq';

import { redis } from '../lib/redis';

export interface SeedCatalogJobData {
  platforms: Array<'STEAM' | 'RA'>;
  triggeredBy: 'admin_manual' | 'scheduler';
}

export interface SeedCatalogJobResult {
  steamGames: number;
  steamAchievements: number;
  raGames: number;
  raAchievements: number;
  errors: number;
  finishedAt: string;
}

export const seedCatalogQueue = new Queue<SeedCatalogJobData, SeedCatalogJobResult>(
  'seed-catalog',
  {
    connection: redis,
    defaultJobOptions: {
      attempts: 1,
      removeOnComplete: { count: 10 },
      removeOnFail: { count: 10 },
    },
  },
);
