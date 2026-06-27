# AUDIT.md — UnlockHub

**Fecha de inicio**: 2026-06-11  
**Alcance**: `apps/api`, `apps/worker`, `apps/mobile`, `packages/`  
**Rama base**: `develop` — commit `ea20280`

## Leyenda de severidad

| Símbolo | Nivel | Criterio |
|---|---|---|
| 🔴 | Crítico | Explotable hoy con consecuencias graves (RCE, pérdida de datos, escalada de privilegios) |
| 🟠 | Alto | Explotable con algo de trabajo o impacto limitado; bloquea una release de seguridad |
| 🟡 | Medio | Riesgo real pero requiere condiciones específicas o tiene impacto acotado |
| 🔵 | Bajo | Deuda técnica, calidad o hardening; bajo riesgo operativo inmediato |

---

## Tabla de hallazgos

| ID | Área | Sev | Descripción | Archivo(s) | Estado | Sesión |
|---|---|---|---|---|---|---|
| A1 | Seguridad API | 🟠 | CVE `ws` GHSA-58qx-3vcg-4xpx — uninitialized memory disclosure. `engine.io` 6.6.7→6.6.8, `socket.io-adapter` 2.5.6→2.5.7, `ws` (ambas instancias runtime) 8.x→8.20.1. 611 tests en verde post-fix. | `engine.io`, `socket.io-adapter` (transitivas) | ✅ S1 | S1 |
| A2 | Seguridad API | 🟠 | CVE `tar` (5 CVEs HIGH + nueva CVE-2026-23745/GHSA-8qq5-rm4j-mr97 sobrescritura+symlink, fix en tar 7.5.3) — transitiva de `@mapbox/node-pre-gyp@1.0.11` (vía `bcrypt@5.1.1`). Override imposible sin `--force` (salto major). Riesgo aceptado en S6a — solo durante `npm install`. **CERRADO en lote S8 vía A53**: `bcrypt@5.1.1 → 6.0.0` elimina `@mapbox/node-pre-gyp` + `tar` por completo. `npm ls tar` → vacío post-upgrade. | `tar` (transitiva de `@mapbox/node-pre-gyp`) | ✅ Cerrado S8 — ver A53 | S6a / S8 |
| A3 | Seguridad API | 🟡 | `webhooks.controller.ts:46` — comparación `token !== secret` no constant-time. **Arreglado**: `crypto.timingSafeEqual()` sobre hashes SHA-256 de ambos strings (longitud fija, sin filtrar longitud del secret). Tests: prefijo-corto y sufijo-largo añadidos. | `apps/api/src/controllers/webhooks.controller.ts:46` | ✅ S1 | S1 |
| A4 | Seguridad API | 🟡 | `authenticate` middleware `.catch()` (línea 56): error de BD silenciado → request autorizada con datos del JWT sin comprobar soft-delete GDPR. **Verificado S2**: el `.catch()` es exclusivo de errores de BD — los tokens corruptos/expirados son rechazados en el `try/catch` anterior (líneas 34-39) con 401 incondicional. El bypass documentado es únicamente el check de soft-delete durante outage de BD — trade-off deliberado, mitigado por `deletedAt: null` en todos los services (A14–A19). | `apps/api/src/middleware/authenticate.ts:34-64` | ✅ Descartado — token inválido/expirado SIEMPRE → 401 S2 | S1 |
| A5 | Seguridad API | 🟡 | Upload: validación de MIME solo por `Content-Type` declarado. **Arreglado**: `validateFileMagicBytes` middleware con magic bytes manuales (JPEG `FF D8 FF`, PNG `89 50 4E 47...`, WebP RIFF/WEBP). Se ejecuta tras multer cuando el buffer está disponible. Sin deps externas nuevas. 6 tests añadidos. | `apps/api/src/middleware/upload.middleware.ts` | ✅ S1 | S1 |
| A6 | Seguridad API | 🟡 | `getMyRankHandler`: `req.query['platform']` sin validar Zod → strings arbitrarios podían llegar a Redis. **Arreglado**: `platformSchema.parse()` + test de plataforma inválida → 400. | `apps/api/src/controllers/ranking.controller.ts:33` | ✅ S1 | S1 |
| A7 | Calidad / ESLint | 🟡 | `no-floating-promises`/`no-misused-promises` no activos. **Arreglado**: `apps/api/.eslintrc.js` + `tsconfig.eslint.json` (incluye tests). Un floating promise real encontrado: `io.close()` (devuelve `Promise<void>` en socket.io 4.8.3) → convertido a `await io.close()` en SIGTERM handler (bug de shutdown: Redis/Prisma se desconectaban antes de que Socket.io cerrase). | `apps/api/src/index.ts:24` | ✅ S1 | S1 |
| A8 | Dependencias | 🟡 | 23 vulnerabilidades moderate resueltas con `npm audit fix` junto con A1. `express` 4.22.1→4.22.2 (fix `qs`), `brace-expansion` 5.0.5→5.0.6. | `package-lock.json` | ✅ S1 | S1 |
| A9 | Móvil / ESLint | 🔵 | `security/detect-unsafe-regex` sobre `/^\d{4}(-\d{2})?$/` en `useWrapped.ts:15` — falso positivo (sin backtracking exponencial). `// eslint-disable-next-line security/detect-unsafe-regex` añadido con comentario justificativo. | `apps/mobile/hooks/useWrapped.ts:15` | ✅ S6b | S6b |
| A10 | Limpieza | 🔵 | 4 `console.log` de debug eliminados en `useRewardedAd.ts` — fuera del critical path del rewarded ad. **Adelantado desde S6.** `console.error` en `api.ts:onerror` y `profile.tsx:bannerMutation.onError` eliminados en S5. **Completado S5**: 0 `console.log/error` en `apps/mobile` en producción. | `apps/mobile/hooks/useRewardedAd.ts`, `apps/mobile/lib/api.ts`, `apps/mobile/app/(tabs)/profile.tsx` | ✅ S5 completo | S4 |
| A11 | Dependencias | 🔵 | `@unlockhub/validators` dead dep en mobile. ✅ Eliminada en S0. | `apps/mobile/package.json` | ✅ | S0 |
| A12 | Dependencias | 🔵 | `pino-pretty` falso positivo en depcheck — sí se usa en `logger.ts` vía referencia dinámica en `target`. **Arreglado**: `apps/api/.depcheckrc` creado con `ignores: [pino-pretty]`. | `apps/api/src/lib/logger.ts` | ✅ S6b | S6b |
| A13 | Dependencias | 🔵 | `apps/worker` deps "unused" en depcheck — falso positivo, importa desde workspace `@unlockhub/api`. depcheck no resuelve workspace imports correctamente. **Arreglado**: `apps/worker/.depcheckrc` creado con ignores de las 6 deps afectadas + nota explicativa. | `apps/worker/package.json` | ✅ S6b | S6b |
| A14 | GDPR / AuthZ | 🟡 | `subscription.service.ts` (5 funciones): `prisma.user.findUnique({ where: { id: userId } })` sin `deletedAt: null`. Usuario soft-deleted con JWT válido + DB error en authenticate podría activar/cancelar subscripciones. **Arreglado**: `deletedAt: null` en las 5 queries. | `apps/api/src/services/subscription.service.ts:34,84,126,171,258` | ✅ S1 | S1 |
| A15 | GDPR / Rankings | 🟡 | `seedRankingsFromDb()`: `findMany` sin `deletedAt: null` → usuarios eliminados podrían reconstituirse en Redis rankings tras disaster recovery. **Arreglado**: `deletedAt: null` añadido. | `apps/api/src/services/ranking.service.ts:163` | ✅ S1 | S1 |
| A16 | GDPR / Puntos | 🟡 | `awardPoints()`: `findUnique` sin `deletedAt: null`. **Arreglado**: defense-in-depth para ruta webhook. | `apps/api/src/services/points.service.ts:24` | ✅ S1 | S1 |
| A17 | GDPR / Wrapped | 🟡 | `getWrapped()` y `getMonthlyWrapped()`: `findUnique` sin `deletedAt: null`. **Arreglado**. | `apps/api/src/services/wrapped.service.ts:256,313` | ✅ S1 | S1 |
| A18 | GDPR / Stats | 🟡 | `getMyStats()`: `findUnique` sin `deletedAt: null`. **Arreglado**. | `apps/api/src/services/stats.service.ts:54` | ✅ S1 | S1 |
| A19 | GDPR / Profile | 🟡 | `getProfile()` (endpoint `/me`): `findUnique` sin `deletedAt: null` — usuario soft-deleted podría recibir su propio perfil durante DB outage en auth. **Arreglado**. | `apps/api/src/services/user.service.ts:149` | ✅ S1 | S1 |
| A20 | Seguridad API | 🟡 | `forgotPassword`: diferencia de latencia según email exista o no (user enumeration timing). Mitigado por `authRateLimiter` (10 req/15min). **Propuesta**: min-delay de 500ms constante en todos los casos para normalizar tiempo de respuesta. **Descartado**: latencia constante añade fricción real a todos los usuarios; el authRateLimiter (10 req/15min) hace el timing attack no explotable en la práctica. | `apps/api/src/services/auth.service.ts:106` | ✅ Descartado — mitigado por authRateLimiter | S1 |
| A21 | Rate limiting | 🔵 | `POST /sync/:platform` solo tiene `globalRateLimiter` (500/15min por IP). **Verificado S2**: el cooldown Redis SET NX es la PRIMERA operación en `triggerManualSync` (línea 59), antes de cualquier query a BD. La protección existente (cooldown + contador diario) es suficiente para este endpoint. | `apps/api/src/services/sync.service.ts:59` | ✅ Descartado — cooldown es el primer check S2 | S1 |
| A22 | Sync / Lógica | 🔵 | `triggerExpressSync()`: si el lock Redis no se adquiere (otro sync en curso), el express sync se descartaba silenciosamente sin encolar full sync. **Arreglado**: cuando el lock falla, se llama `queueInitialSync()` como fallback (UX: usuario que vincula 2 plataformas en <25s ya no pierde el sync de la segunda hasta el nocturno). Lock disponible → express sync normal, `queueInitialSync` NO se llama internamente (evita doble encolado). 2 tests añadidos en `sync.worker.test.ts`. | `apps/api/src/services/sync.service.ts:333` | ✅ S6b | S6b |
| A23 | Sync / Steam | 🟡 | 4 métodos internos del `SteamAdapter` (`fetchOwnedGames`, `fetchPlayerAchievements`, `fetchGameSchema`, `fetchRarityMap`) carecían de timeout en sus llamadas axios. Un cuelgue de Steam API mantendría un slot del worker BullMQ bloqueado hasta `lockDuration` (5 min), impidiendo que otros usuarios sincronicen. **Arreglado**: `timeout: 10_000` añadido en las 6 llamadas internas (incluido `fetchSteamAchievementDefinitions`). | `apps/api/src/platforms/steam.adapter.ts` | ✅ S2 | S2 |
| A24 | Sync / Steam | 🟡 | `steam:api:calls:<date>` — el contador de llamadas a la API de Steam se lee en `background-sync.scheduler.ts` y en `admin.service.ts` para aplicar el umbral del 80% (pausa de background sync) y mostrarlo en el dashboard, pero **nunca se incrementaba** en ningún adapter. La protección documentada en CLAUDE.md como "✅ Activo" estaba completamente inactiva. **Arreglado**: `incrementSteamApiCounter()` llamado en cada fetcher real de Steam (6 puntos de llamada), con TTL de 48h sobre la clave diaria. Los tests de Steam adapter actualizados con mock de `redis.incr` y `redis.expire`. **⚙️ Pendiente calibración**: (1) El umbral del 90% mencionado en CLAUDE.md no existe en el código — solo hay el check al 80% en `background-sync.scheduler.ts`; homogeneizar o eliminar referencia. (2) Verificar en producción que el volumen real de usuarios × juegos × ~4 llamadas/juego no alcanza los 80.000 en un día antes de poder añadir usuarios premium con sync cada 15 min. (3) TTL 48h es conservador — la clave es fecha-específica (`steam:api:calls:YYYY-MM-DD`), por lo que 25h sería suficiente; el exceso de 48h no causa doble cómputo pero sí acumula claves más tiempo. | `apps/api/src/platforms/steam.adapter.ts` | ✅ S2 | S2 |
| A25 | Sync / Xbox | 🔵 | Todas las llamadas axios internas del `XboxAdapter` (`exchangeCodeForMsTokens`, `refreshMsAccessToken`, `getMsToXblToken`, `getXblToXstsToken`, `fetchGamertag`, loop de `fetchXboxAchievements`) carecían de timeout. Además, el bucle de paginación de `fetchXboxAchievements` no tenía límite de páginas (PSN tiene `MAX_PAGES=10`). Xbox está gateado hasta Fase 4, pero la corrección es trivial. **Arreglado**: `timeout: 15_000` en token exchanges, `timeout: 10_000` en resto; `XBOX_MAX_PAGES = 20` en el bucle de paginación. | `apps/api/src/platforms/xbox.adapter.ts` | ✅ S2 | S2 |
| A26 | Sync / PSN | 🔵 | `fetchMergedTrophies`: `earnedRes.trophies` y `titleTrophiesRes.trophies` se iteraban sin guard `?? []`. Si PSN devuelve respuesta malformada en runtime (las propiedades están tipadas pero la API externa puede diferir), se lanza `TypeError` que silencia el título en `Promise.allSettled` sin logging. **Arreglado**: `(earnedRes.trophies ?? [])` y `(titleTrophiesRes.trophies ?? []).map(...)` para robustez ante respuestas inesperadas. | `apps/api/src/platforms/psn.adapter.ts:558-562` | ✅ S2 | S2 |
| A27 | Sync / PSN | 🔵 | Llamadas a `psn-api` (`getUserTitles`, `getTitleTrophies`, `getUserTrophiesEarnedForTitle`) no tienen control de timeout — la librería usa `node-fetch` internamente. Un cuelgue de PSN API mantendría el slot del worker hasta `lockDuration`. **Propuesta implementación S6a**: envolver cada llamada en un helper `withTimeout(promise, ms)` basado en `AbortController` (no bare `Promise.race`). Con `Promise.race` la promesa perdedora sigue corriendo silenciada — con `AbortController` se cancela el `fetch` subyacente y se libera el socket. El error de timeout debe re-lanzarse (no tragarse) para que `Promise.allSettled` lo registre como `reason` y el título quede marcado como fallo puntual, no como silencio. TTL recomendado: 30s por llamada de títulos, 20s por llamada de trofeos individuales. | `apps/api/src/platforms/psn.adapter.ts` | 🔲 S6a | S2 |
| A28 | Perf / N+1 | 🟡 | `upsertUserScore` llamaba `getPlatformXp(userId, platform)` una vez por cada plataforma (4 queries para un usuario con Steam+RA+PSN+Xbox). **Arreglado**: reemplazado por `getPlatformXpMap` — una sola query que carga todos los logros del usuario para las plataformas dadas y agrupa en memoria. Reduce 4 queries → 1 en cada actualización de ranking (tras sync, tras addXp, al cambiar visibilidad). También beneficia `seedRankingsFromDb`. | `apps/api/src/services/ranking.service.ts:20-63` | ✅ S3 | S3 |
| A29 | Perf / Select | 🔵 | `getUserGameAchievements` hacía `prisma.achievement.findMany` sin `select` — cargaba todos los campos del modelo incluidos `rawValue`, `createdAt`, `updatedAt` que no se usan en la respuesta. Para un juego con 1.000 logros (RA/Steam) esto es ~150 KB de datos extra por request antes de cachear. **Arreglado**: `select` explícito con los 9 campos requeridos por `AchievementWithCompareStatus`. | `apps/api/src/services/user.service.ts:864` | ✅ S3 | S3 |
| A30 | Perf / Redis | 🔵 | `USER_GAMES_KEYS_SET` (set de tracking de claves de caché por usuario) no tenía TTL. Los entries individuales expiran en 5 min pero el set de tracking permanece indefinidamente acumulando claves muertas. Cada `smembers` en `invalidateUserPublicCache` retorna todas las claves incluyendo ya-expiradas (las operaciones `del` sobre claves inexistentes son no-ops, sin rotura funcional). **Arreglado**: `redis.expire(USER_GAMES_KEYS_SET, TTL × 4)` tras cada `sadd`. El TTL se rota en cada escritura, equivalente a un sliding-window de 20 min. | `apps/api/src/services/user.service.ts:797,923` | ✅ S3 | S3 |
| A31 | Perf / GDPR | 🔵 | `deleteAccount` limpiaba los sorted sets de Redis (`removeUserFromRankings`) pero no la caché pública de juegos/logros del usuario (`USER_GAMES_KEYS_SET` + claves `user-games:*`). Tras un borrado de cuenta, el set de tracking persistía indefinidamente. Funcionalmente inofensivo (getPublicProfile lanzaría USER_NOT_FOUND antes de servir la caché) pero dejaba basura en Redis. **Arreglado**: `invalidateUserPublicCache(userId)` ejecutado en paralelo con `removeUserFromRankings` al borrar la cuenta. | `apps/api/src/services/user.service.ts:710` | ✅ S3 | S3 |
| A32 | Perf / Select | 🔵 | `getProfile` y `getPublicProfile` usaban `include` sin `select` en el modelo `User` — cargaban todos los campos incluyendo `passwordHash`, `birthDate`, `streakShields`, `role`, `deletedAt`, `updatedAt` (6 campos no usados por los mappers). TypeScript garantiza que los campos seleccionados satisfacen los tipos de `mapUser`/`mapPublicUser`. **Arreglado**: cambiado a `select` explícito con los 15/11 campos requeridos respectivamente. La relación `platformAccounts` ya tenía `select` propio y se mantiene igual. | `apps/api/src/services/user.service.ts:149,191` | ✅ S3 | S3 |
| A33 | Perf / Índice | 🟡 | `UserAchievement` carece de índice compuesto `(userId, unlockedAt)`. Las queries de `getWrapped`/`getMonthlyWrapped` en `wrapped.service.ts` filtran `{ userId, unlockedAt: { gte: start, lte: end } }` — PostgreSQL usa el índice simple `userId` y luego filtra por fecha en memoria. Para usuarios con 10.000+ logros y queries de periodo acotado (1 mes), un índice compuesto permite al planner aplicar ambos filtros en el índice. Impacto estimado: reducción de 30-60% en latencia de wrapped para usuarios con bibliotecas grandes. | `apps/api/prisma/schema.prisma:UserAchievement` | ✅ Aplicado en producción (2026-06-12) — `CREATE INDEX CONCURRENTLY` manual + `migrate resolve --applied`. `indisvalid=true` verificado. Ver INC-01 | S3 |
| A34 | Perf / Índice | 🟡 | `ActivityEvent` carece de índice compuesto `(userId, type, createdAt)`. `wrapped.service.ts` y potencialmente futuras queries de admin filtran `{ userId, type: 'STREAK_MILESTONE', createdAt: { gte: start, lte: end } }`. Actualmente hay índices separados en `userId`, `type`, `createdAt`. PostgreSQL puede usar bitmap scan pero un índice compuesto es más eficiente para este patrón concreto. | `apps/api/prisma/schema.prisma:ActivityEvent` | ✅ Aplicado en producción (2026-06-12) — `CREATE INDEX CONCURRENTLY` manual + `migrate resolve --applied`. `indisvalid=true` verificado. Ver INC-01 | S3 |
| A35 | Perf / Índice | 🟡 | `Friendship` carece de índices compuestos `(senderId, status)` y `(receiverId, status)`. `findAcceptedFriendIds` (hot-path del feed) y `findAcceptedFriends` (lista de amigos) siempre filtran por `(senderId|receiverId, status: ACCEPTED)`. Actualmente PostgreSQL necesita un bitmap index scan sobre los índices separados. Los índices compuestos permiten index-only scans en esta query frecuente. | `apps/api/prisma/schema.prisma:Friendship` | ✅ Aplicado en producción (2026-06-12) — `CREATE INDEX CONCURRENTLY` manual × 2 + `migrate resolve --applied`. `indisvalid=true` verificado. Ver INC-01 | S3 |
| A36 | Perf / Índice | 🔵 | `User` carece de índice compuesto `(profileVisibility, deletedAt)`. `seedRankingsFromDb` y `background-sync.scheduler.ts` filtran `{ profileVisibility: 'PUBLIC', deletedAt: null }`. Actualmente solo hay `@@index([deletedAt])`. El índice compuesto es especialmente útil para `background-sync` que se ejecuta diariamente sobre todos los usuarios activos. | `apps/api/prisma/schema.prisma:User` | ✅ Aplicado en producción (2026-06-12) — `CREATE INDEX CONCURRENTLY` manual + `migrate resolve --applied`. `indisvalid=true` verificado. Ver INC-01 | S3 |
| A37 | Perf / Paginación | 🟡 | `getPublicFeed` usaba offset pagination con `prisma.activityEvent.count()` sin filtro. A medida que la tabla crece (millones de eventos), el `count()` sin WHERE degrada y el `skip` alto fuerza escaneos costosos. El feed de amigos (`getFriendsFeed`) ya usa cursor-based correctamente. **Migrado a cursor-based**: `getPublicFeed(limit, cursor?)` devuelve `CursorPaginatedResponse<ActivityEvent>` idéntico a `getFriendsFeed` — sin `count()`, sin `skip`, filtro `id: { lt: cursor }`, `nextCursor` en la respuesta. Controller usa `feedQuerySchema` (ya existente) en lugar de `paginationSchema`. Mobile: `hooks/usePublicFeed.ts` + `queryKeys.publicFeed()`. **Decisión de compatibilidad — cutover limpio**: `GET /api/v1/activity/public` no tenía consumidor activo en mobile (confirmado con grep), por lo que no existe riesgo de skew API/APK. Orden de despliegue: API→mobile (Railway autodeploy desde develop). 4 tests API nuevos (`cursor`, `nextCursor null`, `no count()`, `no filtro sin cursor`) + 1 test controller actualizado. 5 tests mobile nuevos (`primera página`, `acumulación fetchNextPage`, `parada nextCursor null`, `cursor en URL`, `isError`). **Nota barrido S6b**: `usePublicFeed` no tiene consumidor en ninguna pantalla — hook huérfano pendiente de implementar la pantalla o eliminar si se descarta la feature. | `apps/api/src/services/activity.service.ts`, `apps/api/src/controllers/activity.controller.ts`, `apps/mobile/hooks/usePublicFeed.ts` | ✅ S6b | S6b |
| A38 | Perf / Payload | 🔵 | `getUserGameAchievements` (y su versión cacheada) devuelve un payload sin paginación. Para juegos con 1.000+ logros (Steam juegos difíciles, RA), la respuesta pre-cache puede superar 500 KB de JSON. El resultado se cachea en Redis, por lo que solo el primer request es caro. La paginación implicaría un cambio de API y pérdida de la lógica de comparación isUnlockedByMe cross-page. **Diferido a Fase 4**: solo pagar si hay evidencia de problemas en producción real. | `apps/api/src/services/user.service.ts:825` | 🔲 Fase 4 — diferido (cambio de API, sin evidencia aún) | S3 |
| A39 | Perf / Select | 🔵 | `loadUserAchievements` en `wrapped.service.ts` usaba `include: { achievement: { include: { game: true } } }` cargando 6 campos no usados de `Achievement` (externalId, description, rawValue, externalUrl, createdAt, updatedAt) e ídem de `Game`. **Arreglado**: migrado a `select` explícito con los 5 campos de achievement (`title`, `iconUrl`, `rarity`, `normalizedPoints`, `platform`) y 4 de game (`id`, `title`, `iconUrl`, `platform`). Tipo `UserAchievementFull` actualizado con `Prisma.UserAchievementGetPayload<{ select: {...} }>`. 24 tests wrapped sin cambios. | `apps/api/src/services/wrapped.service.ts:7,30` | ✅ S6b | S6b |
| A40 | Perf / Redis | 🔵 | `sendAll` en `notification.service.ts` hace `prisma.deviceToken.findMany` sin límite — carga todos los tokens de todos los usuarios en memoria. Con 100k usuarios podría superar 10 MB. `sendAll` no tiene ninguna llamada activa en el código — es función de broadcast futura. **Diferido a Fase 4**: sin llamadas activas, no hay riesgo operativo inmediato; paginar cuando se implemente el primer broadcast real. | `apps/api/src/services/notification.service.ts:104` | 🔲 Fase 4 — diferido (0 llamadas activas; paginación al implementar broadcast) | S3 |
| A41 | Docs / Steam | 🔵 | `CLAUDE.md` documentaba dos umbrales para `steam:api:calls`: 80 % (pausa background-sync) y 90 % (pausa manual sync). El 90 % no existía en código. **Arreglado**: `apps/api/src/config/steamQuota.ts` centraliza ambas constantes. `background-sync.scheduler.ts` migrado a importarlas. `triggerManualSync` comprueba ≥ 90 % antes de encolar: multi-plataforma → `skippedByQuota: true` 200 (libera cooldown); solo Steam → `STEAM_QUOTA_EXCEEDED` 429 (libera cooldown). Mobile `useSyncAll` expone `steamQuotaState: 'exceeded'\|'skipped'\|null`; `SyncStatusBar` muestra aviso no bloqueante. 5 tests nuevos (3 API + 2 mobile). | `apps/api/src/config/steamQuota.ts`, `apps/api/src/services/sync.service.ts`, `apps/api/src/controllers/sync.controller.ts`, `apps/mobile/hooks/useSyncAll.ts`, `apps/mobile/components/SyncStatusBar.tsx` | ✅ S6a | S6a |
| A42 | Móvil / Fluidez | 🟡 | `SyncStatusBar` instanciaba `useSyncProgress()` de forma independiente cuando ya está renderizado dentro de `LibraryScreen`, que también instancia el mismo hook. Resultado: dos sets simultáneos de listeners Socket.io (`sync:progress`, `sync:complete`, `sync:error`) + dos timers de gracia + dos intervals de polling fallback cuando el socket está silencioso. Las invalidaciones de caché se duplicaban pero TanStack Query las deduplicaba. **Arreglado**: `useSyncProgress` eliminado de `SyncStatusBar`; el hook acepta ahora `isRunning: boolean` como prop; `LibraryScreen` pasa el valor que ya tenía. Tests actualizados. | `apps/mobile/components/SyncStatusBar.tsx`, `apps/mobile/app/(tabs)/index.tsx` | ✅ S4 | S4 |
| A43 | Móvil / Zustand | 🔵 | 5 hooks usaban `useSessionStore()` sin selector (`useInterstitialAd`, `useRewardedAd`, `useCompletedGamesInterstitial`, `useWrappedInterstitial`, `useMyGames`). Sin selector, Zustand re-renderiza el componente en cada cambio de cualquier campo del store. El store solo tiene 3 campos (`user`, `accessToken`, `isAuthenticated`), pero `user` se actualiza después de cada sync (XP/nivel) causando re-renders innecesarios en los hooks de AdMob. **Arreglado**: selectores precisos (`(s) => s.user?.isPremium ?? false` o `(s) => s.isAuthenticated`) en los 5 hooks. | `apps/mobile/hooks/useInterstitialAd.ts`, `useRewardedAd.ts`, `useCompletedGamesInterstitial.ts`, `useWrappedInterstitial.ts`, `useMyGames.ts` | ✅ S4 | S4 |
| A44 | Móvil / Cloudinary | 🔵 | Avatares y banners se servían desde Cloudinary a resolución original. **Arreglado**: `lib/cloudinary.ts` — `getCloudinaryThumb(url, w, h)` inyecta `w_N,h_N,c_fill,q_auto,f_auto` en `/upload/`. Aplicado en 5 puntos: `profile.tsx` (avatar 192×192, banner 800×240), `profile/[username].tsx` (avatar 160×160, banner 800×240), `UserCard.tsx` (avatar 96×96), `RankingItem.tsx` (avatar 80×80), `ActivityCard.tsx` (avatar 88×88). URLs no-Cloudinary devueltas intactas. 6 tests unitarios añadidos en `__tests__/lib/cloudinary.test.ts`. | `apps/mobile/lib/cloudinary.ts`, `components/UserCard.tsx`, `components/RankingItem.tsx`, `components/ActivityCard.tsx`, `app/(tabs)/profile.tsx`, `app/profile/[username].tsx` | ✅ S5 | S4 |
| A45 | Móvil / Calidad | 🔵 | `useSyncStatus` configuraba `refetchInterval: 60_000` siempre activo para cualquier usuario autenticado. **Arreglado**: `refetchInterval: (q) => q.state.data?.isRunning ? 2_000 : false` — apaga el polling cuando no hay sync activo (`false`), activa a 2 s cuando sí hay. `isRunning` ya lo devolvía el backend en `/api/v1/sync/my-summary`; solo faltaba añadirlo a la interfaz. 2 tests nuevos que verifican el comportamiento de la función. | `apps/mobile/hooks/useSyncStatus.ts` | ✅ S5 | S4 |
| A46 | Móvil / Sentry | 🟡 | `Sentry.init` no tenía `beforeSend` — cualquier error con datos sensibles en el request (Authorization header, body de login/refresh) se enviaba a Sentry sin filtrar. **Arreglado**: `beforeSend` añadido en `_layout.tsx`: (1) elimina `Authorization`/`authorization` de `event.request.headers`; (2) reemplaza el body por `[redacted]` en rutas de autenticación (`/auth/login`, `/auth/register`, `/auth/reset-password`, `/auth/refresh`). **Verificación pendiente**: confirmar que `beforeSend` cubre también `event.request.url`, query strings y breadcrumbs, no solo el header — si la URL incluye tokens como query param o los breadcrumbs capturan body de las peticiones, la redacción actual es incompleta. | `apps/mobile/app/_layout.tsx` | ✅ S5 | S5 |
| A47 | Móvil / Tokens | 🔵 | Análisis de almacenamiento de credenciales. **Sin hallazgo de seguridad**: refresh token almacenado en `expo-secure-store` (SecureStore/Keychain según plataforma) ✅. Access token solo en memoria Zustand (no persistido) ✅. AsyncStorage solo se usa para preferencias no sensibles (tema, idioma, timestamps de AdMob). No hay PII ni tokens en AsyncStorage. | `apps/mobile/lib/api.ts`, `apps/mobile/stores/sessionStore.ts` | ✅ Informacional — sin acción necesaria | S5 |
| A48 | Móvil / Auth | 🟡 | Cuando el refresh token expiraba (backend devolvía 401 en `/auth/refresh`), `refreshAccessToken()` lanzaba el error pero no limpiaba la sesión. Resultado: el usuario quedaba "logueado" (Zustand `isAuthenticated: true`) pero sin tokens válidos — todas las queries fallaban con error, sin redirección al login. **Arreglado**: `refreshAccessToken()` detecta `response.status === 401` → llama `deleteRefreshToken()` + `clearSession()` antes de lanzar el error. El guard de tabs layout (`if (!isAuthenticated) → Redirect login`) gestiona la redirección automáticamente. | `apps/mobile/lib/api.ts:refreshAccessToken` | ✅ S5 | S5 |
| A49 | Móvil / GDPR | 🟡 | UMP consent (`useGdprConsent`) y session restore (`SessionRestorer`) corren en paralelo al arrancar la app. Si session restore completa antes de que el formulario UMP sea mostrado/cerrado, el usuario llega a los tabs con AdBanner cargando antes de que el consentimiento esté resuelto. El Google SDK aplica la preferencia de consent al hacer la request real de anuncio, lo que mitiga el impacto; pero la práctica correcta es no renderizar `AdBanner` hasta que el consent esté resuelto. **Arreglado**: `consentResolved: boolean` (inicial `false`) añadido a `preferencesStore` con `setConsentResolved` (sin persistir en AsyncStorage — se resuelve en cada arranque). `useGdprConsent` llama `setConsentResolved(true)` en el bloque `finally` de `requestConsent()` (cubre `status !== REQUIRED` y `status === REQUIRED` tras cerrar el formulario) y en el early return cuando el módulo nativo no está disponible. `AdBanner` gatea su render con `if (!consentResolved) return null` antes de servir el anuncio. 5 tests añadidos: 2 en `AdBanner.test.tsx` (`consentResolved=false` → null, `consentResolved=true` → renderiza) + 3 en `useGdprConsent.test.ts` (NOT_REQUIRED, REQUIRED y error → `setConsentResolved(true)` en todos los casos). | `apps/mobile/stores/preferencesStore.ts`, `apps/mobile/hooks/useGdprConsent.ts`, `apps/mobile/components/AdBanner.tsx`, `apps/mobile/__tests__/components/AdBanner.test.tsx`, `apps/mobile/__tests__/hooks/useGdprConsent.test.ts` | ✅ S6a | S5 |
| A50 | Móvil / Deep Links | 🔵 | Análisis de deep links `unlockhub://`. **Sin hallazgo de seguridad**: (1) El tabs layout tiene `if (!isAuthenticated) return <Redirect href="/(auth)/login" />` — cualquier deep link a una pantalla autenticada redirige al login si no hay sesión ✅. (2) `reset-password.tsx` es accesible sin auth (correcto — viene desde email) y valida `!token` antes de renderizar el form ✅. El token se valida server-side contra el hash almacenado. (3) No hay navegación a pantallas sensibles sin auth check ✅. | `apps/mobile/app/(tabs)/_layout.tsx`, `apps/mobile/app/reset-password.tsx` | ✅ Informacional — sin acción necesaria | S5 |
| A52 | Dependencias / API | 🟠 | CVE `form-data` CVE-2026-12143 / GHSA-fjwh-7mfq-fhwh — inyección de headers CR/LF en `Content-Disposition`. Afecta `form-data <=4.0.5`. Transitiva de `axios@1.16.0`, `supertest@7.2.2` y `jest-expo@55`. Fix en 4.0.6 (mismo major). **Override npm ignorado por lock file**: npm overrides en root `package.json` no actualizaron el lock file existente (comportamiento documentado: el lock file gana en conflicto con overrides para paquetes ya resueltos). **Solución**: dep directa `"form-data": "^4.0.6"` en `apps/api/package.json` — hoisted y deduplicada a 4.0.6 en todos los workspaces. Verificado con `node -e "require('./node_modules/form-data/package.json').version"` → `4.0.6`. | `apps/api/package.json` (dep directa añadida) | ✅ S8 | S8 |
| A53 | Dependencias / API+Worker | 🟠 | **Cierre de A2**: `bcrypt@5.1.1 → 6.0.0` en `apps/api` y `apps/worker`. bcrypt@6 sustituye `@mapbox/node-pre-gyp` + `tar` por `node-gyp-build` — elimina la cadena de vulnerabilidades CVE-2026-23745/GHSA-8qq5-rm4j-mr97 por completo. `@types/bcrypt` bumpeado a `^6.0.0` (compatible con TS 5.5+). API bcrypt (`hash`, `compare`, `genSalt`) idéntica entre v5 y v6 — 0 cambios de código. `npm ls tar` y `npm ls @mapbox/node-pre-gyp` → vacíos post-upgrade. 30 tests auth ✅ (suite auth pasada aisladamente para verificar bcrypt funcional). `npm install` restó 23 paquetes (la cadena eliminada). | `apps/api/package.json`, `apps/worker/package.json` | ✅ S8 | S8 |
| A54 | Dependencias / API | 🟠 | CVE `multer` GHSA-72gw-mp4g-v24j (DoS via deeply nested field names) + GHSA-3p4h-7m6x-2hcm (DoS via incomplete cleanup of aborted uploads) — rango afectado `1.0.0–2.1.1`. El scanner externo los omitió (marcó multer 2.1.1 como parcheado — FP del scanner). Detectados durante verificación con `npm audit`. Fix en `multer@2.2.0` (mismo major). `"multer": "^2.1.1" → "^2.2.0"` en `apps/api/package.json`. `npm audit fix` (non-breaking) hubiera manejado este caso pero también habría actualizado @sentry/node (fuera de scope) — upgrade directo preferido. Verificado: multer ya no aparece en `npm audit` post-upgrade. | `apps/api/package.json` | ✅ S8 | S8 |
| A55 | Dependencias / API+Mobile | 🟠 | CVE `ws` GHSA-96hv-2xvq-fx4p — Memory exhaustion DoS from tiny fragments and data chunks. Afecta `ws 8.0.0–8.20.1`. Fix en ws@8.21.0. Las instancias afectadas eran: `engine.io@6.6.8 → ws@8.20.1` (api), `socket.io-adapter@2.5.7 → ws@8.20.1` (api), `engine.io-client@6.6.5 → ws@8.20.1` (mobile). CVE distinto de GHSA-58qx-3vcg-4xpx (A1/A56). **Override npm ignorado** por lock file (mismo comportamiento que A52). **Solución**: upgrade directo de `engine.io@6.6.8→6.6.9`, `socket.io-adapter@2.5.7→2.5.8`, `engine.io-client@6.6.5→6.6.6` — estas versiones patch declaran `ws@~8.21.0`. Añadidas como deps directas en `apps/api` y `apps/mobile` (patrón de pin de transitivas necesario dado que los overrides de npm no aplican al lock file existente). `ws@^8.21.0` también añadido directamente en ambos workspaces para garantizar la hoisting. Verificado: `npm ls ws --all` → todas las instancias `ws@8.21.0`. socket.io funcional: 633 tests API en verde. | `apps/api/package.json`, `apps/mobile/package.json`, root `package.json` (overrides como safety net) | ✅ S8 | S8 |
| A56 | Dependencias / FP | 🔵 | Scanner externo flaggeó `ws@8.20.1` como vulnerable a CVE-2026-45736 / GHSA-58qx-3vcg-4xpx (uninitialized memory disclosure). **Falso positivo confirmado**: GHSA-58qx-3vcg-4xpx fue resuelta en ws@8.20.1 — es la versión del fix, no la vulnerable. El scanner tiene un fallo de rango inclusivo (incluye la versión del fix en el rango afectado). Validado contra AUDIT.md A1: la corrección de S1 ya llevó ws a 8.20.1 precisamente para resolver esta CVE. Sin acción — documentado como FP. | N/A | ✅ FP confirmado S8 | S8 |
| A57 | Hardening / Infraestructura | 🔵 | CWE-250 — `apps/api/Dockerfile` y `apps/worker/Dockerfile` no definen un usuario no privilegiado (`USER`). El proceso del servidor corre como root dentro del contenedor. Si hay RCE, el atacante tiene privilegios de root en el contenedor. Fix: añadir `RUN addgroup --system app && adduser --system --ingroup app app` + `USER app` antes del `CMD` en ambos Dockerfiles. Sin urgencia inmediata: Railway aisla los contenedores; el riesgo real requiere RCE previo en el servidor. Diferido a hardening post-lanzamiento. | `apps/api/Dockerfile`, `apps/worker/Dockerfile` | 🔲 Pendiente — T98 | S8 |
| A58 | Hardening / Criptografía | 🔵 | CWE-310 — Scanner marcó `apps/api/src/lib/crypto.ts:37` y `scripts/rotate-encryption-key.ts:59` para revisión manual de IV y algoritmo (AES-256-GCM). Sin evidencia de debilidad real: AES-256-GCM es el estándar recomendado y el IV aleatorio de 16 bytes es correcto. Verificación manual pendiente para confirmar que: (1) el IV se genera con `crypto.randomBytes(16)` (no determinístico); (2) no se reutiliza IV+key para bloques distintos; (3) el auth tag de GCM se valida en el decrypt. Bajo riesgo — el scanner usó heurísticas de nombre de variable, no análisis semántico. Diferido a auditoría manual de crypto en Fase 4. | `apps/api/src/lib/crypto.ts:37`, `scripts/rotate-encryption-key.ts:59` | 🔲 Pendiente revisión manual — T99 | S8 |
| A59 | Dependencias / SCA | 🔵 | SCA menores sin fix no-breaking: (1) `js-yaml@3.14.2` — major EOL, vulnerabilidades en 3.x; versión 4.x disponible pero con breaking changes en la API (migración de `safeLoad`→`load`). Transitiva de herramientas de desarrollo. (2) `uuid <11.1.1` — GHSA-w5hq-g745-h8pq (missing buffer bounds check); fix vía `npm audit fix --force` requeriría `expo@46.0.21` (breaking change inadmisible). (3) `@opentelemetry/core`, `@babel/core` — versiones marcadas por scanner sin CVE activa confirmada, meramente desactualizadas. **Todos diferidos**: los fixes requieren breaking changes en dependientes (expo, herramientas de build). Revisar al actualizar Expo SDK en Fase 4. | múltiples transitivas | 🔲 Diferido Fase 4 | S8 |
| A60 | Scanner / FP | 🔵 | CWE-319 — `apps/api/health-mock.js` — HTTP sin TLS (servidor en `http://localhost:3000`). **Falso positivo confirmado**: archivo es un mock de smoke-test para el emulador Android (`node health-mock.js`), sin Dockerfile ni `railway.json` que lo incluyan en producción. El comentario de cabecera lo explicita: "Servidor mock para smoke tests en emulador — solo responde /health". Servidor HTTP cleartext en localhost es intencionado y sin riesgo real — solo el desarrollador lo ejecuta localmente. Sin ruta de despliegue en Railway. | `apps/api/health-mock.js` | ✅ FP confirmado S8 | S8 |
| A61 | Scanner / FP | 🔵 | CWE-134 — `scripts/backfill-game-console.ts:69` — formato de string no controlado (template literal en `console.warn`). **Falso positivo confirmado**: archivo es un script de backfill de catálogo ejecutado manualmente una sola vez por el desarrollador con credenciales propias (`RA_SYSTEM_USER/KEY`). `console.warn` en scripts de administración es correcto — no hay usuarios externos ni entradas arbitrarias que puedan controlar el formato. Sin ruta de ejecución en el servidor de producción ni en Railway. El scanner aplicó la heurística CWE-134 mecánicamente sobre cualquier template literal en un `console.*`. | `scripts/backfill-game-console.ts:69` | ✅ FP confirmado S8 | S8 |
| A51 | Control de costes / Steam | 🔵 | Sin tope de juegos por intento, un usuario con 3.000+ juegos Steam podía agotar >30 % de la cuota diaria (100 000 calls) en un solo sync: 1 call (GetOwnedGames) + 3 calls/juego × 3 000 = 9 001 calls. **Arreglado**: `STEAM_MAX_GAMES_PER_SYNC = 100` añadido a `apps/api/src/config/steamQuota.ts` (junto a los umbrales 80/90 % de A41). En `syncUser` y `syncUserBatched`, antes de llamar a `processGames`, los juegos elegibles se ordenan por `rtime_last_played` desc (señal primaria de Steam — Unix timestamp de última sesión) y `playtime_forever` como desempate; se toman los primeros 100 y el resto se omite en este intento. El total reportado al progreso (`onBatch`) es el de los juegos efectivamente procesados, garantizando que el cliente vea 100 % al terminar. Los juegos omitidos se recuperan en el siguiente sync nocturno o manual. El contador `steam:api:calls:<date>` (`incrementSteamApiCounter`) solo se incrementa en los juegos procesados — coherente con A24. `syncUserExpress` no se toca: ya tiene su propio tope de 20 juegos y su propia ordenación por `playtime_forever`. **Decisión de reporting**: `gamesSkipped` no se propaga al evento Socket.io `sync:complete` ni al mobile — propagarlo requeriría cambios en `SyncCompleteEvent`, el worker y al menos un hook mobile; se prefiere loggear vía pino (INFO con `{userId, total, syncing, skipped}`) y dejar el cliente sin UI específica. La deuda de reanudación con cursor queda en T90 (Fase 4). 3 tests nuevos: `≤100 juegos → todos procesados`, `>100 juegos → exactamente los 100 más recientes por rtime_last_played`, `contador Redis solo cuenta juegos procesados`. | `apps/api/src/config/steamQuota.ts`, `apps/api/src/platforms/steam.adapter.ts`, `apps/api/src/__tests__/steam.adapter.test.ts` | ✅ S7 | S7 |
| A62 | Hardening / Criptografía | 🔵 | CWE-310 FP verificado — `crypto.ts:37` + `rotate-encryption-key.ts:59`. El scanner usó heurísticas de nombre de variable, no análisis semántico. Verificación manual completa: (1) algoritmo AES-256-GCM (recomendado por NIST); (2) IV generado con `crypto.randomBytes(12)` en cada llamada a `encrypt` — no determinístico, no reutilizado entre operaciones; (3) auth tag GCM de 16 bytes producido por `cipher.getAuthTag()` y validado en `decipher.setAuthTag(tag)` antes de `final()` — previene bit-flipping sin excepción; (4) clave de 32 bytes (64 hex chars) validada con regex `/^[0-9a-fA-F]{64}$/` al inicializar. Formato almacenado en BD: `iv(12 bytes) ‖ tag(16 bytes) ‖ ciphertext`, todo en hex. Cifra exclusivamente `PlatformAccount.encryptedToken` (tokens PSN/Xbox en reposo). Nota: límite teórico de nonce-reuse GCM (~2^32 cifrados/clave) no alcanzable en este volumen; rotación disponible vía `scripts/rotate-encryption-key.ts`. Sin acción de código necesaria. | `apps/api/src/lib/crypto.ts:37`, `scripts/rotate-encryption-key.ts:59` | ✅ FP verificado — T99 cerrado | S9 |
| A63 | Dependencias / SCA | 🔵 | js-yaml 3.14.2 EOL — FP de producción. Transitiva exclusiva de `devDependencies` de `apps/api`: cadena `ts-jest@29.4.9 → @jest/transform@29.7.0 → babel-plugin-istanbul@6.1.1 → @istanbuljs/load-nyc-config@1.1.0 → js-yaml@3.14.2`. 0 imports en código propio (grep confirmado en todos los `.ts`). No entra en el runtime del servidor: el stage `runner` de ambos Dockerfiles usa `npm ci --omit=dev`, que excluye toda la cadena de devDependencies. js-yaml 4.x sí está presente en el workspace vía `eslint@8.57.1` y `@react-native-community/cli`; la v3.x EOL es invisible para el código de aplicación. Sin riesgo operativo. Diferir posible upgrade a cuando `ts-jest` / `@istanbuljs` actualicen su dependencia sobre js-yaml 4.x de forma nativa. | `apps/api` (devDependencies transitiva — no llega a producción) | ✅ FP verificado — T100 cerrado | S9 |

