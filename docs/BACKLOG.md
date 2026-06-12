# Backlog priorizado — UnlockHub

> Movido desde CLAUDE.md. Actualizar al final de cada sesión marcando ítems completados con ✅.

## Backlog priorizado

> Actualizar al final de cada sesión marcando ítems completados con ✅.

### 🔴 Bloqueantes — requieren acción del desarrollador

| # | Tarea | Detalle |
|---|---|---|
| P1 | ✅ Migración Prisma en prod | Automática en cada deploy — `npx prisma migrate deploy` en `startCommand` de `railway.json` |
| ~~P2~~ | ✅ Variables Railway configuradas | `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `APP_SCHEME=unlockhub`, `CLOUDINARY_URL`, `ADMIN_SECRET`, `LOGTAIL_SOURCE_TOKEN`, `POSTHOG_API_KEY` — todas en Railway. ✅ Completado |
| ~~P3~~ | ✅ Resend — cuenta + dominio + API key | Configurado — `RESEND_API_KEY` y `RESEND_FROM_EMAIL` en Railway |
| ~~P4~~ | ✅ UMP SDK AdMob | Código integrado — `useGdprConsent.ts` activo, GDPR message ya publicado en AdMob. |
| ~~P4b~~ | ✅ EAS secrets AdMob configurados | Los 4 IDs de producción están en EAS secrets — `HOME_BANNER_ID`, `SEARCH_BANNER_ID`, `INTERSTITIAL_ID`, `REWARDED_ID`. |
| P5 | ✅ Privacy Policy + ToS en URL pública | `docs/privacy-policy.html` + `docs/terms-of-service.html` — GitHub Pages activo, URLs en vivo, datos del desarrollador rellenados. |
| ~~P6~~ | ✅ Google Play Console | Cuenta creada (B7 ✅) — pendiente listing completo antes del submit |
| P7 | ✅ Smoke tests producción — APK #3 completo | APK debug local (build 2026-05-21, 165.7 MB). BUG-3/4/5 re-confirmados ✅. AdMob banners Home+Search ✅. Registro+onboarding ✅. Game detail+Wrapped+perfil público ✅. **BUG-6**: PSN screen muestra flujo NPSSO antiguo (Metro cache stale) — fix: rebuild con `--clean`. Pendiente: vinculación plataformas reales, sync progresivo E2E, Forgot Password (requiere RESEND_API_KEY). |
| B18 | ~~Cuenta RevenueCat + productos + webhook~~ | 🚩 **Diferido a Fase 4** — `FEATURES.premium = false`. El backend está intacto; activar cambiando el flag cuando RC esté configurado. |
| B19 | ~~`EXPO_PUBLIC_REVENUECAT_API_KEY` como EAS secret~~ | 🚩 **Diferido a Fase 4** — no necesario hasta activar `FEATURES.premium = true`. |
| B20 | ~~`REVENUECAT_WEBHOOK_SECRET` en Railway~~ | 🚩 **Diferido a Fase 4** — no necesario hasta activar `FEATURES.premium = true`. |
| T17 | ✅ Verificar que migración gdpr_soft_delete se aplica en Railway | ✅ Verificado en Railway Deploy Logs — 8 migrations found, todas aplicadas incluyendo gdpr_soft_delete |

### 🟡 UX — todas implementadas ✅

| # | Tarea | Estado |
|---|---|---|
| U1 | Ayuda contextual vinculación | ✅ |
| U2 | Centro notificaciones in-app | ✅ |
| U3 | Escudo de racha | ✅ |
| U4 | Filtros en `game/[id].tsx` | ✅ |
| U5 | Wrapped mensual | ✅ |
| U6 | Feedback rate limit 429 | ✅ |
| U7 | Error state en feed | ✅ |
| U8 | Badge solicitudes pendientes | ✅ |
| U9 | Timestamp "última actualización" | ✅ |
| U10 | Sync progresivo: banner + toast en Biblioteca | ✅ |

### 🔵 Técnica

| # | Tarea | Estado |
|---|---|---|
| T1 | Paginación biblioteca | ✅ |
| T2 | Reconexión Socket.io | ✅ |
| T3 | Background sync scheduler | ✅ |
| T4 | ✅ Paginación cursor en feed | ✅ Cursor-based: `getFriendsFeed(userId, limit, cursor?)` devuelve `CursorPaginatedResponse<ActivityEvent>` con `nextCursor`. `useFeed` usa `useInfiniteQuery` con `pageParam` como cursor. |
| T5 | Tests de carga k6 | ✅ |
| T6 | Tests unitarios nuevos servicios | ✅ |
| T7 | Reescribir FeedScreen.test.tsx | ✅ Reescrito correctamente — mockea `useMyGames`; 9 tests pasando |
| T8 | Subir Expo a v55 para vulnerabilidades node-tar | ✅ Completado sesión 56 — Expo 55.0.26, RN 0.83.6, React 19.2.0, reanimated 4.2.1+worklets 0.7.4, flashlist 2.0.2, rn-google-mobile-ads 16.3.3, sentry 7.11.0. 352/352 tests. 0 errores TS/lint. |
| T9 | Resolver 145 warnings import/order en API | ✅ Resuelto — `eslint --fix` + override en `.eslintrc.js` para ficheros de test |
| T10 | Flows Maestro E2E | ✅ 5 flows en `apps/mobile/.maestro/` — todos pasando contra emulador Android con APK preview |
| T11 | Search de logros + endpoint logros de juego | ✅ Backend `GET /api/v1/games/:id/achievements` + `GET /api/v1/search?type=achievements` — JWT opcional, Xbox excluido, paginado 20/pág |
| T12 | Job "seed de logros populares" | ✅ Completo — BD producción (post-limpieza PL13, sesión 59): **2.878 juegos + 134.928 logros**. Seed inicial: 1.406 juegos (78 Steam + 1.001 RA + 327 PSN) + 72.264 logros. Bugs PSN corregidos: guard `trophies ?? []` + refresco token cada 5 usuarios. Campo `console` backfilled: RA (1.001 juegos) + PSN (584 juegos). Flag `--only-steam --usernames="X"` implementado en `scripts/seed-games.ts`. **Seithek Steam**: 0 juegos obtenidos — perfil de Steam privado (`GetOwnedGames` devuelve lista vacía). Hacer público en Configuración de Steam para seedear. |
| T13 | Sync optimization: skip completed RA games | 🔲 El parallel RA batches (F15 ✅) ya está implementado con `RA_PROCESS_CONCURRENCY=3` + `Promise.allSettled`. Lo que queda es "skip completed": saltar juegos donde el usuario ya tiene todos los logros para evitar llamadas innecesarias a la API. Diferido: riesgo de perder logros de DLC añadidos post-sync. Documentado en DECISIONS.md. |
| T14 | Desnormalizar contadores de biblioteca (`earnedAchievements`, `totalGames`) | 🔲 Diferido. A la escala actual (<10k UserAchievements por usuario típico) el cálculo en JS sobre la query indexada por `userId` es eficiente. Solo aporta valor real para power users con >100k achievements (PSN con 2000+ juegos × 50 trofeos) — caso hipotético con el catálogo actual (134.928 logros totales en 2.878 juegos). Requiere migración Prisma + lógica de actualización en los 3 adapters. Ver DECISIONS.md. |
| T15 | Steam skip-completed optimization via `rtime_last_played` | 🔲 `GetOwnedGames` devuelve `rtime_last_played` (Unix timestamp) por juego. Usarlo para saltar juegos sin actividad reciente reduciría llamadas a Steam. No implementado: requiere añadir `lastPlayedAt` al modelo de caché Redis + interfaz `GameCacheEntry`, con riesgo de saltar achievements de DLC. Documentar como pendiente post-lanzamiento. |
| T16 | ✅ Backfill RA XP con fórmula correcta | Script `scripts/backfill-ra-xp.ts` creado e idempotente — ejecutado en producción. 48.865 logros RA procesados — 29.419 actualizados (fórmula vieja `min(100, max(1, points))` → correcta `max(5, round(points/5))`), 28.583 saltados (ya correctos), 0 errores. XP de usuarios se corregirá gradualmente en próximo sync automático. |
| T17 | BUG-CRÍTICO-1/2 + BUG-MEDIO-3/4 corregidos | ✅ Sesión 31: soft delete GDPR, email eliminado de perfil público, RA syncUserExpress con Promise.allSettled, deletedAt:null filters, gdpr-cleanup scheduler, authenticate con DB check, rankings RefreshControl fix, upsertUserScore paralelo, useSubscription RC CustomerInfo |
| T18 | ✅ Migración Prisma gdpr_soft_delete en producción | ✅ Verificado en Railway Deploy Logs — 8 migrations found, todas aplicadas incluyendo gdpr_soft_delete |
| T19 | BUG-1: biblioteca no carga sort completo al abrir | ✅ useEffect([isLoading]) en index.tsx — sesión 34 |
| T20 | BUG-2: pull-to-refresh pierde páginas con sort activo | ✅ handleRefresh llama fetchAllRemainingPages cuando sort activo — sesión 34 |
| T21 | BUG-3: rankings PSN XP desincronizado entre "mi posición" y lista | ✅ getUserRank lee sorted set correcto por plataforma — sesión 34 |
| T22 | BUG-4: vinculación plataformas no bloqueaba perfil privado | ✅ PSN/RA/Steam devuelven 400 con código descriptivo antes de vincular — sesión 34 |
| T23 | BUG-1: FriendshipButton no aparecía en perfil público | ✅ Fallback a "Añadir amigo" en error de red; spinner durante hidratación de sesión — sesión 36 |
| T24 | BUG-2: búsqueda mostraba propio usuario + redirect incorrecto al propio perfil | ✅ searchUsers excluye userId autenticado; profile/[username] redirige a tab Profile si username coincide — sesión 36 |
| T25 | BUG-3: biblioteca no cargaba páginas completas al abrir con caché | ✅ initialLoadDoneRef con deps completas — cubre caso con y sin caché — sesión 36 |
| T26 | BUG-4: rankings plataforma mostraban XP total en "Mi posición" | ✅ Fix completo sesión 38 — 4 puntos rotos: `getUserRank` sin platform, controller sin `?platform`, `useMyRanking` sin platform, `rankings.tsx` sin argumento. `ranking.controller.test.ts` (8 tests) + 3 tests RankingsScreen banner PSN/RA |
| T27 | ✅ Fetch achievements on-demand al pulsar juego con 0 logros en Search | ✅ `POST /api/v1/games/:id/fetch-achievements` — `fetchAndUpsertGameAchievements` en `games.service.ts`; guard 24h si `totalAchievements > 0`; Steam: `GetSchemaForGame` + `GetGlobalAchievementPercentagesForApp`; RA: `API_GetGameInfoAndUserProgress.php` con credenciales del sistema; PSN: no-op (PSN siempre llega con logros desde sync). Mobile: botón "Cargar logros" en `game/[id].tsx` cuando `totalAchievements === 0` y usuario autenticado; loading state; invalidación de query post-fetch. |
| T28 | FIX-1: biblioteca carga páginas completas al volver del background | ✅ `initialLoadDoneRef.current = false` en mount + AppState handler — sesión 37 |
| T29 | FIX-2: deduplicación juegos en useMyGames | ✅ `Set<string>` filtra solapamientos entre páginas — sesión 37 |
| T30 | FIX-3: optimistic update FriendshipButton | ✅ `onMutate` en `sendRequest`/`cancelOrRemove`/`accept` — cambio instantáneo con rollback en error — sesión 37 |
| T31 | FIX-4: empty state "Tus juegos aparecerán pronto" incorrecto tras desvincular | ✅ `unlinkMutation.onSuccess` invalida `['sync-summary']` — sesión 37 |
| T32 | FIX-5: búsqueda de logros eliminada del Search | ✅ `search.tsx` solo busca juegos y usuarios — hook y endpoint backend intactos para T27 — sesión 37 |
| T33 | FIX-6: contador "0 logros" ocultado en GameCard | ✅ Omitido cuando `totalAchievements === 0` — sesión 37 |
| T34 | Rankings: banner "Tu posición" mostraba XP total en filtros de plataforma | ✅ Triple fix: getUserRank lee sorted set correcto, queryKey incluye platform, URL incluye ?platform — sesión 38 |
| T35 | BUG-1: lista no ordenada al entrar ni en pull-to-refresh para sort last_played | ✅ Eliminado early return y condición en useEffect y handleRefresh — todos los sorts cargan todas las páginas — sesión 39 |
| T36 | BUG-2: library.new_games_banner aparecía como texto literal | ✅ Selección explícita de clave _one/_other en NewGamesBanner.tsx — sesión 39 |
| T37 | Steam sync falla con rawValue/rarity string en lugar de Float | ✅ `parseFloat(String(rawRarity))` + guard `isNaN` en ambos loops de logros · guard `startsWith('http')` en `iconUrl` — sesión 40 |
| T38 | Deploy Railway fallaba: gdpr-cleanup.scheduler.ts usaba conexión Redis incompatible con BullMQ Worker | ✅ `createWorkerConnection()` en lugar de `redis` directo — sesión 41 |
| T39 | Bug: juegos de plataforma desvinculada seguían en biblioteca | ✅ unlinkPlatform usaba relation filter no fiable en Prisma — fix con IDs explícitos del findMany previo — sesión 43 |
| T40 | Eliminar NewGamesBanner — intrusivo e inexacto en pull-to-refresh | ✅ Componente, tests, claves i18n y lógica eliminados completamente — sesión 43 |
| T41 | Sync secuencial por usuario — evita "No se pudo cargar la biblioteca" durante syncs simultáneos | ✅ Lock Redis `sync:user-lock:{userId}` con reencolado · concurrencia global intacta · sesión 44 |
| T42 | Empty state "Tus juegos aparecerán pronto" incorrecto al desvincular con varias plataformas | ✅ `refetchQueries` forzado + skeleton durante `isFetching` — sesión 44 |
| T43 | Lock de sync no cubría `triggerExpressSync` — Steam+PSN express simultáneos al onboarding | ✅ `triggerExpressSync` adquiere `sync:user-lock:{userId}` con TTL 120s; omite si lock tomado — sesión 45 |
| T44 | ✅ **CODE SMELL**: Duplicación `uploadAvatar`/`uploadBanner` en `user.controller.ts` | `makeUploadHandler(serviceMethod)` factory — `uploadAvatarHandler` y `uploadBannerHandler` son ahora `const` derivados. Sesión 63 |
| T45 | ✅ **CODE SMELL**: Duplicación `uploadAvatar`/`uploadBanner` en `upload.middleware.ts` | `createUploadMiddleware(field)` factory — las dos exportaciones son `createUploadMiddleware('avatar')` y `createUploadMiddleware('banner')`. Sesión 63 |
| T46 | ✅ **CODE SMELL**: QueryKeys dispersas en múltiples hooks (no centralizadas) | `lib/queryKeys.ts` con 30+ claves tipadas. Reemplazados todos los usos en 15 hooks + 12 screens. Fix colateral: `profile.tsx` invalidaba `['my-stats']` (no-op) — corregido a `queryKeys.userStats()`. Sesión 63 |
| T47 | ✅ **CODE SMELL**: Debounce duplicado en `useSearch.ts` y `useSearchAchievements.ts` | `hooks/useDebounce.ts` con `useDebounce<T>(value, delay)` — elimina `timerRef` y `useEffect` en ambos hooks. Sesión 63 |
| T48 | ✅ **CODE SMELL**: IDs de test de AdMob hardcodeados en 3 ficheros | `lib/adUnits.ts` con `ADMOB_TEST_IDS` (BANNER, INTERSTITIAL, REWARDED). Sesión 63 |
| T49 | ✅ **CORREGIDO**: `background-sync.scheduler.ts` condición `gte` → `lte` en `lastSyncAt` | Bug confirmado: `gte: oneDayAgo` sincronizaba usuarios que SÍ habían sincronizado recientemente (opuesto al objetivo). Corregido a `lte: oneDayAgo` — ahora sincroniza usuarios que llevan más de 24h sin sincronizar. Sesión 56 |
| T50 | ✅ **COBERTURA TESTS**: Auth — tests de refresh token de usuario con soft delete | Añadidos en `auth.routes.test.ts`: (1) `POST /refresh` 401 cuando tokens revocados por `deleteAccount`; (2) `GET /me` 401 ACCOUNT_DELETED cuando `findUnique` con `deletedAt:null` devuelve null. Mock de `prisma.user.findUnique` añadido al fichero. Sesión 56 |
| T51 | ✅ **COBERTURA TESTS**: Points — test de race condition en `claimRewardedAdPoints` | Añadido en `points.service.test.ts`: dos llamadas simultáneas con `Promise.allSettled`, solo la primera adquiere lock (`SET NX` devuelve `'OK'`), la segunda recibe `REWARDED_AD_COOLDOWN` 429. `mockCreate` llamado exactamente 1 vez → saldo +10 no +20. También corregidos los tests previos para reflejar la firma `SET NX EX` de 5 args. Sesión 56 |
| T52 | ✅ Cachear datos de juegos para acelerar carga de biblioteca | Sesión 54 — `game-cache.ts`: clave `game:meta:{platform}:{externalId}` TTL 24h; adapters PSN/RA/Steam comprueban caché antes de cada `game.upsert`; syncs repetidos no generan escrituras a PostgreSQL para juegos ya conocidos. |
| T53 | ✅ Fix crash por sync largo | Sesión 54 — 4 fixes: `syncProgressKey` en `finally` de `sync.worker.ts`; guard `MAX_PAGES=10` en `fetchUserTitles` de `psn.adapter.ts`; claves stale RA con TTL 7 días en `retroachievements.adapter.ts`; throttle 15s en handler socket de `useSyncProgress.ts`. |
| T54 | ✅ Refactor general post-lanzamiento (T44–T48) | ✅ Sesión 63 — BUILD_LOCAL.md duplicado eliminado. `createUploadMiddleware()` factory (T44/T45). `lib/queryKeys.ts` con 30+ claves centralizadas (T46). `hooks/useDebounce.ts` (T47). `lib/adUnits.ts` `ADMOB_TEST_IDS` (T48). Fix bug colateral: `['my-stats']` → `['user-stats']` en `profile.tsx`. 593/593 API · 364/364 mobile. 0 errores TS/lint. |
| T55 | ✅ Fix edge-to-edge Android 15 — contenido desplazado hacia arriba | Sesión 54 — todos los tabs cambiados a `edges={['left', 'right']}` en `SafeAreaView`; el header de React Navigation gestiona el inset superior y el tab bar el inferior. Sin el fix, `targetSdkVersion=35` contaba el safe area inset del status bar dos veces. |
| T56 | ✅ Fixes de seguridad sesión 53 | ✅ En develop — `xbox.adapter.ts`: doble cifrado AES-256-GCM eliminado · `search.service.ts`: filtro `deletedAt: null` añadido en `searchUsers` · `user.service.ts`: revocación `RefreshToken`s añadida a transacción de borrado de cuenta |
| T57 | ✅ Modo claro UI | ✅ Implementado en rama `feat/t57-light-mode` — `lib/colors.ts` (darkColors/lightColors), `hooks/useTheme.ts`, `preferencesStore.theme: 'dark'|'light'`, selector de tema en profile.tsx (🌙/☀️ activo). 22 ficheros actualizados: 9 componentes globales + 5 tabs + 3 pantallas. Inline styles reemplazan clases NativeWind hardcoded. 364/364 tests ✅, 0 errores TS/lint. |
| T58 | ✅ Fix `platformAccount.update` → `upsert` (race condition P2025) | Sesión 69 — 6 ocurrencias en `retroachievements.adapter.ts`, `sync.service.ts`, `xbox.adapter.ts` y `sync.worker.ts`. Durante syncs concurrentes del mismo usuario, un `update` podía recibir error P2025 "Record to update not found" si otro job había borrado/recreado el registro en paralelo. El `upsert` es idempotente y resuelve la race condition. |
| T59 | ✅ V3 — Workers BullMQ separados a `apps/worker` (proceso Railway dedicado) | Sesión 69 — nuevo `apps/worker/src/index.ts` arranca sync, streak, challenge, gdpr-cleanup, seed-catalog workers + schedulers con cierre limpio `SIGTERM`/`SIGINT`. `apps/api/src/index.ts` limpiado de workers. Servicio `unlockhub-worker` en Railway con 14 Shared Variables. Fallback: `getIOSafe()` desde worker devuelve null — Socket.io usa polling Redis. Para eventos en tiempo real: añadir `@socket.io/redis-emitter`. |
| T60 | ✅ Fix worker Railway — Dockerfile propio + Config File Path | Sesión 70 — `apps/worker/Dockerfile` (build multi-stage, tsx runtime, WORKDIR /app). `apps/worker/railway.json` como Config File Path en Railway dashboard. `railway.json` raíz: `preDeployCommand` simplificado a `npx prisma migrate deploy` (sin `cd apps/api` — el Dockerfile raíz ya tiene `WORKDIR /app/apps/api`). package-lock.json regenerado con @unlockhub/worker@0.0.1. API: 10 migrations found, arrancada port 8080. Worker: todos los schedulers BullMQ activos, syncs procesándose. |
| T61 | ✅ BUG-A fix unlinkPlatform — invalidar caché Redis pública tras desvincular | Sesión 70b — `invalidateUserPublicCache(userId)` añadido en `platform.service.ts` después de cancelAutoSync. Sin el fix, la caché `user-games:*` permanecía 5 min con juegos de la plataforma desvinculada. Test añadido en `platform.service.test.ts`. |
| T62 | ✅ BUG-B fix edge-to-edge `app/user-game/[username]/[gameId].tsx` | Sesión 70b — `edges={['top','left','right']}` (antes solo `['left','right']`). Root layout tiene `headerShown: false`, sin header de React Navigation el contenido subía bajo el status bar. |
| T63 | ✅ BUG-C fix edge-to-edge `app/(tabs)/profile.tsx` | Sesión 70b — `edges={['left','right']}` añadido al SafeAreaView principal (línea 358). Sin `edges`, el default incluye `top` duplicando el inset ya gestionado por el header del Tabs navigator. |
| T64 | ✅ BUG-D fix orden biblioteca usuario público — lastActivityAt DESC | Sesión 70b — `getMyGames` ordena por `lastActivityAt DESC` (null last) en lugar de alfabético. La biblioteca propia re-ordena en cliente; la pública mostraba juegos en orden incorrecto. Test actualizado. |
| T65 | ✅ Auditoría calidad apps/mobile — 17 fixes (socket leaks, i18n duplicados, param guards, AsyncStorage, queryKeys, SafeAreaView, AdMob events) | Sesión 70c — commit dea6cbd |
| T69 | ✅ Segunda auditoría completa apps/mobile — 17 fixes AdMob lifecycle, i18n PremiumBanner, queryKeys rankings, socket guards, AsyncStorage timing | Sesión 71 — commit 0503d55 |
| T70 | ✅ Fix uploadFile — XMLHttpRequest para multipart en React Native (avatar y banner) | Sesión 72 — commit uploadFile |
| T71 | ✅ Fix ruta rewarded-ad — '/api/v1/points/rewarded-ad' → '/api/v1/users/me/points/rewarded-ad' | Sesión 72 — commit 7023e7d |
| T72 | ✅ Fix bannerMutation — actualiza store sesión en tiempo real tras upload | Sesión 72 |
| T73 | ✅ Fix loginHandler/meHandler — devuelven perfil completo con avatar, banner y todos los campos | Sesión 72 — commit 01e00f9 |
| T74 | ✅ Fix banner no se actualizaba en tiempo real tras subida — bannerMutation.onSuccess ahora actualiza el store Zustand + invalida queryKeys.me(), simétrico a avatarMutation | Sesión 73 |
| T75 | ✅ CVEs ws + tar — `npm audit fix` (A1/A8) | ✅ S1 — ws runtime 8.x→8.20.1 (engine.io 6.6.7→6.6.8, socket.io-adapter 2.5.6→2.5.7); express 4.22.1→4.22.2, qs y brace-expansion bumpeados. Socket.io verificado post-upgrade. tar (A2) no resuelto con --force — diferido a S6. |
| T76 | ✅ `webhooks.controller.ts:46` — `token !== secret` → `crypto.timingSafeEqual()` (A3) | ✅ S1 — `Buffer.from(sha256(a))` vs `Buffer.from(sha256(b))` con `crypto.timingSafeEqual()`. Tests: prefijo-corto y sufijo-largo añadidos. |
| T77 | ✅ `getMyRankHandler` — validar `platform` query con `platformSchema.parse()` (A6) | ✅ S1 — `platformSchema.parse(req.query['platform'])` + test plataforma inválida → 400. |
| T78 | ✅ Upload middleware — validación magic bytes además de MIME type (A5) | ✅ S1 — `validateFileMagicBytes` con firmas manuales JPEG `FF D8 FF`, PNG `89 50 4E 47 0D 0A 1A 0A`, WebP `RIFF/WEBP`. Sin deps externas nuevas. 6 tests añadidos. |
| T79 | ✅ `no-floating-promises` / `no-misused-promises` en ESLint (A7) | ✅ S1 — `apps/api/.eslintrc.js` + `tsconfig.eslint.json` (incluye tests). Fix real encontrado: `io.close()` (socket.io 4.8.3 devuelve `Promise<void>`) → `await io.close()` en SIGTERM handler. |
| T80 | Eliminar 7 `console.log` debug de producción en móvil (A10) | 🔲 S6 — `useRewardedAd.ts` (×4), `profile.tsx` (×1), `api.ts` (×1). Usar `logger` (pino) o eliminar. |
| T81 | Silenciar falso positivo `security/detect-unsafe-regex` en `useWrapped.ts:15` (A9) | 🔲 S6 — Añadir `// eslint-disable-next-line security/detect-unsafe-regex` con comentario de justificación. |
| T82 | `authenticate` middleware: documentar el trade-off del catch bypass (A4) | 🔲 S1 — Añadir comentario explícito sobre el riesgo aceptado y logging estructurado del evento para trazabilidad. |
| T83 | ✅ Auditoría S1 — Seguridad backend completa | ✅ A1/A3/A5/A6/A7/A8/A14-A19 resueltos. A20 descartado (mitigado por authRateLimiter). A4/A21 ⚙️ pendientes de verificación. A2 diferido a S6. Ver `docs/AUDIT.md` para detalle completo. Tests: 620 API (+9) · 387 mobile · 0 TS/lint. |
| T84 | ✅ Auditoría S2 — Sync e integraciones externas | ✅ A4 verificado: token corrupto/expirado siempre → 401 (catch aislado a errores de BD). A21 verificado: cooldown Redis SET NX es la primera op de `triggerManualSync`. A23 ✅: `timeout: 10_000` añadido a 6 fetchers de Steam (4 en `getUserAchievements` + 2 en `fetchSteamAchievementDefinitions`). A24 ✅: **bug crítico** — contador `steam:api:calls:<date>` nunca se incrementaba (protección del 80% estaba inactiva); `incrementSteamApiCounter()` con `redis.incr` + TTL 48h añadido en todos los fetchers reales (cache misses). A25 ✅: `timeout: 15_000`/`10_000` + `XBOX_MAX_PAGES=20` en `xbox.adapter.ts`. A26 ✅: `?? []` guards en `earnedRes.trophies` y `titleTrophiesRes.trophies` en `psn.adapter.ts`. A27 🔲 diferido a S6: timeout en llamadas psn-api (requiere wrapping de librería externa). Tests: 620 API · 387 mobile · 0 TS/lint. |
| T85 | ✅ Auditoría S3 — Rendimiento backend y capa de datos | ✅ A28: `upsertUserScore` 4 queries → 1 (`getPlatformXpMap`). A29/A32: `select` explícito en `getUserGameAchievements`, `getProfile` y `getPublicProfile` — cierra fuga PII (`passwordHash`/`birthDate`/`role`/`deletedAt` fuera del fetch). A30: TTL deslizante 20 min en `USER_GAMES_KEYS_SET`. A31: `invalidateUserPublicCache` en `deleteAccount` — limpieza GDPR completa en Redis. A33–A36 🔲: migraciones de índices compuestos listas (`UserAchievement`, `ActivityEvent`, `Friendship`, `User`) — aplicar con `CREATE INDEX CONCURRENTLY` en ventana de lanzamiento. A37–A40 diferidos a S6. A41 identificado (discrepancia umbrales Steam 80/90% en docs vs código). Tests: 620 API · 387 mobile · 0 TS/lint. |

