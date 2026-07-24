/**
 * Plataformas de videojuegos soportadas.
 * Extensible: añadir el valor aquí y en el enum Platform de Prisma + crear el adapter.
 * XBOX está gateado hasta Fase 4 (requiere verificación OAuth2 de Microsoft).
 */
export type Platform = 'STEAM' | 'RA' | 'XBOX' | 'PSN';

export type ProfileVisibility = 'PUBLIC' | 'FRIENDS_ONLY' | 'PRIVATE';

export type PointReason = 'CHALLENGE' | 'STREAK' | 'ACHIEVEMENT' | 'REDEEM' | 'REWARDED_AD';

/** POINTS_REDEEM es el plan creado por canje de puntos — no es una compra en tienda. */
export type SubscriptionPlan = 'MONTHLY' | 'ANNUAL' | 'LIFETIME' | 'POINTS_REDEEM';

/** INTERNAL es el proveedor para canjes de puntos (300 pts = 7 días premium). */
export type StoreProvider = 'GOOGLE_PLAY' | 'APP_STORE' | 'INTERNAL';

export type SyncTier = 'free' | 'premium';

/**
 * Perfil del usuario autenticado (para uso interno con sesión activa).
 * Incluye email — nunca exponer en respuestas públicas.
 * Para perfiles públicos usar PublicUser.
 */
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
  profileVisibility: ProfileVisibility;
  createdAt: string;
}

/**
 * Perfil público del usuario — seguro para respuestas no autenticadas.
 * Excluye email, isPremium, premiumUntil y lastSyncAt.
 * El campo email nunca debe aparecer en perfiles accesibles sin autenticación (GDPR).
 */
export interface PublicUser {
  id: string;
  username: string;
  avatar: string | null;
  banner: string | null;
  bio: string | null;
  level: number;
  xp: number;
  streakDays: number;
  countryCode: string | null;
  profileVisibility: ProfileVisibility;
  createdAt: string;
}

/**
 * Cuenta de plataforma externa del usuario — omite el campo encryptedToken (AES-256).
 * requiresReauth=true indica que el token ha expirado y el usuario debe re-vincular (PSN).
 * psnProfilePrivate=true indica que el perfil PSN tiene los trofeos privados.
 */
export interface PlatformAccount {
  id: string;
  userId: string;
  platform: Platform;
  externalId: string;
  username: string;
  lastSyncedAt: string | null;
  requiresReauth: boolean;
  psnProfilePrivate: boolean;
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
  // T114 — instrumentación de timings, opcional para no romper consumidores existentes.
  // Suma de fetchMs/writeMs de todos los juegos/títulos procesados en esta llamada.
  timing?: { fetchMs: number; writeMs: number };
}

export interface RankingEntry {
  userId: string;
  username: string;
  avatar: string | null;
  xp: number;
  rank: number;
  countryCode: string | null;
}

/**
 * Estructura de respuesta paginada estándar usada en todos los endpoints de lista.
 * Los endpoints de biblioteca extienden esto con campos adicionales de aggregate stats.
 */
export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

/** Respuesta paginada por cursor — para feeds con scroll infinito hacia atrás en el tiempo. */
export interface CursorPaginatedResponse<T> {
  data: T[];
  nextCursor: string | null;
}

/** Estructura de error HTTP consistente en toda la API. Formato: { error, code, details? } */
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

/**
 * Estado de la relación de amistad entre el usuario autenticado y otro usuario.
 * Tipo discriminado por 'status' — incluye friendshipId cuando hay relación activa.
 * Usado por FriendshipButton para mostrar el botón correcto en el perfil público.
 */
export type FriendshipStatusResult =
  | { status: 'none' }
  | { status: 'pending_sent'; friendshipId: string }
  | { status: 'pending_received'; friendshipId: string }
  | { status: 'accepted'; friendshipId: string }
  | { status: 'blocked' };

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

export type AchievementChallengeStatus =
  | 'PENDING'
  | 'ACCEPTED'
  | 'REJECTED'
  | 'EXPIRED'
  | 'RESOLVED_WIN'
  | 'RESOLVED_DRAW';

export interface AchievementChallengeSummary {
  id: string;
  challengerId: string;
  challengedId: string;
  achievementId: string;
  status: AchievementChallengeStatus;
  createdAt: string;
  acceptedAt: string | null;
  expiresAt: string | null;
  resolvedAt: string | null;
  winnerId: string | null;
  pointsAwarded: number | null;
  challenger?: Pick<User, 'id' | 'username' | 'avatar'>;
  challenged?: Pick<User, 'id' | 'username' | 'avatar'>;
  achievement?: { id: string; title: string; iconUrl: string | null };
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
  // Estadísticas extendidas — solo presentes en el wrapped anual
  completedGamesByPlatform?: {
    steam: number;
    ra: number;
    psn: number;
  };
  platinumsEarned?: number;
  longestStreakInYear?: number;
  mostActivePlatform?: Platform | null;
  mostProductiveDay?: {
    date: string;  // "YYYY-MM-DD"
    achievementsCount: number;
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

// ─── Sync progresivo ──────────────────────────────────────────────────────────

/** Evento emitido por Socket.io en cada lote procesado durante un sync. */
export interface SyncProgressEvent {
  platform: Platform;
  processed: number;
  total: number;
  newGamesCount: number;
  newAchievementsCount: number;
  percentComplete: number;
}

/** Evento emitido por Socket.io cuando un sync completa. Incluye el XP ganado en el sync. */
export interface SyncCompleteEvent {
  platform: Platform;
  totalGames: number;
  newAchievements: number;
  xpEarned: number;
}

export interface SyncErrorEvent {
  platform: Platform;
  error: string;
  processedBeforeError: number;
}

/**
 * Respuesta del endpoint GET /api/v1/sync/status.
 * El campo isRunning se lee de la clave Redis sync:progress:{userId}:{platform} (TTL 2h).
 * Usado como fallback cuando Socket.io no está disponible (useSyncProgress).
 */
export interface SyncStatusResponse {
  platform: Platform;
  lastSyncedAt: string | null;
  cooldownRemainingSeconds: number;
  dailySyncsUsed: number;
  linked: boolean;
  isRunning: boolean;
  processed: number;
  total: number;
  percentComplete: number;
  startedAt: string | null;
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