---

## Línea base — 2026-06-11

### npm audit

| Workspace | Crítico | Alto | Moderado | Bajo | Total |
|---|---|---|---|---|---|
| Raíz (hoisted) | 0 | 2 | 23 | 0 | 25 |
| `apps/api` | 0 | 2 | 6 | 0 | 8 |
| `apps/mobile` | 0 | 0 | 19 | 0 | 19 |
| `apps/worker` | 0 | 2 | 4 | 0 | 6 |
| `packages/types` | 0 | 0 | 0 | 0 | 0 |
| `packages/validators` | 0 | 0 | 0 | 0 | 0 |

> Las 2 vulnerabilidades HIGH (raíz, api, worker) son `tar` path traversal y `ws` uninitialized memory.  
> Las 19 moderate de mobile son ws/engine.io-client (mismo paquete, distinto hoisting).

### npm audit — post S1

| Workspace | Crítico | Alto | Moderado | Bajo | Total | Cambio |
|---|---|---|---|---|---|---|
| Raíz (hoisted) | 0 | 1 | 0 | 0 | ~18 | ws/qs/express resueltos ✅ |
| `apps/api` | 0 | 1 | 0 | 0 | ~4 | ws runtime 8.x→8.20.1 ✅ |
| Residual HIGH | — | `tar` | — | — | — | Solo herramienta build, no runtime |