### 🟢 Features

| # | Tarea | Estado |
|---|---|---|
| F1 | Estadísticas avanzadas (premium) | ✅ |
| F2 | Canje de puntos por premium | ✅ |
| F3 | Compartir logro | ✅ |
| F4 | Comparación de perfiles | ✅ |
| F5 | Push al desbloquear logro | ✅ |
| F6 | Retar a un amigo en logro | ✅ |
| F7 | Guías UGC de logros | ✅ |
| F8 | Avatar upload | ✅ Backend Cloudinary + mobile expo-image-picker — activo en prod (`CLOUDINARY_URL` configurada en Railway ✅) |
| F9 | Dashboard admin | ✅ |
| F10 | ✅ OG profiles | ✅ `GET /api/v1/users/:username/og` devuelve HTML con meta tags Open Graph (title, description, image, url). PRIVATE → 404. Share button en `profile/[username].tsx` comparte `https://unlockhub.app/u/{username}`. |
| F11 | Búsqueda de logros con filtro de plataforma | 🔲 Eliminado del Search tab en sesión 37 — hook `useSearchAchievements` y endpoint `GET /api/v1/search?type=achievements` intactos para uso futuro (T27) |
| F12 | SyncStatusBar — feedback de sync en biblioteca | ✅ Botón sync, syncs restantes (free), cooldown countdown, última sync, próximo auto sync |
| F13 | Activar premium + RevenueCat | 🟡 Alta — Fase 4. Código 100% intacto. Pasos: (1) completar B18/B19/B20 · (2) `FEATURES.premium = true` en `featureFlags.ts` · (3) `FEATURES.pointsRedeem = true` · (4) `FEATURES.advancedStats = true`. `react-native-purchases` v10, `usePremiumPlans`, `useSubscription`, `useRevenueCat`, `premium.tsx`, webhook backend — todo listo. |
| F14 | PSN sync paralelo — `Promise.allSettled` con concurrencia 5 | ✅ `processSingleTitle()` extraído; `processTitles()` procesa chunks de 5 en paralelo con aislamiento de fallos por título |
| F15 | RA sync paralelo — `Promise.allSettled` con concurrencia 3 | ✅ `syncUser()` y `syncUserBatched()` procesan chunks de 3 juegos en paralelo con `Promise.allSettled` |
| F16 | SyncStatusBar — countdown local + aviso sync largo | ✅ Countdown `setTimeout`-chain independiente del `refetchInterval` 60s; aviso ámbar tras 30s de sync activo |
| F17 | Onboarding paso 4 — CTAs de vinculación de plataformas | ✅ Paso 4 con botones Steam/PSN/RA → `router.replace('/link-platform/[x]')`, CTA secundario "Hacer esto más tarde" |
| F18 | FriendshipButton consciente del estado de relación en perfil público | ✅ 5 estados (none/pending_sent/pending_received/accepted/blocked) · GET /api/v1/friends/status/:username · confirmación Alert en eliminar · sesión 35 |
| F19 | Banner upload (Cloudinary) | ✅ POST /api/v1/users/me/banner · Pressable 120px en profile.tsx · aspect 3:1 · crop/fill 1500×500 · sesión 42 |
| F20 | ✅ Ampliar placements de AdMob | ✅ Sesión 55. Banner Rankings (`unitId='rankings'`) + Banner Friends (`unitId='friends'`) integrados. `useWrappedInterstitial` (cooldown 24h AsyncStorage) en `wrapped/[year].tsx`. `useCompletedGamesInterstitial` (AsyncStorage por gameId) en `index.tsx`. `AdBanner` type ampliado a `'home'\|'search'\|'rankings'\|'friends'`. `.env.example` actualizado con los 6 IDs. ✅ Ad units `unlockhub_rankings_banner` + `unlockhub_friends_banner` creados en AdMob Console. ✅ EAS secrets `EXPO_PUBLIC_ADMOB_RANKINGS_BANNER_ID` + `EXPO_PUBLIC_ADMOB_FRIENDS_BANNER_ID` configurados en expo.dev. |
| F21 | ✅ Ver logros de otros usuarios + comparativa | ✅ Implementado sesión 61. `GET /:username/games` + `GET /:username/games/:gameId/achievements` con `authenticateOptional` y privacidad F29. `app/user-game/[username]/[gameId].tsx`: toggle "Sus logros"/"Comparar". Sección Biblioteca en `profile/[username].tsx`. `useUserGames` + `useUserGameAchievements`. Tests: 593 API + 364 mobile. |
| F22 | Activar retos semanales (`FEATURES.challenges = true`) | 🟠 Media — Fase 4. Backend `WeeklyChallenge` + `UserChallenge` + scheduler + workers implementados. Solo requiere cambiar el flag y crear retos iniciales en BD. |
| F23 | Activar canje de puntos (`FEATURES.pointsRedeem = true`) | 🟠 Media — Fase 4. Endpoint `POST /api/v1/subscriptions/redeem-points` implementado. Activar junto a `FEATURES.premium`. |
| F24 | Activar estadísticas avanzadas (`FEATURES.advancedStats = true`) | 🟠 Media — Fase 4. Pantalla y datos implementados. Activar junto a `FEATURES.premium`. |
| F25 | Xbox — vinculación y sync | 🔵 Cuando el volumen lo justifique — Fase 4. `xbox.adapter.ts` implementado y gateado. Requiere OAuth2 Microsoft Identity Platform + verificación de empresa + `XBOX_CLIENT_ID`/`XBOX_CLIENT_SECRET` en Railway. |
| F26 | App Store iOS | 🟢 Largo plazo — Fase 4. Apple Developer Program $99/año (V4). Requiere cuenta + certificados + TestFlight + listing App Store. |
| F27 | Torneos internos | 🟢 Largo plazo — Fase 4. Consultar abogado antes de implementar (Ley 13/2011 — juegos de azar España). Solo recompensas en puntos/días premium. |
| F28 | ✅ Mostrar versión de la app en perfil | ✅ `expo-constants` — texto "Versión {{version}} ({{build}})" al pie de la sección de ajustes en `profile.tsx`. i18n ES/EN. `testID="app-version"`. |
| F29 | ✅ Privacidad de perfil (3 niveles) | ✅ Implementado sesión 60. Prisma: `ProfileVisibility` enum + `User.profileVisibility @default(PUBLIC)` + migración. Backend: `getPublicProfile` (PRIVATE→404, FRIENDS_ONLY→403 si no es amigo), `compareProfiles` respeta visibilidad, `updateProfile` sincroniza Redis al cambiar, `upsertUserScore` omite zadd si no PUBLIC, `authenticateOptional` en `GET /users/:username`. Mobile: selector inline 3 opciones en ajustes de perfil, perfil público diferencia 403 vs 404. i18n ES/EN. 575/575 API · 355/355 mobile · 0 errores TS/lint. |

