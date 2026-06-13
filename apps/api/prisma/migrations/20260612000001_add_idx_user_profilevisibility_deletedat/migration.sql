-- A36: User(profileVisibility, deletedAt)
-- Acelera seedRankingsFromDb y background-sync scheduler que filtran
-- profileVisibility = PUBLIC AND deletedAt IS NULL.
-- APLICADO MANUALMENTE con CONCURRENTLY fuera de transacción;
-- registrado via `prisma migrate resolve --applied` (no via migrate deploy).
CREATE INDEX CONCURRENTLY IF NOT EXISTS "User_profileVisibility_deletedAt_idx"
    ON "User" ("profileVisibility", "deletedAt");
