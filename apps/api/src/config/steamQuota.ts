/** Límite diario de llamadas a la Steam Web API por clave. */
export const STEAM_DAILY_LIMIT = 100_000;

/** Umbral al que el background-sync scheduler detiene el batch nocturno. */
export const STEAM_BACKGROUND_SYNC_THRESHOLD = 0.8;

/** Umbral al que se rechazan o omiten los syncs manuales de Steam. */
export const STEAM_MANUAL_SYNC_THRESHOLD = 0.9;

/**
 * Máximo de juegos Steam a procesar en un solo intento de sync completo (syncUser / syncUserBatched).
 * Los juegos se priorizan por actividad reciente (rtime_last_played desc, playtime_forever como desempate).
 * Los juegos omitidos se recogerán en el siguiente sync nocturno o manual.
 * Ajustable tras observar el volumen real de biblioteca de usuarios en producción.
 * Implementación mínima de T90 (sin cursor de reanudación — diferido a Fase 4).
 */
export const STEAM_MAX_GAMES_PER_SYNC = 100;
