import type { Platform, Achievement, Game, SyncResult } from '@unlockhub/types';
import type { PlatformAccount } from '@prisma/client';

export interface SyncBatchProgress {
  processed: number;
  total: number;
  newGamesCount: number;
  newAchievementsCount: number;
}

export type SyncBatchCallback = (progress: SyncBatchProgress) => Promise<void>;

export interface PlatformAdapter {
  readonly platform: Platform;
  getUserAchievements(externalId: string, apiKey?: string): Promise<Achievement[]>;
  getGameInfo(externalId: string): Promise<Game>;
  syncUser(account: PlatformAccount): Promise<SyncResult>;
  syncUserBatched?(account: PlatformAccount, onBatch: SyncBatchCallback): Promise<SyncResult>;
  syncUserExpress?(account: PlatformAccount): Promise<SyncResult>;
}