> `ws` runtime (`engine.io` + `socket.io-adapter`) en 8.20.1 — fuera del rango CVE (8.0.0–8.20.0).

### Ciclos de import

```
npx madge --circular --extensions ts,tsx apps/
✔ No circular dependency found!  (368 archivos analizados, 2.4 s)
```

**Conteo: 0 ciclos.**

### TypeScript typecheck (strict)

| Workspace | Errores TS |
|---|---|
| `apps/api` | 0 |
| `apps/mobile` | 0 |
| `apps/worker` | 0 |

### Tests

| Workspace | Tests | Resultado |
|---|---|---|
| `apps/api` | 611 | ✅ (línea base pre-S1) |
| `apps/mobile` | 387 | ✅ (línea base pre-S1) |

> Ambas suites finalizan con "Force exiting Jest" por timers/sockets abiertos — no afecta a los resultados. Pendiente investigar (A14, S6).

### Tests — post S1

| Workspace | Tests | Resultado | Tests nuevos |
|---|---|---|---|
| `apps/api` | 620 | ✅ | webhook ×2, magic-bytes ×6, ranking ×1 = +9 |
| `apps/mobile` | 387 | ✅ | 0 |

### Tests — post S2

| Workspace | Tests | Resultado | Tests nuevos |
|---|---|---|---|
| `apps/api` | 620 | ✅ | 0 (mocks de redis actualizados en 2 ficheros steam adapter) |
| `apps/mobile` | 387 | ✅ | 0 |

