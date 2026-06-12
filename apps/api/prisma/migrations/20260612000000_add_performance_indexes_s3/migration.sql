-- ############################################################################
-- Migración generada en auditoría S3 — NO aplicada en producción todavía.
-- Revisar con el desarrollador antes de ejecutar (ver AUDIT.md A33-A36).
-- ############################################################################

-- A33: UserAchievement(userId, unlockedAt)
-- Acelera las queries de wrapped y stats que filtran por usuario + rango de fecha.
-- Actualmente solo existe @@index([userId]) — el filtro de fecha ocurre en memoria.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "UserAchievement_userId_unlockedAt_idx"
    ON "UserAchievement" ("userId", "unlockedAt");

-- A34: ActivityEvent(userId, type, createdAt)
-- Acelera la query de wrapped que busca STREAK_MILESTONE para un usuario en un año/mes.
-- Actualmente existen índices separados en userId, type, createdAt.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ActivityEvent_userId_type_createdAt_idx"
    ON "ActivityEvent" ("userId", "type", "createdAt");

-- A35: Friendship(senderId, status) y (receiverId, status)
-- Acelera findAcceptedFriendIds y findAcceptedFriends — query en caliente en el feed.
-- Actualmente existen índices separados en senderId, receiverId, status.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Friendship_senderId_status_idx"
    ON "Friendship" ("senderId", "status");

CREATE INDEX CONCURRENTLY IF NOT EXISTS "Friendship_receiverId_status_idx"
    ON "Friendship" ("receiverId", "status");

-- A36: User(profileVisibility, deletedAt)
-- Acelera seedRankingsFromDb y background-sync scheduler que filtran PUBLIC + deletedAt IS NULL.
-- Actualmente solo existe @@index([deletedAt]).
CREATE INDEX CONCURRENTLY IF NOT EXISTS "User_profileVisibility_deletedAt_idx"
    ON "User" ("profileVisibility", "deletedAt");
