-- A35b: Friendship(receiverId, status)
-- Acelera findAcceptedFriendIds y findAcceptedFriends — query en caliente en el feed.
-- APLICADO MANUALMENTE con CONCURRENTLY fuera de transacción;
-- registrado via `prisma migrate resolve --applied` (no via migrate deploy).
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Friendship_receiverId_status_idx"
    ON "Friendship" ("receiverId", "status");