### Tests — post S3

| Workspace | Tests | Resultado | Tests nuevos |
|---|---|---|---|
| `apps/api` | 620 | ✅ | 0 (mocks de redis y ranking actualizados: `expire` añadido, mocks `getPlatformXpMap` con `platform` incluido) |
| `apps/mobile` | 387 | ✅ | 0 |

### Tests — post S4

| Workspace | Tests | Resultado | Tests nuevos |
|---|---|---|---|
| `apps/api` | 620 | ✅ | 0 |
| `apps/mobile` | 387 | ✅ | 0 (SyncStatusBar tests adaptados a nueva firma con prop `isRunning`; mock `useSyncProgress` eliminado del test) |

### Tests — post S5

| Workspace | Tests | Resultado | Tests nuevos |
|---|---|---|---|
| `apps/api` | 620 | ✅ | 0 |
| `apps/mobile` | 395 | ✅ | A44: 6 tests `cloudinary.test.ts` · A45: 2 tests `useSyncStatus` (refetchInterval dinámico) = +8 |

### Tests — post S6a (A49)

| Workspace | Tests | Resultado | Tests nuevos |
|---|---|---|---|
| `apps/api` | 620 | ✅ | 0 |
| `apps/mobile` | 400 | ✅ | A49: 2 tests `AdBanner.test.tsx` (consentResolved gate) · 3 tests `useGdprConsent.test.ts` (NOT_REQUIRED, REQUIRED, error) = +5 |

