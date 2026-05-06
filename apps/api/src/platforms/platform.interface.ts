import type { Platform, Achievement, Game, SyncResult } from '@unlockhub/types';
import type { PlatformAccount } from '@prisma/client';

export interface PlatformAdapter {
  readonly platform: Platform;
  getUserAchievements(externalId: string, apiKey: string): Promise<Achievement[]>;
  getGameInfo(externalId: string): Promise<Game>;
  syncUser(account: PlatformAccount): Promise<SyncResult>;
}