### 🔶 Post-lanzamiento — Verificaciones pendientes

| # | Tarea | Detalle |
|---|---|---|
| PL12 | ✅ Declaración Data Safety actualizada para PostHog | PostHog (N4) está activo desde el lanzamiento — se ha declarado en el formulario de Seguridad de los datos. Si se cambia el proveedor de analítica en Fase 4, actualizar la declaración para reflejar el cambio. |
| PL13 | ✅ Limpieza de usuarios de prueba antes de abrir a Producción pública | ✅ **Ejecutado en producción (sesión 59)**. 7 usuarios de prueba eliminados (SmokeTest3, test, testuser123, testuser456, Seithek, Joels, testuser1234). Preservados: `TestUser99` (revisión Google Play) y `Sovelyss` (cuenta desarrollador). 7.684 UserAchievements + 17 RefreshTokens + datos asociados eliminados. Catálogo intacto: 2.878 juegos + 134.928 logros. Redis rankings dejados para regeneración natural (URL interna no accesible desde local). Script soporta múltiples `--preserve-username`: `npx ts-node ../../scripts/cleanup-test-users.ts --preserve-username=TestUser99 --preserve-username=Sovelyss`. |
| PL14 | ✅ Edge-to-edge Android 15 validado en dispositivo físico | `edges={['left', 'right']}` en SafeAreaView de todos los tabs (sesión 54). Validado en dispositivo físico con Android 15 — contenido correctamente acotado por el header de React Navigation (top) y tab bar (bottom). Sin doble inset de status bar. |
| PL16 | ✅ Índices PostgreSQL de rendimiento en User | `createdAt`, `isPremium`, `lastSyncAt` — usados por admin.service y background-sync.scheduler. Migración `20260607000000_add_user_performance_indexes`. |
| PL17 | ✅ Caché Redis para endpoints F21 (`/users/:username/games` y `/users/:username/games/:gameId/achievements`) | TTL 5 min, invalidación en sync completion + cambio de profileVisibility. `invalidateUserPublicCache()` exportada. |
| PL18 | ✅ Bundle optimization: @expo/vector-icons imports directos | 11 archivos migrados de barrel `{ Ionicons } from '@expo/vector-icons'` a `Ionicons from '@expo/vector-icons/Ionicons'` — elimina glyph maps de FontAwesome (96 menciones), MaterialIcons, AntDesign, Feather, etc. Sentry @sentry-internal/replay+feedback: incluidos por @sentry/browser, no eliminables sin upgrade de SDK — revisar en Fase 4. |
| PL15 | ✅ Merge develop → main antes de promover a Producción | ✅ Completado sesión 59 — `git merge --no-ff develop` + `git tag v1.0.0` + push. main refleja exactamente el código de producción. |
| PL19 | ⚙️ Smoke tests realizados — 4 bugs detectados y corregidos (T61-T64). Re-verificar con nueva build antes de promover a Producción. | Bugs corregidos: BUG-A (caché Redis tras unlink), BUG-B (edge-to-edge user-game), BUG-C (edge-to-edge profile tab), BUG-D (orden biblioteca usuario público). Pendiente: build nueva + re-verificar login + registro + sync Steam/RA/PSN + biblioteca + rankings + perfil público + Wrapped. Confirmar que no hay errores 5xx en Railway logs. Auditoría completa realizada sesión 70c — 23 issues detectados y corregidos. v1.2.4 en preparación — segunda auditoría completa aplicada, 0 errores TS/lint, 989/989 tests. Sesión 72: avatar upload ✅, banner upload ✅, rewarded ad puntos ✅ (ruta incorrecta corregida), login con avatar/banner ✅. Pendiente verificar en build de producción: edge-to-edge BUG-B user-game. |