### Tests — post S6b (A41)

| Workspace | Tests | Resultado | Tests nuevos |
|---|---|---|---|
| `apps/api` | 623 | ✅ | A41: 3 tests `sync.service.test.ts` (< 90 % normal, ≥ 90 % multi-plataforma, ≥ 90 % solo Steam) = +3 |
| `apps/mobile` | 402 | ✅ | A41: 2 tests `useSyncAll.test.ts` (steamQuotaState exceeded, steamQuotaState skipped) · 1 fix `SyncStatusBar.test.tsx` (steamQuotaState: null en mock) = +2 |

### Tests — post S6c (A2 cierre)

| Workspace | Tests | Resultado | Tests nuevos |
|---|---|---|---|
| `apps/api` | 623 | ✅ | 0 — sin cambios de código |
| `apps/mobile` | 402 | ✅ | 0 — sin cambios de código |

### Tests — post S6d (A37)

| Workspace | Tests | Resultado | Tests nuevos |
|---|---|---|---|
| `apps/api` | 627 | ✅ | A37: 4 tests `activity.service.test.ts` (nextCursor con página llena; nextCursor null en última; cursor como filtro `id lt`; sin filtro sin cursor) + 1 actualizado `phase2.controllers.test.ts` = +4 |
| `apps/mobile` | 407 | ✅ | A37: 5 tests `usePublicFeed.test.ts` (primera página; acumulación fetchNextPage; stop nextCursor null; cursor en URL; isError) = +5 |

