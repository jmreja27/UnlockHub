-- Índices en User para queries frecuentes del scheduler de background sync y del dashboard admin.
-- createdAt: admin.service filtra por rango de fechas (registeredToday, registeredThisWeek).
-- isPremium: admin.service cuenta usuarios premium activos.
-- lastSyncAt: background-sync.scheduler filtra usuarios con lastSyncAt <= 24h atrás.

CREATE INDEX IF NOT EXISTS "User_createdAt_idx" ON "User"("createdAt");
CREATE INDEX IF NOT EXISTS "User_isPremium_idx" ON "User"("isPremium");
CREATE INDEX IF NOT EXISTS "User_lastSyncAt_idx" ON "User"("lastSyncAt");
