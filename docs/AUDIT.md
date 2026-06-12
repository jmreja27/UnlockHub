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
| A2 | Seguridad API | 🟠 | CVE `tar` (5 CVEs HIGH) — solo en herramientas de build, no runtime. `npm audit fix` no puede resolverlo sin `--force` (breaking). **Trade-off documentado**: `tar` solo se ejecuta en `npm install` en CI/dev; no hay superficie de ataque en producción. | `tar` (transitiva de `@mapbox/node-pre-gyp`) | 🔲 S6 | S6 |
| A3 | Seguridad API | 🟡 | `webhooks.controller.ts:46` — comparación `token !== secret` no constant-time. **Arreglado**: `crypto.timingSafeEqual()` sobre hashes SHA-256 de ambos strings (longitud fija, sin filtrar longitud del secret). Tests: prefijo-corto y sufijo-largo añadidos. | `apps/api/src/controllers/webhooks.controller.ts:46` | ✅ S1 | S1 |
| A4 | Seguridad API | 🟡 | `authenticate` middleware `.catch()` (línea 56): error de BD silenciado → request autorizada con datos del JWT sin comprobar soft-delete GDPR. **Verificado S2**: el `.catch()` es exclusivo de errores de BD — los tokens corruptos/expirados son rechazados en el `try/catch` anterior (líneas 34-39) con 401 incondicional. El bypass documentado es únicamente el check de soft-delete durante outage de BD — trade-off deliberado, mitigado por `deletedAt: null` en todos los services (A14–A19). | `apps/api/src/middleware/authenticate.ts:34-64` | ✅ Descartado — token inválido/expirado SIEMPRE → 401 S2 | S1 |
| A5 | Seguridad API | 🟡 | Upload: validación de MIME solo por `Content-Type` declarado. **Arreglado**: `validateFileMagicBytes` middleware con magic bytes manuales (JPEG `FF D8 FF`, PNG `89 50 4E 47...`, WebP RIFF/WEBP). Se ejecuta tras multer cuando el buffer está disponible. Sin deps externas nuevas. 6 tests añadidos. | `apps/api/src/middleware/upload.middleware.ts` | ✅ S1 | S1 |
| A6 | Seguridad API | 🟡 | `getMyRankHandler`: `req.query['platform']` sin validar Zod → strings arbitrarios podían llegar a Redis. **Arreglado**: `platformSchema.parse()` + test de plataforma inválida → 400. | `apps/api/src/controllers/ranking.controller.ts:33` | ✅ S1 | S1 |
| A7 | Calidad / ESLint | 🟡 | `no-floating-promises`/`no-misused-promises` no activos. **Arreglado**: `apps/api/.eslintrc.js` + `tsconfig.eslint.json` (incluye tests). Un floating promise real encontrado: `io.close()` (devuelve `Promise<void>` en socket.io 4.8.3) → convertido a `await io.close()` en SIGTERM handler (bug de shutdown: Redis/Prisma se desconectaban antes de que Socket.io cerrase). | `apps/api/src/index.ts:24` | ✅ S1 | S1 |
| A8 | Dependencias | 🟡 | 23 vulnerabilidades moderate resueltas con `npm audit fix` junto con A1. `express` 4.22.1→4.22.2 (fix `qs`), `brace-expansion` 5.0.5→5.0.6. | `package-lock.json` | ✅ S1 | S1 |
| A9 | Móvil / ESLint | 🔵 | `security/detect-unsafe-regex` sobre `/^\d{4}(-\d{2})?$/` en `useWrapped.ts:15` — falso positivo (sin backtracking exponencial). | `apps/mobile/hooks/useWrapped.ts:15` | 🔲 S6 | S6 |
| A10 | Limpieza | 🔵 | 7 `console.log/error` de debug en producción mobile. | `apps/mobile/hooks/useRewardedAd.ts`, `profile.tsx:228`, `api.ts:180` | 🔲 S6 | S6 |
| A11 | Dependencias | 🔵 | `@unlockhub/validators` dead dep en mobile. ✅ Eliminada en S0. | `apps/mobile/package.json` | ✅ | S0 |
| A12 | Dependencias | 🔵 | `pino-pretty` falso positivo en depcheck — sí se usa en `logger.ts`. | `apps/api/src/lib/logger.ts` | 🔲 S6 | S6 |
| A13 | Dependencias | 🔵 | `apps/worker` deps "unused" en depcheck — falso positivo, importa desde workspace. | `apps/worker/package.json` | 🔲 S6 | S6 |
| A14 | GDPR / AuthZ | 🟡 | `subscription.service.ts` (5 funciones): `prisma.user.findUnique({ where: { id: userId } })` sin `deletedAt: null`. Usuario soft-deleted con JWT válido + DB error en authenticate podría activar/cancelar subscripciones. **Arreglado**: `deletedAt: null` en las 5 queries. | `apps/api/src/services/subscription.service.ts:34,84,126,171,258` | ✅ S1 | S1 |
| A15 | GDPR / Rankings | 🟡 | `seedRankingsFromDb()`: `findMany` sin `deletedAt: null` → usuarios eliminados podrían reconstituirse en Redis rankings tras disaster recovery. **Arreglado**: `deletedAt: null` añadido. | `apps/api/src/services/ranking.service.ts:163` | ✅ S1 | S1 |
| A16 | GDPR / Puntos | 🟡 | `awardPoints()`: `findUnique` sin `deletedAt: null`. **Arreglado**: defense-in-depth para ruta webhook. | `apps/api/src/services/points.service.ts:24` | ✅ S1 | S1 |
| A17 | GDPR / Wrapped | 🟡 | `getWrapped()` y `getMonthlyWrapped()`: `findUnique` sin `deletedAt: null`. **Arreglado**. | `apps/api/src/services/wrapped.service.ts:256,313` | ✅ S1 | S1 |
| A18 | GDPR / Stats | 🟡 | `getMyStats()`: `findUnique` sin `deletedAt: null`. **Arreglado**. | `apps/api/src/services/stats.service.ts:54` | ✅ S1 | S1 |
| A19 | GDPR / Profile | 🟡 | `getProfile()` (endpoint `/me`): `findUnique` sin `deletedAt: null` — usuario soft-deleted podría recibir su propio perfil durante DB outage en auth. **Arreglado**. | `apps/api/src/services/user.service.ts:149` | ✅ S1 | S1 |
| A20 | Seguridad API | 🟡 | `forgotPassword`: diferencia de latencia según email exista o no (user enumeration timing). Mitigado por `authRateLimiter` (10 req/15min). **Propuesta**: min-delay de 500ms constante en todos los casos para normalizar tiempo de respuesta. **Descartado**: latencia constante añade fricción real a todos los usuarios; el authRateLimiter (10 req/15min) hace el timing attack no explotable en la práctica. | `apps/api/src/services/auth.service.ts:106` | ✅ Descartado — mitigado por authRateLimiter | S1 |
| A21 | Rate limiting | 🔵 | `POST /sync/:platform` solo tiene `globalRateLimiter` (500/15min por IP). **Verificado S2**: el cooldown Redis SET NX es la PRIMERA operación en `triggerManualSync` (línea 59), antes de cualquier query a BD. La protección existente (cooldown + contador diario) es suficiente para este endpoint. | `apps/api/src/services/sync.service.ts:59` | ✅ Descartado — cooldown es el primer check S2 | S1 |
| A22 | Sync / Lógica | 🔵 | `triggerExpressSync()`: si el lock Redis no se adquiere (otro sync en curso), el express sync se descarta silenciosamente sin encolar full sync. Impacto: usuario que vincula 2 plataformas en <25s podría no ver los logros de la segunda hasta el sync automático. No es vulnerabilidad de seguridad — UX. **Propuesta**: fallback a `queueInitialSync()` cuando el lock falla. | `apps/api/src/services/sync.service.ts:299` | 🔲 Revisar | S1 |
| A23 | Sync / Steam | 🟡 | 4 métodos internos del `SteamAdapter` (`fetchOwnedGames`, `fetchPlayerAchievements`, `fetchGameSchema`, `fetchRarityMap`) carecían de timeout en sus llamadas axios. Un cuelgue de Steam API mantendría un slot del worker BullMQ bloqueado hasta `lockDuration` (5 min), impidiendo que otros usuarios sincronicen. **Arreglado**: `timeout: 10_000` añadido en las 6 llamadas internas (incluido `fetchSteamAchievementDefinitions`). | `apps/api/src/platforms/steam.adapter.ts` | ✅ S2 | S2 |
| A24 | Sync / Steam | 🟡 | `steam:api:calls:<date>` — el contador de llamadas a la API de Steam se lee en `background-sync.scheduler.ts` y en `admin.service.ts` para aplicar el umbral del 80% (pausa de background sync) y mostrarlo en el dashboard, pero **nunca se incrementaba** en ningún adapter. La protección documentada en CLAUDE.md como "✅ Activo" estaba completamente inactiva. **Arreglado**: `incrementSteamApiCounter()` llamado en cada fetcher real de Steam (6 puntos de llamada), con TTL de 48h sobre la clave diaria. Los tests de Steam adapter actualizados con mock de `redis.incr` y `redis.expire`. **⚙️ Pendiente calibración**: (1) El umbral del 90% mencionado en CLAUDE.md no existe en el código — solo hay el check al 80% en `background-sync.scheduler.ts`; homogeneizar o eliminar referencia. (2) Verificar en producción que el volumen real de usuarios × juegos × ~4 llamadas/juego no alcanza los 80.000 en un día antes de poder añadir usuarios premium con sync cada 15 min. (3) TTL 48h es conservador — la clave es fecha-específica (`steam:api:calls:YYYY-MM-DD`), por lo que 25h sería suficiente; el exceso de 48h no causa doble cómputo pero sí acumula claves más tiempo. | `apps/api/src/platforms/steam.adapter.ts` | ✅ S2 | S2 |
| A25 | Sync / Xbox | 🔵 | Todas las llamadas axios internas del `XboxAdapter` (`exchangeCodeForMsTokens`, `refreshMsAccessToken`, `getMsToXblToken`, `getXblToXstsToken`, `fetchGamertag`, loop de `fetchXboxAchievements`) carecían de timeout. Además, el bucle de paginación de `fetchXboxAchievements` no tenía límite de páginas (PSN tiene `MAX_PAGES=10`). Xbox está gateado hasta Fase 4, pero la corrección es trivial. **Arreglado**: `timeout: 15_000` en token exchanges, `timeout: 10_000` en resto; `XBOX_MAX_PAGES = 20` en el bucle de paginación. | `apps/api/src/platforms/xbox.adapter.ts` | ✅ S2 | S2 |
| A26 | Sync / PSN | 🔵 | `fetchMergedTrophies`: `earnedRes.trophies` y `titleTrophiesRes.trophies` se iteraban sin guard `?? []`. Si PSN devuelve respuesta malformada en runtime (las propiedades están tipadas pero la API externa puede diferir), se lanza `TypeError` que silencia el título en `Promise.allSettled` sin logging. **Arreglado**: `(earnedRes.trophies ?? [])` y `(titleTrophiesRes.trophies ?? []).map(...)` para robustez ante respuestas inesperadas. | `apps/api/src/platforms/psn.adapter.ts:558-562` | ✅ S2 | S2 |
| A27 | Sync / PSN | 🔵 | Llamadas a `psn-api` (`getUserTitles`, `getTitleTrophies`, `getUserTrophiesEarnedForTitle`) no tienen control de timeout — la librería usa `node-fetch` internamente. Un cuelgue de PSN API mantendría el slot del worker hasta `lockDuration`. **Propuesta implementación S6**: envolver cada llamada en un helper `withTimeout(promise, ms)` basado en `AbortController` (no bare `Promise.race`). Con `Promise.race` la promesa perdedora sigue corriendo silenciada — con `AbortController` se cancela el `fetch` subyacente y se libera el socket. El error de timeout debe re-lanzarse (no tragarse) para que `Promise.allSettled` lo registre como `reason` y el título quede marcado como fallo puntual, no como silencio. TTL recomendado: 30s por llamada de títulos, 20s por llamada de trofeos individuales. | `apps/api/src/platforms/psn.adapter.ts` | 🔲 S6 | S2 |
| A28 | Perf / N+1 | 🟡 | `upsertUserScore` llamaba `getPlatformXp(userId, platform)` una vez por cada plataforma (4 queries para un usuario con Steam+RA+PSN+Xbox). **Arreglado**: reemplazado por `getPlatformXpMap` — una sola query que carga todos los logros del usuario para las plataformas dadas y agrupa en memoria. Reduce 4 queries → 1 en cada actualización de ranking (tras sync, tras addXp, al cambiar visibilidad). También beneficia `seedRankingsFromDb`. | `apps/api/src/services/ranking.service.ts:20-63` | ✅ S3 | S3 |
| A29 | Perf / Select | 🔵 | `getUserGameAchievements` hacía `prisma.achievement.findMany` sin `select` — cargaba todos los campos del modelo incluidos `rawValue`, `createdAt`, `updatedAt` que no se usan en la respuesta. Para un juego con 1.000 logros (RA/Steam) esto es ~150 KB de datos extra por request antes de cachear. **Arreglado**: `select` explícito con los 9 campos requeridos por `AchievementWithCompareStatus`. | `apps/api/src/services/user.service.ts:864` | ✅ S3 | S3 |
| A30 | Perf / Redis | 🔵 | `USER_GAMES_KEYS_SET` (set de tracking de claves de caché por usuario) no tenía TTL. Los entries individuales expiran en 5 min pero el set de tracking permanece indefinidamente acumulando claves muertas. Cada `smembers` en `invalidateUserPublicCache` retorna todas las claves incluyendo ya-expiradas (las operaciones `del` sobre claves inexistentes son no-ops, sin rotura funcional). **Arreglado**: `redis.expire(USER_GAMES_KEYS_SET, TTL × 4)` tras cada `sadd`. El TTL se rota en cada escritura, equivalente a un sliding-window de 20 min. | `apps/api/src/services/user.service.ts:797,923` | ✅ S3 | S3 |
| A31 | Perf / GDPR | 🔵 | `deleteAccount` limpiaba los sorted sets de Redis (`removeUserFromRankings`) pero no la caché pública de juegos/logros del usuario (`USER_GAMES_KEYS_SET` + claves `user-games:*`). Tras un borrado de cuenta, el set de tracking persistía indefinidamente. Funcionalmente inofensivo (getPublicProfile lanzaría USER_NOT_FOUND antes de servir la caché) pero dejaba basura en Redis. **Arreglado**: `invalidateUserPublicCache(userId)` ejecutado en paralelo con `removeUserFromRankings` al borrar la cuenta. | `apps/api/src/services/user.service.ts:710` | ✅ S3 | S3 |
| A32 | Perf / Select | 🔵 | `getProfile` y `getPublicProfile` usaban `include` sin `select` en el modelo `User` — cargaban todos los campos incluyendo `passwordHash`, `birthDate`, `streakShields`, `role`, `deletedAt`, `updatedAt` (6 campos no usados por los mappers). TypeScript garantiza que los campos seleccionados satisfacen los tipos de `mapUser`/`mapPublicUser`. **Arreglado**: cambiado a `select` explícito con los 15/11 campos requeridos respectivamente. La relación `platformAccounts` ya tenía `select` propio y se mantiene igual. | `apps/api/src/services/user.service.ts:149,191` | ✅ S3 | S3 |
| A33 | Perf / Índice | 🟡 | `UserAchievement` carece de índice compuesto `(userId, unlockedAt)`. Las queries de `getWrapped`/`getMonthlyWrapped` en `wrapped.service.ts` filtran `{ userId, unlockedAt: { gte: start, lte: end } }` — PostgreSQL usa el índice simple `userId` y luego filtra por fecha en memoria. Para usuarios con 10.000+ logros y queries de periodo acotado (1 mes), un índice compuesto permite al planner aplicar ambos filtros en el índice. **Migración lista en `20260612000000_add_performance_indexes_s3`** — no aplicada a producción. Impacto estimado: reducción de 30-60% en latencia de wrapped para usuarios con bibliotecas grandes. | `apps/api/prisma/schema.prisma:UserAchievement` | 🔲 Migración lista, revisar antes de aplicar | S3 |
| A34 | Perf / Índice | 🟡 | `ActivityEvent` carece de índice compuesto `(userId, type, createdAt)`. `wrapped.service.ts` y potencialmente futuras queries de admin filtran `{ userId, type: 'STREAK_MILESTONE', createdAt: { gte: start, lte: end } }`. Actualmente hay índices separados en `userId`, `type`, `createdAt`. PostgreSQL puede usar bitmap scan pero un índice compuesto es más eficiente para este patrón concreto. **Migración lista**. | `apps/api/prisma/schema.prisma:ActivityEvent` | 🔲 Migración lista, revisar antes de aplicar | S3 |
| A35 | Perf / Índice | 🟡 | `Friendship` carece de índices compuestos `(senderId, status)` y `(receiverId, status)`. `findAcceptedFriendIds` (hot-path del feed) y `findAcceptedFriends` (lista de amigos) siempre filtran por `(senderId|receiverId, status: ACCEPTED)`. Actualmente PostgreSQL necesita un bitmap index scan sobre los índices separados. Los índices compuestos permiten index-only scans en esta query frecuente. **Migración lista**. | `apps/api/prisma/schema.prisma:Friendship` | 🔲 Migración lista, revisar antes de aplicar | S3 |
| A36 | Perf / Índice | 🔵 | `User` carece de índice compuesto `(profileVisibility, deletedAt)`. `seedRankingsFromDb` y `background-sync.scheduler.ts` filtran `{ profileVisibility: 'PUBLIC', deletedAt: null }`. Actualmente solo hay `@@index([deletedAt])`. El índice compuesto es especialmente útil para `background-sync` que se ejecuta diariamente sobre todos los usuarios activos. **Migración lista**. | `apps/api/prisma/schema.prisma:User` | 🔲 Migración lista, revisar antes de aplicar | S3 |
| A37 | Perf / Paginación | 🟡 | `getPublicFeed` usa offset pagination con `prisma.activityEvent.count()` sin filtro. A medida que la tabla crece (millones de eventos), el `count()` sin WHERE degrada y el `skip` alto fuerza escaneos costosos. El feed de amigos (`getFriendsFeed`) ya usa cursor-based correctamente. **Propuesta**: migrar `getPublicFeed` a cursor-based (igual que `getFriendsFeed`). Implica cambio de contrato de API — coordinar con el cliente mobile. Diferido a S6 o cuando el volumen lo justifique. | `apps/api/src/services/activity.service.ts:62-79` | 🔲 S6 | S3 |
| A38 | Perf / Payload | 🔵 | `getUserGameAchievements` (y su versión cacheada) devuelve un payload sin paginación. Para juegos con 1.000+ logros (Steam juegos difíciles, RA), la respuesta pre-cache puede superar 500 KB de JSON. El resultado se cachea en Redis, por lo que solo el primer request es caro. La paginación implicaría un cambio de API y pérdida de la lógica de comparación isUnlockedByMe cross-page. Diferido a Fase 4 cuando haya evidencia de problemas en producción. | `apps/api/src/services/user.service.ts:825` | 🔲 S6 | S3 |
| A39 | Perf / Select | 🔵 | `loadUserAchievements` en `wrapped.service.ts` usa `include: { achievement: { include: { game: true } } }` cargando todos los campos de `Achievement` y `Game`. De los ~12 campos de `Achievement`, 6 no se usan en `computeStats`/`computeExtendedStats` (externalId, description, rawValue, externalUrl, createdAt, updatedAt). Ídem para `Game`. Cambiar a `select` explícito requiere actualizar el tipo `UserAchievementFull` definido con `Prisma.UserAchievementGetPayload`. Diferido a S6 (baja prioridad — el resultado se cachea 1h). | `apps/api/src/services/wrapped.service.ts:7,30` | 🔲 S6 | S3 |
| A40 | Perf / Redis | 🔵 | `sendAll` en `notification.service.ts` hace `prisma.deviceToken.findMany` sin límite — carga todos los tokens de todos los usuarios en memoria. Con 100k usuarios y múltiples dispositivos podría superar 10 MB de datos antes de procesar. Actualmente el batching de Expo (BATCH_SIZE=100) solo aplica al envío HTTP, no a la lectura de BD. `sendAll` es función de broadcast raramente usada (no hay llamadas actuales en el código), pero merece cursor-pagination para escala. Diferido a Fase 4. | `apps/api/src/services/notification.service.ts:104` | 🔲 S6 | S3 |
| A41 | Docs / Steam | 🔵 | `CLAUDE.md` documenta dos umbrales para el contador `steam:api:calls`: 80 % (alerta, pausa del background-sync) y 90 % (pausa de syncs manuales). El código solo implementa el 80 % en `background-sync.scheduler.ts`; el 90 % nunca se implementó. Con el contador activo desde A24 (S2 ✅), la discrepancia puede inducir a error: un operador que lea la docs esperará una segunda protección que no existe. Opciones: implementar el 90 % en `triggerManualSync` o eliminar la referencia del 90 % en CLAUDE.md. | `apps/api/src/jobs/background-sync.scheduler.ts`, `CLAUDE.md` | 🔲 S6 | S2 |
| A42 | Móvil / Fluidez | 🟡 | `SyncStatusBar` instanciaba `useSyncProgress()` de forma independiente cuando ya está renderizado dentro de `LibraryScreen`, que también instancia el mismo hook. Resultado: dos sets simultáneos de listeners Socket.io (`sync:progress`, `sync:complete`, `sync:error`) + dos timers de gracia + dos intervals de polling fallback cuando el socket está silencioso. Las invalidaciones de caché se duplicaban pero TanStack Query las deduplicaba. **Arreglado**: `useSyncProgress` eliminado de `SyncStatusBar`; el hook acepta ahora `isRunning: boolean` como prop; `LibraryScreen` pasa el valor que ya tenía. Tests actualizados. | `apps/mobile/components/SyncStatusBar.tsx`, `apps/mobile/app/(tabs)/index.tsx` | ✅ S4 | S4 |
| A43 | Móvil / Zustand | 🔵 | 5 hooks usaban `useSessionStore()` sin selector (`useInterstitialAd`, `useRewardedAd`, `useCompletedGamesInterstitial`, `useWrappedInterstitial`, `useMyGames`). Sin selector, Zustand re-renderiza el componente en cada cambio de cualquier campo del store. El store solo tiene 3 campos (`user`, `accessToken`, `isAuthenticated`), pero `user` se actualiza después de cada sync (XP/nivel) causando re-renders innecesarios en los hooks de AdMob. **Arreglado**: selectores precisos (`(s) => s.user?.isPremium ?? false` o `(s) => s.isAuthenticated`) en los 5 hooks. | `apps/mobile/hooks/useInterstitialAd.ts`, `useRewardedAd.ts`, `useCompletedGamesInterstitial.ts`, `useWrappedInterstitial.ts`, `useMyGames.ts` | ✅ S4 | S4 |
| A44 | Móvil / Cloudinary | 🔵 | Avatares y banners se sirven desde Cloudinary a resolución original (sin transformaciones). En la pantalla de perfil, el avatar se muestra a 96×96 pt (288×288 px en 3× screen); el banner a 100 % de ancho × 120 pt. Sin la transformación `c_fill,w_N,h_N,q_auto`, se descarga la imagen original que puede superar 500 KB por un thumbnail. `expo-image` la cachea tras la primera descarga, pero la descarga inicial es innecesariamente pesada para usuarios con conexiones lentas. **Propuesta**: añadir `getCloudinaryThumb(url, w, h)` en `lib/cloudinary.ts` que inyecte los parámetros de transformación en la URL antes de pasarla a `<Image source={{ uri }}>`. Coordinar que el backend devuelva la URL base sin crop, no la URL final. | `apps/mobile/app/(tabs)/profile.tsx`, `apps/mobile/components/LibraryGameCard.tsx` | 🔲 S6 | S4 |
| A45 | Móvil / Calidad | 🔵 | `useSyncStatus` configura `refetchInterval: 60_000` siempre activo para cualquier usuario autenticado. Incluso en periodos de total inactividad (sin sync corriendo) la app hace 1 petición/min a `/api/v1/sync/my-summary`. Impacto acotado (sigue siendo solo 1 req/min), pero una mejora sería usar `refetchInterval` dinámico: `0` (disable) cuando no hay sync activo, `60_000` cuando sí. El estado de sync activo se conoce desde `useSyncProgress`; circular dependency si se importa directamente. **Propuesta**: el endpoint puede devolver un campo `nextCheckIn` (segundos) que el hook use como intervalo dinámico. Diferido. | `apps/mobile/hooks/useSyncStatus.ts` | 🔲 S6 | S4 |

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
| **S3** | Performance backend (Redis, PostgreSQL, queries) | A28 ✅, A29 ✅, A30 ✅, A31 ✅, A32 ✅, A33 🔲, A34 🔲, A35 🔲, A36 🔲, A37 🔲 S6, A38 🔲 S6, A39 🔲 S6, A40 🔲 S6 |
| **S4** | Mobile — memory leaks, fluidez, Socket.io | A42 ✅, A43 ✅, A10 ✅ (adelantado desde S6), A44 🔲, A45 🔲 |
| **S5** | Mobile — seguridad de datos, almacenamiento | — (pendiente análisis profundo) |
| **S6** | Limpieza general (console.log, dead code, docs) | A2, A9, A12, A13, A27, A37–A40, A41, A44, A45 |