### Tests — post S6b (A22, A39, A9, A12, A13)

| Workspace | Tests | Resultado | Tests nuevos |
|---|---|---|---|
| `apps/api` | 629 | ✅ | A22: 2 tests `sync.worker.test.ts` (lock ocupado → queueInitialSync; lock disponible → sin doble encolado) = +2 |
| `apps/mobile` | 407 | ✅ | 0 — cambios de A9/A39 no requieren tests nuevos (A39: 24 tests wrapped existentes siguen verdes) |

### Tests — post S7 (A51)

| Workspace | Tests | Resultado | Tests nuevos |
|---|---|---|---|
| `apps/api` | 632 | ✅ | A51: 3 tests `steam.adapter.test.ts` (≤100 juegos → todos procesados; >100 → exactamente 100 más recientes por `rtime_last_played`; contador Redis solo refleja juegos procesados) = +3 |
| `apps/mobile` | 407 | ✅ | 0 |

### Tests — post S8 (A52–A55: form-data, bcrypt, multer, ws/engine.io)

| Workspace | Tests | Resultado | Tests nuevos |
|---|---|---|---|
| `apps/api` | 633 | ✅ | 0 (solo bumps de dependencias — 0 cambios de código de aplicación) |
| `apps/mobile` | 486 | ✅ | 0 (el delta 407→486 respecto a S7 corresponde a tests añadidos en sesiones Lote 4/5/BUG-007 etc. — no a esta sesión) |