### 🎨 Sistema de cosméticos y economía de puntos

> Diseño aprobado en sesión 70. Implementar en Fase 3/4 cuando el sistema de puntos tenga utilidad real.

**Estado general**: 🔲 Pendiente de implementación

**Decisiones de diseño tomadas:**
- Duración de todos los cosméticos: 90 días
- Puntos por retos semanales: Fácil 100 pts · Medio 200 pts · Difícil 400 pts
- Apuestas: cooldown 1 vez/día por usuario concreto + máx 3 cada 3 días en total · máximo 50 pts apostables
- Hitos de racha: 7 días → 50 pts · 30 días → 200 pts · 100 días → 500 pts · 365 días → 1.500 pts
- Multiplicador de puntos: descartado

**Cosméticos y costes:**

Marcos de avatar (90 días):
- Bronce: 200 pts
- Plata: 500 pts
- Oro: 1.000 pts
- Platino: 2.000 pts

Colores de nombre (90 días):
- Comunes (azul, verde, amarillo): 200 pts
- Poco comunes (naranja, morado): 500 pts
- Raros (rojo, cyan): 800 pts
- Legendario (degradado dorado): 1.500 pts

Títulos (90 días) — lista provisional, revisar antes de implementar:
- Comunes (150 pts): "Cazador de Logros", "Empezando el Viaje", "Coleccionista", "Sin Vida Social", "Jugador Casual"
- Poco comunes (400 pts): "Completista", "Retro Gamer", "Trofeo Adicto", "Achievement Hunter", "Imparable", "Madrugador"
- Raros (800 pts): "Leyenda", "El Platino o Nada", "100% o Nada", "Maestro Retro", "No Tengo Vida", "Top 1", "Dios de los Logros"

**Features a implementar:**
| # | Feature | Estado |
|---|---|---|
| F30 | Marcos de avatar con duración 90 días (Bronce/Plata/Oro/Platino) | 🔲 |
| F31 | Títulos de perfil con duración 90 días — lista provisional, revisar antes de implementar | 🔲 |
| F32 | Color de nombre con duración 90 días (Común/Poco común/Raro/Legendario) | 🔲 |
| F33 | Boost de racha — hitos 7/30/100/365 días con bonus de puntos | 🔲 |
| F34 | Apuestas 1vs1 de puntos en retos — cooldown por usuario + global | 🔲 |
| F35 | Ranking de puntos separado del ranking de XP | 🔲 |
| F36 | Saldo de puntos visible en perfil (actualmente solo en premium.tsx gateado) | ✅ |
| F37 | Rewarded ad accesible desde perfil (actualmente solo en premium.tsx gateado) | ✅ |

---
