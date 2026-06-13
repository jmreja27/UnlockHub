-- A33: UserAchievement(userId, unlockedAt)
-- Acelera las queries de wrapped y stats que filtran por usuario + rango de fecha.
-- Tabla de mayor volumen — se deja para el final del proceso manual.
-- APLICADO MANUALMENTE con CONCURRENTLY fuera de transacción;
-- registrado via `prisma migrate resolve --applied` (no via migrate deploy).
CREATE INDEX CONCURRENTLY IF NOT EXISTS "UserAchievement_userId_unlockedAt_idx"
    ON "UserAchievement" ("userId", "unlockedAt");