### npm audit — post S8

| Workspace | Crítico | Alto | Moderado | Bajo | Total | Cambio vs baseline S7 |
|---|---|---|---|---|---|---|
| Raíz (hoisted) | 0 | 0 | 36 | 2 | 38 | -8 HIGH ✅ |

> **Delta respecto a baseline pre-S8 (46 vulns, 8 HIGH):**
> - A52 form-data 4.0.5→4.0.6 (CVE-2026-12143): −1 HIGH ✅
> - A53 bcrypt 5→6, tar chain eliminada (A2 — 6 CVEs tar, ver detalle): −4 HIGH estimados ✅ _(el output npm audit pre-S8 no fue capturado; la cifra exacta por paquete no es reconstruible. A2 documenta 5 CVEs HIGH previas + CVE-2026-23745 = 6 CVEs; npm audit asignó HIGH a un subconjunto — verosímilmente 4 para cuadrar el total de 8. `npm ls tar` → vacío post-S8 confirma cierre real.)_
> - A54 multer 2.1.1→2.2.0 (GHSA-72gw + GHSA-3p4h, ambas HIGH en npm audit): −2 HIGH ✅
> - A55 ws 8.20.1→8.21.0 vía engine.io+adapters (GHSA-96hv-2xvq-fx4p): −1 HIGH ✅ _(severidad npm audit pre-S8 no capturada; puede ser moderate — si ws era moderate, tar acumula −5 HIGH para completar los 8)_
> - A56 ws GHSA-58qx-3vcg-4xpx: FP del scanner (nunca fue HIGH en npm audit — A1 ya corrigió ws a 8.20.1 que ES la versión del fix) ✅
> - Residuales 36 moderate: uuid (expo dep, fix rompe expo), js-yaml EOL, @opentelemetry, @babel — todos sin fix no-breaking (A59)

### Barrido de higiene — S6b

| Check | Resultado |
|---|---|
| Ciclos de import (`madge --circular`) | ✅ 0 ciclos — 375 archivos analizados |
| i18n ES vs EN | ✅ 627 claves en ambos locales, 0 diferencias |
| Claves i18n faltantes en código | ✅ 0 — los 8 candidatos de grep son URLs y plurales i18next (falsos positivos) |
| QueryKeys literales en producción | ✅ 0 — solo en `__tests__/` (assertions de jest, correcto) |
| `usePublicFeed` consumidora activa | ⚠️ Hook huérfano — no hay pantalla que lo importe. Endpoint API existe; hook listo para cuando se implemente pantalla de feed público. No se elimina — es infraestructura anticipatoria. |

### ESLint (antes de esta sesión)

| Área | Errores | Warnings |
|---|---|---|
| `apps/api/src` | 0 | 0 |
| `apps/mobile` (app/hooks/lib) | 0 | 4 (no-console) |

### ESLint (después — con security plugin)

| Área | Errores | Warnings nuevos |
|---|---|---|
| `apps/api/src` | 0 | 1 (`security/detect-possible-timing-attacks` en webhooks.controller.ts — ver A3) |
| `apps/mobile` (app/hooks/lib) | 0 | 1 (`security/detect-unsafe-regex` en useWrapped.ts — falso positivo, ver A9) |

### ESLint — post S1 (con no-floating-promises activo en apps/api)

| Área | Errores | Warnings |
|---|---|---|
| `apps/api/src` | 0 | 0 |

### console.log en producción

| Área | Cuenta | Archivos |
|---|---|---|
| `apps/mobile` | 7 | `useRewardedAd.ts` (×4 incluyendo errors), `profile.tsx` (×1), `api.ts` (×1) |
| `apps/api` (src, excluye seed y tests) | 0 | — |

### console.log en producción — post S4

