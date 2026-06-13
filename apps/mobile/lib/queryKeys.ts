export const queryKeys = {
  me: () => ['me'] as const,

  notifications: () => ['notifications'] as const,
  notificationsUnreadCount: () => ['notifications', 'unread-count'] as const,

  achievementGuides: (achievementId: string) => ['achievement-guides', achievementId] as const,

  myPointsTotal: () => ['my-points-total'] as const,

  friends: () => ['friends'] as const,
  friendsPending: () => ['friends', 'pending'] as const,
  friendshipStatus: (username: string) => ['friendship-status', username] as const,

  linkedPlatforms: () => ['linkedPlatforms'] as const,
  platforms: (userId: string) => ['platforms', userId] as const,
  // Clave base para invalidaciones por prefijo (sin userId conocido)
  platformsBase: () => ['platforms'] as const,

  // Clave base para invalidaciones por prefijo; clave con plataforma para useInfiniteQuery
  myGames: () => ['my-games'] as const,
  myGamesByPlatform: (platform?: string) => ['my-games', platform ?? 'all'] as const,
  myGameAchievements: (gameId: string | null) => ['my-game-achievements', gameId] as const,

  syncSummary: (userId: string) => ['sync-summary', userId] as const,
  syncSummaryBase: () => ['sync-summary'] as const,

  rankings: () => ['rankings'] as const,
  rankingsGlobal: (page: number, limit: number) => ['rankings', 'global', page, limit] as const,
  rankingsPlatform: (platform: string, page: number, limit: number) =>
    ['rankings', 'platform', platform, page, limit] as const,
  myRanking: (platform?: string) =>
    platform ? (['rankings', 'me', platform] as const) : (['rankings', 'me'] as const),

  userStats: () => ['user-stats'] as const,

  profile: () => ['profile'] as const,
  publicProfile: (username: string) => ['profile', username] as const,

  compareProfiles: (username: string) => ['compare', username] as const,

  search: (query: string, filter: string) => ['search', query, filter] as const,
  searchAchievements: (query: string, filter: string) =>
    ['search-achievements', query, filter] as const,

  game: (gameId: string | null) => ['game', gameId] as const,

  challengeActive: () => ['challenge', 'active'] as const,
  challengeMe: () => ['challenge', 'me'] as const,

  wrapped: (period: string) => ['wrapped', period] as const,

  publicFeed: () => ['public-feed'] as const,

  userGames: (username: string) => ['user-games', username] as const,
  userGameAchievements: (username: string, gameId: string) =>
    ['user-game-achievements', username, gameId] as const,
} as const;
