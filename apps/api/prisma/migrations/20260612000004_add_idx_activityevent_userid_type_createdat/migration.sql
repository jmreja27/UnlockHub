-- A34: ActivityEvent(userId, type, createdAt)
-- Acelera la query de wrapped que busca STREAK_MILESTONE para un usuario en un año/mes.
-- APLICADO MANUALMENTE con CONCURRENTLY fuera de transacción;
-- registrado via `prisma migrate resolve --applied` (no via migrate deploy).
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ActivityEvent_userId_type_createdAt_idx"
    ON "ActivityEvent" ("userId", "type", "createdAt");
