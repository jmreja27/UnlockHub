// Plataformas soportadas — extensible: añadir XBOX/PSN aquí y en el enum de Prisma
export type Platform = 'STEAM' | 'RA' | 'XBOX' | 'PSN';

export type PointReason = 'CHALLENGE' | 'STREAK' | 'ACHIEVEMENT';

export type SubscriptionPlan = 'MONTHLY' | 'ANNUAL' | 'LIFETIME';

export type StoreProvider = 'GOOGLE_PLAY' | 'APP_STORE';

export type SyncTier = 'free' | 'premium';

// Usuario público (sin campos sensibles como passwordHash)
export interface User {
  id: string;
  username: string;
  email: string;
  avatar: string | null;
  banner: string | null;
  bio: string | null;
  level: number;
  xp: number;
  streakDays: number;
  countryCode: string | null;
  isPremium: boolean;
  premiumUntil: string | null;
  lastSyncAt: string | null;
  createdAt: string;
}

// Cuenta de plataforma externa (sin token cifrado)
export interface PlatformAccount {
  id: string;
  userId: string;
  platform: Platform;
  externalId: string;
  username: string;
  lastSyncedAt: string | null;
  requiresReauth: boolean;
}

export interface Achievement {
  id: string;
  gameId: string;
  platform: Platform;
  externalId: string;
  title: string;
  description: string | null;
  iconUrl: string | null;
  rawValue: number | null;
  normalizedPoints: number;
  rarity: number | null;
  externalUrl: string | null;
}

export interface Game {
  id: string;
  platform: Platform;
  externalId: string;
  title: string;
  console: string | null;
  iconUrl: string | null;
  headerUrl: string | null;
  totalAchievements: number;
}

export interface UserAchievement {
  userId: string;
  achievementId: string;
  unlockedAt: string;
  achievement: Achievement;
}

export interface SyncResult {
  platform: Platform;
  achievementsSynced: number;
  gamesUpdated: number;
  syncedAt: string;
}

export interface RankingEntry {
  userId: string;
  username: string;
  avatar: string | null;
  xp: number;
  rank: number;
  countryCode: string | null;
}

// Estructura de respuesta paginada usada en todos los endpoints de lista
export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

// Estructura de error HTTP consistente en toda la API
export interface ApiError {
  error: string;
  code: string;
  details?: unknown;
}

export interface SyncCooldownConfig {
  autoSyncIntervalMinutes: number;
  manualSyncCooldownMinutes: number;
  dailyManualSyncLimit: number | null;
}

// ─── Social ───────────────────────────────────────────────────────────────────

export type FriendshipStatus = 'PENDING' | 'ACCEPTED' | 'BLOCKED';

export interface Friendship {
  id: string;
  senderId: string;
  receiverId: string;
  status: FriendshipStatus;
  createdAt: string;
  sender?: Pick<User, 'id' | 'username' | 'avatar' | 'level' | 'xp'>;
  receiver?: Pick<User, 'id' | 'username' | 'avatar' | 'level' | 'xp'>;
}

export type ActivityEventType =
  | 'ACHIEVEMENT_UNLOCKED'
  | 'FRIEND_ADDED'
  | 'LEVEL_UP'
  | 'CHALLENGE_COMPLETED'
  | 'STREAK_MILESTONE'
  | 'GAME_COMPLETED';

export interface ActivityEvent {
  id: string;
  userId: string;
  type: ActivityEventType;
  payload: Record<string, unknown>;
  createdAt: string;
  user?: Pick<User, 'id' | 'username' | 'avatar'>;
}

export type ChallengeMetric =
  | 'ACHIEVEMENTS_UNLOCKED'
  | 'XP_GAINED'
  | 'GAMES_PLAYED'
  | 'STREAK_MAINTAINED';

export interface WeeklyChallenge {
  id: string;
  title: string;
  description: string;
  metric: ChallengeMetric;
  targetValue: number;
  xpReward: number;
  startAt: string;
  endAt: string;
}

export interface UserChallenge {
  id: string;
  userId: string;
  challengeId: string;
  progress: number;
  completedAt: string | null;
  challenge?: WeeklyChallenge;
}

export interface GamingWrapped {
  year: number;
  month?: number;  // 1-12 si es wrapped mensual; undefined si es anual
  period: string;  // "YYYY" para anual, "YYYY-MM" para mensual
  totalAchievements: number;
  totalXpGained: number;
  topGame: {
    title: string;
    iconUrl: string | null;
    achievementsCount: number;
    platform: Platform;
  } | null;
  rarestAchievement: {
    title: string;
    iconUrl: string | null;
    rarity: number;
    gameName: string;
  } | null;
  bestStreak: number;
  previousYear: {
    totalAchievements: number;
    totalXpGained: number;
    bestStreak: number;
  } | null;
}

// Search
export type SearchResultType = 'game' | 'user' | 'achievement';

export interface GameSearchResult {
  type: 'game';
  id: string;
  platform: Platform;
  title: string;
  console: string | null;
  iconUrl: string | null;
  totalAchievements: number;
}

export interface UserSearchResult {
  type: 'user';
  id: string;
  username: string;
  avatar: string | null;
  level: number;
  xp: number;
}

export interface AchievementSearchResult {
  type: 'achievement';
  id: string;
  title: string;
  description: string | null;
  iconUrl: string | null;
  rarity: number | null;
  normalizedPoints: number;
  platform: Platform;
  game: {
    id: string;
    title: string;
    iconUrl: string | null;
  };
  isUnlocked: boolean;
  unlockedAt: string | null;
}

export type SearchResult = GameSearchResult | UserSearchResult | AchievementSearchResult;

export interface SearchResponse {
  games: GameSearchResult[];
  users: UserSearchResult[];
  achievements: AchievementSearchResult[];
  total: number;
}

export const SYNC_COOLDOWNS: Record<SyncTier, SyncCooldownConfig> = {
  free: {
    autoSyncIntervalMinutes: 60,
    manualSyncCooldownMinutes: 30,
    dailyManualSyncLimit: 5,
  },
  premium: {
    autoSyncIntervalMinutes: 15,
    manualSyncCooldownMinutes: 5,
    dailyManualSyncLimit: null,
  },
};