| Área | Cuenta | Archivos |
|---|---|---|
| `apps/mobile` | 3 | `profile.tsx:228` (×1), `api.ts:180` (×1) — 4 eliminados de `useRewardedAd.ts` (A10 ✅) |
| `apps/api` (src, excluye seed y tests) | 0 | — |

### console.log en producción — post S5

| Área | Cuenta | Archivos |
|---|---|---|
| `apps/mobile` | 0 | — A10 completado ✅ |
| `apps/api` (src, excluye seed y tests) | 0 | — |

### Inline queryKeys (anti-patrón)

```
Resultado: 0 strings literales en queryKey fuera de lib/queryKeys.ts
```

Todos los hooks y screens usan `queryKeys.*` de `lib/queryKeys.ts`. ✅

### TODO / FIXME en código

```
Resultado: 3 líneas — todas son comentarios de documentación en español (TODOS en mayúsculas
como palabra, no como marcador de tarea). 0 FIXME. No hay deuda pendiente de código.
```

### Dead dependencies

| Workspace | Dep muerta confirmada | Acción |
|---|---|---|
| `apps/mobile` | `@unlockhub/validators` | ✅ Eliminada en esta sesión |
| `apps/api` | `pino-pretty` (falso positivo) | Sin acción |
| `apps/worker` | Múltiples (falsos positivos — imports de api workspace) | Sin acción |

### Seguridad — resultados barrido S1

| Check | Resultado |
|---|---|
| IDOR / ownership check en friendship | ✅ Correcto — senderId/receiverId verificados |
| IDOR / notifications | ✅ Correcto — `notification.userId !== userId` → 403 |
| IDOR / guides | ✅ Correcto — autor verificado en update/delete |
| authenticateOptional misuse | ✅ No detectado — solo en rutas públicas con lógica de privacidad |
| Zod en todas las mutaciones | ✅ Correcto — POST/PATCH/DELETE validan con parse() |
| Exposición passwordHash/tokenHash | ✅ No expuesto — mapUser excluye campos sensibles |
| CORS no permisivo | ✅ `origin: env var []` — rechaza todo si no hay CORS_ORIGIN |
| Helmet | ✅ Activo |
| Secretos en logs | ✅ Sin hallazgos |
| Stack al cliente | ✅ errorHandler nunca expone stack |
| Refresh token rotation | ✅ Correcto — revocación en cada refresh |
| GDPR soft-delete en search | ✅ `deletedAt: null` presente |

---

## Plan de sesiones

| Sesión | Foco | Hallazgos asignados |
|---|---|---|
| **S0** | Setup tooling + línea base | A11 ✅ |
| **S1** | Seguridad backend | A1 ✅, A3 ✅, A4 ✅ verificado S2, A5 ✅, A6 ✅, A7 ✅, A8 ✅, A14–A19 ✅, A20 ✅ descartado, A21 ✅ verificado S2, A22 🔲 |
| **S2** | Sync / integraciones (PSN, Steam, RA, worker) | A23 ✅, A24 ✅, A25 ✅, A26 ✅, A27 🔲 S6 |
| **S3** | Performance backend (Redis, PostgreSQL, queries) | A28 ✅, A29 ✅, A30 ✅, A31 ✅, A32 ✅, A33 ✅, A34 ✅, A35 ✅, A36 ✅, A37 🔲 S6, A38 🔲 S6, A39 🔲 S6, A40 🔲 S6 |
| **S4** | Mobile — memory leaks, fluidez, Socket.io | A42 ✅, A43 ✅, A10 ✅ (adelantado desde S6), A44 🔲, A45 🔲 |
| **S5** | Mobile — seguridad de datos, almacenamiento | A44 ✅, A45 ✅, A46 ✅, A47 ✅ (info), A48 ✅, A49 🔲 S6a, A50 ✅ (info) · A10 completado |
| **S6a** | PRE-LANZAMIENTO — Deuda con riesgo (cerrar antes o en paralelo con la build de release) | A49 ✅ (UMP consent vs AdBanner — GDPR/Play Store · **obligatorio**) · A41 ✅ (umbral Steam 80/90 — centralizado en `steamQuota.ts`) · A2 ✅ (CVE tar — override imposible sin `--force`; riesgo aceptado documentado) · A27 🔲 (timeout psn-api con AbortController — diferido) |
| **S6b** | Limpieza pura — post-lanzamiento · **COMPLETA** | A9 ✅ (eslint-disable unsafe-regex) · A12 ✅ (depcheck pino-pretty) · A13 ✅ (depcheck worker) · A22 ✅ (fallback queueInitialSync) · A37 ✅ (cursor pagination public feed) · A39 ✅ (select explícito wrapped) · A38 🔲 Fase 4 (payload sin paginar — sin evidencia aún) · A40 🔲 Fase 4 (sendAll sin límite — 0 llamadas activas) · Barrido: madge 0 ciclos ✅ · i18n ES=EN 627 claves 0 diff ✅ · queryKeys 0 literales en producción ✅ · usePublicFeed huérfano (sin pantalla consumidora) ⚠️ · docs actualizados ✅ |
| **S7** | Control de costes pre-lanzamiento | A51 ✅ (`STEAM_MAX_GAMES_PER_SYNC = 100` en `steamQuota.ts`; `rtime_last_played` + `playtime_forever` desempate en `sortEligibleByActivity`; tope en `syncUser`/`syncUserBatched`; log pino `{userId, total, syncing, skipped}`; `syncUserExpress` sin cambios; 3 tests nuevos — 632 API · 407 mobile) |

---

## Incidentes de deploy

| ID | Fecha | Servicio | Error | Causa raíz | Resolución | Estado |
|---|---|---|---|---|---|---|
| INC-01 | 2026-06-12 | API (UnlockHub) | P3018 / P3009 — `CREATE INDEX CONCURRENTLY cannot run inside a transaction block` (código 25001). 3 deployments consecutivos fallidos (primera oleada) + 2 adicionales (segunda oleada, bucle de autodeploy). Worker no afectado. | **Primera causa**: Prisma 5.22 envuelve **toda** migración en `BEGIN…COMMIT` independientemente del número de sentencias. `20260612000000_add_performance_indexes_s3` contenía 5 `CREATE INDEX CONCURRENTLY` que no pueden ejecutarse dentro de una transacción. La premisa "una sentencia por archivo evita la envoltura en transacción" **no se cumple en Prisma 5.22**. **Segunda causa (bucle)**: el archivo `migration.sql` seguía en el repo con el SQL CONCURRENTLY original. Al resolverse la primera fila con `--rolled-back`, `migrate deploy` creaba una nueva fila fallida en cada push a develop (autodeploy), manteniendo la BD en P3009. | **Fase 1** — índices: (1) `migrate resolve --rolled-back 20260612000000_add_performance_indexes_s3`. (2) 5 migraciones individuales creadas (`20260612000001`–`20260612000005`), una por índice. (3) Índices aplicados manualmente fuera de transacción con `prisma db execute --file`, en orden de menor a mayor tabla: User → Friendship(sender) → Friendship(receiver) → ActivityEvent → UserAchievement. (4) `indisvalid=true` verificado en `pg_indexes` tras cada índice. (5) Cada migración marcada con `migrate resolve --applied`. (6) `migrate status`: "Database schema is up to date!". (7) Push + redeploy → SUCCESS. **Fase 2** — bucle de autodeploy: (1) `migration.sql` de `_s3` vaciado — reemplazado por comentario explicativo. (2) `migrate resolve --rolled-back 20260612000000_add_performance_indexes_s3` sobre la fila de las 10:59 (segunda fila con `rolled_back_at NULL`). (3) `migrate status` → 0 fallidas. (4) Push `67bd252` → autodeploy → `migrate deploy` ejecutó `_s3` como no-op (solo comentario) → `All migrations have been successfully applied.` → API arrancada. Bucle cerrado definitivamente. | ✅ Cerrado |

---

## Seguridad — Notas abiertas

| ID | Fecha | Descripción | Estado |
|---|---|---|---|
| SEC-01 | 2026-06-12 | **DATABASE_URL de producción expuesta** durante el incidente INC-01 — la contraseña de Postgres quedó accesible en texto plano en esta sesión de trabajo. Rotada en Railway dashboard → servicio Postgres → Settings → Credentials. `.env` local actualizado con la nueva credencial. | ✅ CERRADO — credencial rotada |
