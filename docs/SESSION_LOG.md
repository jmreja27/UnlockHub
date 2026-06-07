# Historial de sesiones — UnlockHub

> Movido desde CLAUDE.md. La entrada más reciente va primero.

## Última revisión de código

**Fecha**: 2026-06-07 (sesión 67) — Revisión completa del proyecto (backend + mobile + packages). ~30 archivos revisados: middleware, routes, controllers, services, repositories, jobs, sockets, lib, config, validators, componentes y hooks mobile. Sin bugs críticos encontrados. Corrección menor en CLAUDE.md: eliminada referencia a "login en últimos 7 días" del background-sync.scheduler que no existe en código ni schema (no hay campo `lastLoginAt` en el modelo User). Backlog actualizado: F20 ✅ (EAS secrets Rankings/Friends), PL14 ✅ (edge-to-edge validado en dispositivo físico), PL19 ⚙️ añadido (smoke tests finales antes de promover). Inventario CLAUDE.md verificado — todos los endpoints nuevos (F10, F21, T27, T4) presentes. Tests: 610/610 API ✅ + 368/368 mobile ✅. 0 errores TS/lint.

**Fecha**: 2026-06-07 (sesión 66) — Optimizaciones pre-producción. **PL16**: 3 índices PostgreSQL añadidos al modelo `User` (`createdAt` — admin.service rangos hoy/semana; `isPremium` — admin.service count premium activos; `lastSyncAt` — background-sync.scheduler filtro `lte: oneDayAgo`) + migración `20260607000000_add_user_performance_indexes`. **PL17**: caché Redis TTL 5 min en `getUserGames` y `getUserGameAchievements` (endpoints F21); clave `user-games:{username}:{platform}:{page}:{limit}` y `user-game-ach:{username}:{gameId}:{requestingUserId}`; tracking en Set `user-cache-keys:{userId}`; `invalidateUserPublicCache()` exportada y llamada desde `sync.worker.ts` (al completar sync) y `updateProfile` (al cambiar `profileVisibility`); tests: mock redis en `user.service.test.ts`, mock `invalidateUserPublicCache` en `sync.worker.test.ts`. **PL18**: 11 archivos migrados de barrel `{ Ionicons } from '@expo/vector-icons'` a `Ionicons from '@expo/vector-icons/Ionicons'` — elimina glyph maps de FontAwesome (96 menciones), MaterialIcons, AntDesign, Feather, etc. Sentry `@sentry-internal/replay`+`feedback`+`replay-canvas`: transitivos de `@sentry/browser`, no eliminables sin upgrade de SDK — documentado para Fase 4. Bundle: 22.99 MB. Tests: 610 API + 368 mobile. 0 errores TS/lint.

**Fecha**: 2026-06-07 (sesión 65) — T13, T14, T27 resueltos en rama `feat/t13-t14-t27`. **T13**: parallel RA batches ya implementado como F15 (`RA_PROCESS_CONCURRENCY=3`, `Promise.allSettled`); "skip completed" diferido por riesgo de perder logros de DLC — documentado en BACKLOG. **T14**: desnormalización de contadores diferida a >100k UserAchievements por usuario (escala actual insuficiente para justificar complejidad) — documentado en BACKLOG. **T27 (✅)**: endpoint `POST /api/v1/games/:id/fetch-achievements` — guarda 24h si `updatedAt < 24h && totalAchievements > 0`; `fetchSteamAchievementDefinitions` y `fetchRaAchievementDefinitions` exportadas desde los adapters; nuevo `games.service.ts` con `fetchAndUpsertGameAchievements`; handler en `games.controller.ts`; ruta protegida con `authenticate`; botón "Cargar logros" en `game/[id].tsx` con `useMutation` + invalidación de caché; i18n ES/EN. Tests: 610/610 API ✅ (13 nuevos en `games.routes.test.ts` + `games.service.test.ts`) + 368/368 mobile ✅ (4 nuevos en `GameDetailScreen.test.tsx`). 0 errores TS/lint.

**Fecha**: 2026-06-07 (sesión 64) — F28 + F10 + T4 implementados. F28: versión app en pie de Ajustes en `profile.tsx` usando `expo-constants` + i18n `profile.app_version`. F10: `GET /api/v1/users/:username/og` devuelve HTML Open Graph respetando privacidad F29 (PRIVATE → 404); share button comparte `https://unlockhub.app/u/{username}`. T4: cursor pagination en feed con `id: { lt: cursor }`, `CursorPaginatedResponse<T>` en `packages/types`, `useFeed` migrado a `useInfiniteQuery`. Tests: 597 API + 364 mobile. 0 errores TS/lint.

**Fecha**: 2026-06-05 (sesión 63) — T54 refactor general completado. BUILD_LOCAL.md raíz eliminado (duplicado SDK 51). API: `createUploadMiddleware(field)` factory en `upload.middleware.ts` (T45) + `makeUploadHandler(serviceMethod)` factory en `user.controller.ts` (T44). Mobile: `lib/queryKeys.ts` con 30+ claves tipadas — 15 hooks + 12 screens actualizados (T46); `hooks/useDebounce.ts` hook genérico elimina patrón timerRef duplicado en useSearch/useSearchAchievements (T47); `lib/adUnits.ts` con `ADMOB_TEST_IDS` centraliza los IDs de test de AdBanner, useInterstitialAd y useRewardedAd (T48). Fix colateral: `profile.tsx` invalidaba `['my-stats']` inexistente (no-op silencioso) → corregido a `queryKeys.userStats()`. 39 archivos modificados. Tests: 593 API + 364 mobile ✅. 0 errores TS/lint.

**Fecha**: 2026-06-05 (sesión 62) — T57 modo claro implementado. `lib/colors.ts` con tokens `darkColors`/`lightColors` (10 propiedades: background, surface, surfaceCard, surfaceElevated, text, textSecondary, textMuted, border, primary, separator). `hooks/useTheme.ts` devuelve el set correcto según `preferencesStore.theme`. `preferencesStore` actualizado: `ThemePreference = 'dark' | 'light'` (antes `'dark' | 'system'`); `_layout.tsx` corregido para el nuevo tipo. Selector de tema activado en `profile.tsx` (sección Ajustes) sustituyendo el `{/* TODO Fase 4 */}` — botones 🌙 Oscuro / ☀️ Claro. 22 archivos actualizados: NativeWind gestiona layout/spacing, inline styles dinámicos reemplazan todos los `text-white`/`bg-surface`/etc. hardcoded. i18n ES/EN: `settings_theme`, `theme_dark`, `theme_light`. Test `AchievementSearchCard.test.tsx` actualizado para comprobar `style` en lugar de `className`. Tests: 364/364 ✅. 0 errores TS/lint. Merge `feat/t57-light-mode` → `develop`.

**Fecha**: 2026-06-05 (sesión 61) — F21 ver logros de otros usuarios + comparativa implementada. Nuevos endpoints `GET /api/v1/users/:username/games` y `GET /api/v1/users/:username/games/:gameId/achievements` con `authenticateOptional` y privacidad F29 respetada (PRIVATE → 404, FRIENDS_ONLY → 403 sin amistad). `isUnlockedByMe` permite modo comparación sin endpoint extra — null si sin sesión, bool si autenticado y != usuario visitado. Nueva pantalla `app/user-game/[username]/[gameId].tsx` con toggle "Sus logros"/"Comparar" (toggle solo visible con sesión). Sección "Biblioteca de juegos" en `profile/[username].tsx` con miniaturas de progreso que navegan a `user-game/:username/:gameId`. Hook `useUserGames` reutiliza tipo `LibraryGame`. Tests: 593 API (+18) + 364 mobile (+9). 0 errores TS/lint.

**Fecha**: 2026-06-05 (sesión 60) — F29 privacidad de perfil implementada. Enum `ProfileVisibility` (PUBLIC/FRIENDS_ONLY/PRIVATE) + campo `User.profileVisibility @default(PUBLIC)` + migración Prisma `20260605000000_user_profile_visibility`. `getPublicProfile` y `compareProfiles` respetan visibilidad (PRIVATE → 404 indistinguible, FRIENDS_ONLY → 403 si no hay amistad). Rankings Redis: `upsertUserScore` omite `zadd` si el perfil no es PUBLIC; `updateProfile` sincroniza Redis al cambiar visibilidad. Mobile: selector inline de 3 opciones en sección Ajustes de `profile.tsx`; `profile/[username].tsx` diferencia 403 vs 404 con mensajes localizados. i18n ES/EN completo (10 claves nuevas). `authenticateOptional` en `GET /users/:username` para determinar amistad cuando el visitante no está autenticado. Tests: 575/575 API + 355/355 mobile. 0 errores TS/lint.

**Fecha**: 2026-06-04 (sesión 59 continuación) — Script de limpieza ejecutado en producción. 7 usuarios de prueba eliminados (SmokeTest3, test, testuser123, testuser456, Seithek, Joels, testuser1234), preservados TestUser99 y Sovelyss. Script ampliado para soportar múltiples `--preserve-username` (Prisma `notIn` en lugar de `not`). Redis rankings dejados para regeneración natural (URL interna Railway no accesible desde local). Catálogo intacto: **2.878 juegos + 134.928 logros** (antes documentado como 1.406/72.264 — el catálogo creció con seeding adicional post-sesión 12). BD lista para producción pública.

**Fecha**: 2026-06-04 (sesión 59) — PL13 script limpieza BD + merge develop→main + tag v1.0.0. Script `scripts/cleanup-test-users.ts` creado con borrado atómico Prisma (14 tablas), opciones `--dry-run` y `--preserve-username`, limpieza Redis rankings (`ranking:global`, `ranking:global:*`, `ranking:platform:*`) y verificación integridad catálogo post-borrado. Merge develop → main con `--no-ff`. Tag `v1.0.0` creado y publicado en GitHub. EAS Build versionCode 5 publicado en Prueba interna. PL13 ✅, PL15 ✅.

**Fecha**: 2026-06-04 (sesión 58) — Build local APK debug validado con SDK 55 + RN 0.83.6. BUILD SUCCESSFUL — APK debug 204.9 MB. Proceso documentado en docs/BUILD_LOCAL.md. Quirks nuevos: react-native bundle → expo export:embed (CLI v20 rompe el comando anterior); --entry-file omitido en monorepo (se resuelve desde package.json "main"); Gradle 9.0.0 → 8.13 tras cada prebuild. @react-native-community/cli@20.1.3 instalado desde raíz del monorepo.

**Fecha**: 2026-06-04 (sesión 57) — Verificación pre-AAB v4 + corrección tests rotos. T17/T18 verificados: Railway Deploy Logs confirma "8 migrations found" — todas las migraciones incluyendo gdpr_soft_delete aplicadas en producción. 3 tests API corregidos que estaban rotos por cambios de sesiones anteriores: repositories.test.ts (findUserByUsername con deletedAt: null), user.service.test.ts (mock refreshToken.updateMany), xbox.adapter.test.ts (tokenJson sin cifrar). Quirks SDK 55 + RN 0.83.6 documentados: Gradle 9.0.0 incompatible con RN 0.83.6 → parchear a 8.13 tras cada prebuild local; compileSdkVersion actualizado a 36 por androidx.core:1.17.0. EAS Build no requiere estos parches. bundleRelease BUILD SUCCESSFUL — AAB local 68.7 MB. API: 566/566 tests ✅. Mobile: 352/352 tests ✅. 0 errores TS/lint.

**Fecha**: 2026-06-04 (sesión 56) — T49/T50/T51 + upgrade Expo SDK 51→55. **T49 (bug crítico background-sync)**: `background-sync.scheduler.ts` línea 35 — `gte: oneDayAgo` → `lte: oneDayAgo`. La condición anterior sincronizaba usuarios que YA habían sincronizado recientemente en lugar de los que llevan más de 24h sin hacerlo — exactamente el comportamiento inverso al deseado. **T50 (tests auth soft-delete)**: `auth.routes.test.ts` — test 1: `POST /refresh` → 401 cuando tokens revocados por `deleteAccount`; test 2: `GET /me` → 401 `ACCOUNT_DELETED` cuando middleware `authenticate` detecta `deletedAt`. Mock de `prisma.user.findUnique` añadido al fichero. **T51 (tests race condition rewarded ad)**: `points.service.test.ts` — corregidos mocks existentes para reflejar implementación `SET NX` real (antes mockeaban `redis.get` en lugar de `redis.set`); nuevo test `Promise.allSettled` con 2 llamadas simultáneas → exactamente 1 fulfilled con `{ pointsEarned: 10 }`, 1 rejected con `REWARDED_AD_COOLDOWN` 429. **Expo SDK 51→55**: `expo` ~51→^55, `react-native` 0.74.5→0.83.6, `react` 18.2.0→19.2.0, `react-native-reanimated` 3→4 + `react-native-worklets` 0.7.4, `react-native-google-mobile-ads` v13→v16.3.3 (workaround Kotlin ya no necesario), `@shopify/flash-list` v1→v2 (`estimatedItemSize` eliminado en 7 usos), `kotlinVersion` 1.9.23→2.1.20, `compileSdkVersion` 34→35. `expo doctor` 19/19 ✅. Tests: 352/352 ✅.

**Fecha**: 2026-06-04 (sesión 55) — F20 placements AdMob ampliados. Nuevos placements: banner Rankings (`EXPO_PUBLIC_ADMOB_RANKINGS_BANNER_ID`), banner Friends (`EXPO_PUBLIC_ADMOB_FRIENDS_BANNER_ID`), interstitial Wrapped (cooldown 24h AsyncStorage), interstitial al completar juego 100% (tracking AsyncStorage max 500 IDs). EAS secrets configurados en expo.dev en production. `EXPO_PUBLIC_REVENUECAT_API_KEY` cambiado de Plain text a Sensitive. 0 errores TS/lint.

**Fecha**: 2026-06-03 (sesión 54) — Fase 4 inicio: backlog actualizado + 4 ítems inmediatos completados. **T55 (edge-to-edge Android 15)**: todos los tabs cambiados a `edges={['left', 'right']}` en SafeAreaView — el header de React Navigation gestiona top y el tab bar gestiona bottom; sin el fix, `targetSdkVersion=35` contaba el safe area inset del status bar dos veces. **T53 (crash sync largo)**: 4 fixes — `syncProgressKey` en `finally` de `sync.worker.ts`; guard `MAX_PAGES=10` en `fetchUserTitles` de `psn.adapter.ts`; claves stale RA con TTL 7 días en `retroachievements.adapter.ts`; throttle 15s en handler socket de `useSyncProgress.ts`. **T56 (fixes seguridad sesión 53)**: verificados y correctamente aplicados — xbox doble cifrado, `searchUsers` deletedAt, `deleteAccount` revocación RefreshTokens. **T52 (caché Redis metadatos juego)**: nuevo `game-cache.ts` — clave `game:meta:{platform}:{externalId}` TTL 24h; adapters PSN/RA/Steam comprueban caché antes de cada `game.upsert`; syncs repetidos no generan escrituras a PostgreSQL para juegos ya conocidos. 0 errores TS/lint en API y mobile.

**Fecha**: 2026-06-03 (sesión 53) — Auditoría de seguridad de datos en BD. Vulnerabilidades encontradas y corregidas: **CRÍTICA**: `xbox.adapter.ts` doble cifrado AES-256-GCM en `exchangeXboxCodeForTokens` — `linkPlatform` volvía a cifrar un token ya cifrado, causando que todos los syncs Xbox fallaran con "Token Xbox corrupto". Fix: devolver `tokenJson` sin cifrar (responsabilidad del cifrado delegada a `linkPlatform`). **MEDIA-1**: `search.service.ts` — `searchUsers` no filtraba `deletedAt: null` — usuarios soft-deleted aparecían en búsquedas durante 30 días. Fix: añadido `deletedAt: null` al `where`. **MEDIA-2**: `user.service.ts` — `deleteAccount` no revocaba `RefreshToken`s — usuario podía obtener nuevos access tokens tras borrar su cuenta. Fix: `refreshToken.updateMany({ revokedAt: new Date() })` añadido a la transacción atómica. Informacionales documentados (sin corrección): `passwordHash` cargado en memoria sin `select` explícito, `findUserByUsername` sin filtro `deletedAt` interno, placeholder `ENCRYPTION_KEY` en `.env.example` es hex válido. Ficheros modificados: `xbox.adapter.ts`, `platform.controller.ts`, `search.service.ts`, `user.service.ts`. 0 errores TS/lint.

**Fecha**: 2026-07-07 (sesión 51) — Auditoría exhaustiva CLAUDE.md vs código real + documentación JSDoc. **Divergencias corregidas en CLAUDE.md**: (1) Variables de entorno faltantes añadidas: `RA_SYSTEM_USER`, `RA_SYSTEM_KEY` (validadas en Zod), `MAINTENANCE_MODE`, `XBOX_CLIENT_ID`, `XBOX_CLIENT_SECRET` (Fase 4). (2) Clarificación validación Zod: solo ciertas variables pasan por el schema al arranque. (3) Modelos de BD corregidos: `Friendship` usa `senderId`/`receiverId` (no `userId`/`friendId`); `PasswordResetToken` usa `tokenHash` (no `token` en texto plano); `ActivityEvent.type` es enum `ActivityEventType` tipado; `WeeklyChallenge` usa `xpReward` y `ChallengeMetric` enum (no `pointsReward` y `String`); `SubscriptionPlan` incluye `LIFETIME`; `PlatformAccount` documentado con campos reales (`requiresReauth`, `psnProfilePrivate`, `tokenExpiresAt`). (4) Modelos no documentados añadidos: `RefreshToken`, `DeviceToken`. (5) Stack técnico: añadidos `cookie-parser`, `compression`, `multer`, `axios` en backend; `socket.io-client`, `react-native-reanimated`, `posthog-react-native` en mobile. (6) Inventario: añadido scheduler `streak-shields.scheduler.ts` (01:00 UTC día 1/mes). (7) Logtail: clarificado que la integración es vía log drain Railway, no SDK en código. (8) Comentario obsoleto de `app.ts`: "Fly.io" → "Railway". **JSDoc añadido** a: `services/user.service.ts`, `services/sync.service.ts`, `services/ranking.service.ts`, `services/friendship.service.ts`, `services/notification.service.ts`, `services/points.service.ts`, hooks de mobile (`useSyncProgress`, `useSyncAll`, `useMyGames`, `useFriendshipActions`, `useRevenueCat`, `useSubscription`), `packages/types/src/index.ts`, `packages/validators`. Sin cambios de lógica. Tests: 563 API + 352 mobile. 0 errores TS/lint.

**Fecha**: 2026-07-06 (sesión 50) — Configuración Better Stack (Logtail) y PostHog completada. `LOGTAIL_SOURCE_TOKEN` configurado en Railway Variables — logs JSON de pino enviados a fuente "UnlockHub API" en Better Stack. `POSTHOG_API_KEY` (Project token) configurado en Railway Variables — analytics activo en producción, plan Free. CLAUDE.md actualizado: N2 y N4 marcados ✅, tabla de infraestructura actualizada, inventario de funcionalidades actualizado. Play Store: AAB producción versionCode 3 subido a track de Pruebas internas, prueba interna publicada y enviada a testers, listing completo (título, descripciones, contacto, categoría), clasificación de contenido completada, Seguridad de los datos completada. Sin cambios de código. Tests: 563 API + 352 mobile. 0 errores TS/lint.

**Fecha**: 2026-07-06 (sesión 49) — Fix bloqueante target API 35 + validación bundleRelease. El AAB #1 (target API 34) fue rechazado por Play Console: Google exige API 35 (Android 15) mínimo desde el 31 de agosto de 2025. Fix quirúrgico en `app.json` (`expo-build-properties`): `targetSdkVersion: 35`, `compileSdkVersion` se mantiene en 34 (con compile 35, `expo-modules-core` de Expo SDK 51 falla por null-safety en `PermissionsService.kt`). Google solo exige el target; el compile puede ir por detrás. Validación local: `assembleRelease` Y `bundleRelease` BUILD SUCCESSFUL con target 35 / compile 34 — garantiza que el `eas build` no quemará intento. NO se actualizó Expo SDK 51 → 55. Pendiente verificar edge-to-edge de Android 15 en dispositivo (PL14). Tests: 563 API + 352 mobile. 0 errores TS/lint.

**Fecha**: 2026-07-06 (sesión 48) — AAB de producción #1 generado con EAS. Build de producción completado sin errores en EAS (la validación release local previa evitó quemar intentos). Detalles del build: perfil `production`, environment `production`, Expo SDK 51.0.0, `versionName` 1.0.0, `versionCode` 1, commit `f5060c4`, creado por juanjomrv. El AAB está firmado con el keystore de producción gestionado por EAS (backup del desarrollador en PC + Drive). Próximos pasos: subir a track de Pruebas internas en Play Console, completar listing y formularios "Contenido de la app", validar, limpiar BD de usuarios de prueba (PL13) y promover a Producción.

**Fecha**: 2026-07-06 (sesión 47) — Preparación de lanzamiento: auditoría de seguridad + limpieza + assets. Auditoría de seguridad pre-lanzamiento del repo público: 0 secrets reales en working tree e historial Git, 0 datos personales en historial (limpieza `git filter-branch` de 2026-05-28 confirmada efectiva), solo `.env.example` con placeholders trackeados, credenciales sensibles correctamente gitignoreadas. Limpieza: eliminados `scripts/check-db-size.ts` y `scripts/verify-seed.ts` (scripts de diagnóstico obsoletos sin referencias); `*.keystore` añadido al `.gitignore` raíz. Assets de Play Console generados: icono 512×512 (monograma UH sobre degradado morado de marca) y gráfico destacado 1024×500. Documento de listing completo generado con textos (título, descripciones breve y completa con descargo de no afiliación a Valve/Sony/RA) y guía de formularios. Acción del desarrollador: cuenta Neon (infraestructura pre-Railway) cerrada. Tests: 563 API + 352 mobile. 0 errores TS/lint. Commit `898538f`.

**Fecha**: 2026-07-05 (sesión 46) — Preparación AAB producción. `app.json`: App ID de AdMob para Android cambiado de test (`ca-app-pub-3940256099942544~3347511713`) a producción (`ca-app-pub-3506466357843399~6211856600`). Verificado: los 4 ad unit IDs (`unlockhub_home_banner` 3314230527, `unlockhub_search_banner` 7061903848, `unlockhub_interstitial` 9959529926, `unlockhub_rewarded` 7744430120) se leen de `EXPO_PUBLIC_ADMOB_*` con fallback a test IDs; EAS secrets configurados; perfil `production` de `eas.json` genera AAB y apunta a Railway prod. Sin cambios de tests.

**Fecha**: 2026-07-04 (sesión 45) — Fix lock de sync que no cubría `triggerExpressSync`. Diagnóstico: el lock de sync por usuario (sesión 44) estaba en el processor del BullMQ worker y cubría los caminos manual/initial/auto-repeat/background scheduler, pero `triggerExpressSync` en `sync.service.ts:257` llamaba `adapter.syncUserExpress()` directamente en el proceso de la API sin adquirir `sync:user-lock:{userId}`. Escenario del bug: durante el onboarding el usuario vincula Steam y PSN en rápida sucesión → ambos `triggerExpressSync` arrancaban simultáneamente sin bloqueo, escribiendo concurrentemente en `UserAchievement` → "No se pudo cargar la biblioteca". Fix: `triggerExpressSync` adquiere `sync:user-lock:{userId}` con `SET NX EX 120` antes de ejecutar el express sync; si el lock no está disponible, omite el express sync silenciosamente — el `queueInitialSync` encolado justo después en el controller cubre la sincronización completa cuando el lock queda libre; el lock se libera siempre en `finally`. Tests: nuevos en `sync.worker.test.ts` (express sync adquiere lock / omite si lock tomado / libera en finally). Tests: 563 API · 352 mobile. Cobertura 83.5% stmt. 0 errores TS/lint.

**Fecha**: 2026-07-03 (sesión 44) — Fix empty state al desvincular + sync secuencial por usuario. BUG-1 (empty state incorrecto al desvincular con varias plataformas): causa raíz — el refetch de `['my-games']` termina (`allGames=[]`) antes que el de `['sync-summary']`, dejando `anyPlatformLinked` stale en `true` + `allGames=[]` → flash de "Tus juegos aparecerán pronto" incorrecto. Doble fix: `profile.tsx` usa `refetchQueries(['sync-summary'])` en lugar de `invalidateQueries` (refetch forzado inmediato); `index.tsx` añade `isFetching` del hook + guard en `ListEmptyComponent` que muestra `<LibrarySkeleton />` cuando `isFetching && allGames.length === 0` en lugar del empty state. MEJORA-2 (sync secuencial por usuario): lock Redis en `sync.worker.ts` — `SET sync:user-lock:{userId} {jobId} EX 600 NX` al inicio de cada job; si no adquiere el lock, reencola con `{ delay: 5000 }` y retorna; `finally` libera el lock siempre, incluso si el sync falla; `concurrency: 5` global sin cambios — usuarios distintos siguen en paralelo, solo se serializan los syncs del mismo usuario. Tests: +4 API (lock adquiere/reencola/finally/usuarios distintos) +4 mobile (skeleton durante isFetching + refetchQueries). Tests: 560 API · 352 mobile. Cobertura 83.46% stmt. 0 errores TS/lint.

**Fecha**: 2026-07-02 (sesión 43) — NewGamesBanner eliminado + fix juegos plataforma desvinculada. PARTE 1: eliminado `NewGamesBanner` completamente — `index.tsx` sin `flashListRef`, estados `seenGamesCount`/`showNewGamesBanner`, 2 useEffects del banner, `handleNewGamesBanner`, wrapper `position: 'relative'` y JSX; archivos `NewGamesBanner.tsx` y `NewGamesBanner.test.tsx` eliminados; 4 claves i18n `library.new_games_banner_*` eliminadas de ES/EN; mock y 4 tests de `FeedScreen.test.tsx` eliminados. PARTE 2: bug — juegos de plataforma desvinculada seguían en biblioteca; diagnóstico confirmó que `getMyGames` usa `UserAchievement` como única fuente de verdad (correcto) pero `unlinkPlatform` en `platform.service.ts:161` usaba `deleteMany` con relation filter `achievement: { platform }` que no es fiable en todas las versiones de Prisma y podía silenciosamente no borrar nada; fix: `{ id: { in: toDelete.map(ua => ua.id) } }` usando los IDs ya obtenidos del `findMany` previo. Tests: 556 API · 348 mobile. Cobertura 83.46% stmt. 0 errores TS/lint.

**Fecha**: 2026-07-01 (sesión 42) — Banner upload implementado. Backend: `uploadBanner` multer middleware en `upload.middleware.ts`; `uploadBanner()` en `user.service.ts` con guard `USER_NOT_FOUND`, Cloudinary `folder: 'unlockhub/banners'`, `public_id: '{userId}-banner'`, crop/fill 1500×500; `uploadBannerHandler` en `user.controller.ts` idéntico a avatar; `POST /api/v1/users/me/banner` con `authenticate` + middleware en `user.routes.ts`. Mobile: `Pressable` de 120px sobre el área del banner en `profile.tsx`; `bannerMutation` con `aspect: [3,1]` y FormData; badge cámara + spinner sobre el banner; 3 claves i18n ES/EN (`change_banner`, `banner_error_title`, `banner_error_message`). Tests: 15 nuevos (5 `user.service.test.ts` + 5 `user.routes.test.ts` + 5 mobile). Tests: 553 API + 358 mobile. Cobertura 83.45% stmt. 0 errores TS/lint.

**Fecha**: 2026-06-30 (sesión 41) — Fix deploy Railway: `gdpr-cleanup.scheduler.ts` usaba conexión Redis por defecto (`maxRetriesPerRequest: 3`) para su BullMQ Worker — BullMQ Workers requieren `maxRetriesPerRequest: null`. Fix: import `createWorkerConnection` desde `../lib/redis` y sustituir `{ connection: redis }` por `{ connection: createWorkerConnection() }` en la creación del Worker (línea 52). Mock de `createWorkerConnection` añadido en `gdpr-cleanup.scheduler.test.ts`. Tests: 543/543. 0 errores TS/lint.

**Fecha**: 2026-06-29 (sesión 40) — Fix Steam sync: `rawValue`/`rarity` como string en runtime. Bug raíz: la Steam API devuelve `percent` como string (`"54.6"`) en ciertos juegos aunque el interface TypeScript lo declara `number` — TypeScript no detecta el mismatch en runtime y Prisma rechaza pasar un string a `Float?`. Fix en `steam.adapter.ts`: en ambos loops de logros (`getUserAchievements` y `processGames`), `rawRarity` se convierte con `parseFloat(String(rawRarity))` + guard `isNaN`; `rawValue`/`rarity` reciben `null` si el valor no es numérico, `normalizePoints` recibe `100` como fallback. Fix adicional: guard `startsWith('http')` en `iconUrl` para evitar duplicar la URL base cuando Steam devuelve el campo `icon` ya como URL completa. Tests: 3 nuevos en `steam.adapter.test.ts` (`rawValue`/`rarity`/`iconUrl` en upsert). Tests: 543 API + 358 mobile. Cobertura 83.08% stmt. 0 errores TS/lint.

**Fecha**: 2026-06-28 (sesión 39) — 2 bugs confirmados por capturas de pantalla. BUG-1 (lista no ordenada al entrar ni en pull-to-refresh): causa raíz — el `useEffect` de carga inicial tenía un early return para `last_played` que marcaba `initialLoadDoneRef.current = true` sin llamar `fetchAllRemainingPages()`, dejando solo la página 1 cargada; `handleRefresh` también saltaba `fetchAllRemainingPages` para `last_played`. Cuando el usuario pulsaba el filtro activo, `handleSortChange` sí llamaba `fetchAllRemainingPages()` → todas las páginas → `useMemo` re-ordenaba sobre el set completo. Fix: eliminado el early return y la condición — todos los sorts cargan todas las páginas. BUG-2 (`library.new_games_banner` aparecía como texto literal): causa raíz — `compatibilityJSON: 'v3'` en i18next con `t('library.new_games_banner', { count })` (base key) no resuelve automáticamente al sufijo `_one/_other`; el proyecto usa selección explícita de clave. Fix en `NewGamesBanner.tsx`: selección explícita `t(count === 1 ? 'library.new_games_banner_one' : 'library.new_games_banner_other', { count })`. Las claves ya existían en ES y EN. Tests: 540 API · 358 mobile. 0 errores TS/lint.

**Fecha**: 2026-06-27 (sesión 38) — Fix rankings XP plataforma en banner "Tu posición". Diagnóstico confirmó 3 problemas encadenados: (1) `getUserRank` en `ranking.service.ts` leía siempre `ZSCORE('ranking:global', userId)` ignorando el parámetro `platform` — corregido para usar el sorted set correcto según plataforma. (2) `useMyRanking` tenía `queryKey: ['rankings', 'me']` hardcodeado para todos los filtros — TanStack Query servía caché del global para PSN/RA/Steam — corregido añadiendo `platform` a la queryKey: `['rankings', 'me', 'PSN']`. (3) La URL del request siempre era `/api/v1/rankings/me` sin `?platform` — corregido añadiendo el query param cuando hay filtro activo. (4) `ranking.controller.ts` no leía `req.query['platform']` — corregido. `rankings.tsx` pasa `activeFilter !== 'global' ? activeFilter : undefined`. Resultado: banner "Tu posición" muestra 372.900 XP en PSN y 1.520 XP en RA en lugar de 367.155 XP total. Tests: 540 API (42 suites) · 357 mobile (29 suites). Cobertura 83.08% stmt. 0 errores TS/lint.

**Fecha**: 2026-06-26 (sesión 37) — 6 fixes + diagnóstico. FIX-1/2 (biblioteca sort + deduplicación): `initialLoadDoneRef.current = false` añadido en mount effect y AppState handler antes de `invalidateQueries` — cuando TanStack Query refetcha página 1, el useEffect de carga inicial ve el ref reseteado y llama `fetchAllRemainingPages`; deduplicación por `Set<string>` en `useMyGames.ts` elimina solapamientos cuando `invalidateQueries` refetcha página 1 mientras página 2 ya está en el array. FIX-3 (optimistic update FriendshipButton): `sendRequest`, `cancelOrRemove` y `accept` en `useFriendshipActions.ts` usan `onMutate` para actualizar el caché síncronamente → cambio de estado instantáneo; `onError` revierte si la API falla. FIX-4 (empty state incorrecto): `unlinkMutation.onSuccess` en `profile.tsx` no invalidaba `['sync-summary']` — tras desvincular todas las plataformas, `anyPlatformLinked` quedaba `true` en caché 30s mostrando "Tus juegos aparecerán pronto" incorrectamente; añadida la invalidación. FIX-5 (búsqueda de logros eliminada del Search): `search.tsx` simplificado — solo busca juegos y usuarios; hook `useSearchAchievements` y endpoint backend intactos para T27. FIX-6 (contador "0 logros" ocultado): `GameCard` omite el contador cuando `totalAchievements === 0`; campo `console` se sigue mostrando si disponible. Tests: 532 API + 354 mobile. Cobertura 82.84% stmt. 0 errores TS/lint.

**Fecha**: 2026-06-25 (sesión 36) — 4 bugs corregidos. BUG-1 (FriendshipButton no aparecía): causa — `if (!status || status.status === 'blocked') return null` devolvía null cuando la query fallaba (`isError=true, status=undefined`) o cuando `user` era null por timing del session store. Fix en `FriendshipButton.tsx`: `user = useSessionStore((s) => s.user)`; spinner cuando `isLoading || !user`; `!status && isError` → muestra "Añadir amigo" como fallback; `!status && !isError` → null (perfil propio o query desactivada). BUG-2 (búsqueda muestra propio usuario + redirect incorrecto): `searchUsers(q, userId)` en `search.service.ts` añade `NOT: { id: userId }` para excluir al usuario autenticado; `profile/[username].tsx` redirige a `/(tabs)/profile` via `useEffect` cuando `profile?.username === currentUser.username`. BUG-3 (biblioteca no carga páginas con caché): causa — `useEffect([isLoading])` no se dispara cuando `isLoading=false` desde el inicio (datos en caché). Fix: `initialLoadDoneRef = useRef(false)` con deps completas `[allGames.length, isLoading, isFetchingNextPage, hasNextPage, librarySortOrder, fetchAllRemainingPages]`; ref reseteado en `handleSortChange` y `handleRefresh`. BUG-4 (rankings XP total en "Mi posición"): diagnóstico confirmó que la cadena backend era correcta; solo se añadieron tests de cobertura en `RankingsScreen.test.tsx` verificando que `useMyRanking` recibe `undefined`/`'PSN'`/`'STEAM'` según el filtro activo. Tests: 532 API + 350 mobile. 0 errores TS/lint.

**Fecha**: 2026-06-24 (sesión 35) — FriendshipButton consciente del estado de relación. Backend: `FriendshipStatusResult` type (5 variantes discriminadas: none/pending_sent/pending_received/accepted/blocked) en `packages/types`; `sendFriendRequestSchema` ampliado a union `{ receiverId } | { username }` en validators; `getFriendshipStatus()` nuevo en `friendship.service.ts`; `unfriend()` ampliado para permitir cancelar solicitudes PENDING además de ACCEPTED; handler `getFriendshipStatusHandler` en controller; ruta `GET /api/v1/friends/status/:username` declarada antes de `/:friendshipId` en `friendship.routes.ts`. Mobile: `useFriendshipStatus` hook con `enabled: !!user && user.username !== username`; `useFriendshipActions` hook con `sendRequest/cancelOrRemove/accept/reject`; `FriendshipButton` componente nuevo — máquina de 5 estados (none/pending_sent/pending_received/accepted/blocked), `Alert.alert` de confirmación en eliminar amigo, todos los botones deshabilitados con `busy: true` durante mutaciones; `profile/[username].tsx` sustituye botón inline por `<FriendshipButton username={profile.username} />`. Tests: 530/530 API (41 suites) · 333/333 mobile (27 suites). Cobertura API 82.84% stmt. 0 errores TS/lint.

**Fecha**: 2026-06-23 (sesión 34) — 4 bugs de producción corregidos. BUG-1 (biblioteca sort al abrir): `useEffect([isLoading])` nuevo en `index.tsx` que dispara `fetchAllRemainingPages()` cuando `isLoading` pasa a `false` en la carga inicial y el sort persistido no es `last_played` — dep array mínima para evitar re-ejecuciones. BUG-2 (pull-to-refresh pierde páginas): `handleRefresh` llama `await fetchAllRemainingPages()` tras `resetQueries` cuando `librarySortOrder !== 'last_played'`; spinner activo hasta que todas las páginas cargan; eliminado `pendingFetchAllAfterRefreshRef` (innecesario). BUG-3 (rankings XP desincronizado): `getUserRank(userId, platform?)` en `ranking.service.ts` lee `ranking:platform:psn` cuando se pasa plataforma; `ranking.controller.ts` lee `?platform` de query params; `useMyRanking(platform?)` con queryKey y URL distintas por filtro; `rankings.tsx` pasa `activeFilter !== 'global' ? activeFilter : undefined`. BUG-4 (vinculación plataforma privada no bloqueaba): `platform.controller.ts` lanza `AppError('PSN_PROFILE_PRIVATE', 400)` antes de `linkPlatform` si el perfil es privado; `psn.tsx` maneja `PSN_PROFILE_PRIVATE` con error inline eliminando el flujo post-vinculación privado; `ra.tsx` usa mensaje específico `error_user_not_found` en 404; `steam.tsx` ya manejaba `STEAM_PROFILE_PRIVATE` correctamente; 3 claves i18n nuevas por idioma en ES/EN. Tests: +6 API (ranking.service + platform.controller) + 5 mobile (FeedScreen BUG-1/2, LinkSteam, LinkRA, LinkPsn). Tests: 513/513 API (39 suites) · 319/319 mobile (26 suites). Cobertura API 82.35% stmt. 0 errores TS/lint.

**Fecha**: 2026-06-22 (sesión 33) — Inventario completo de funcionalidades generado leyendo código real. Nueva sección "Inventario de funcionalidades" añadida al CLAUDE.md con 119 funcionalidades catalogadas (103 activas, 10 gateadas, 5 parciales, 1 eliminada). Checks B5, B6, B7, B14, N5 marcados como completados con información confirmada por el desarrollador.

**Fecha**: 2026-06-21 (sesión 32) — `FEATURES.premium = false` para lanzamiento inicial. Tests: 507 API (39 suites) + 314 mobile (26 suites). 0 errores TS/lint. Cobertura API 81.72% stmt / 82.4% branch.
**PREMIUM DESACTIVADO**: `featureFlags.ts` — `premium: false`, `pointsRedeem: false`, `advancedStats: false`. `PremiumBanner` devuelve null. `premium.tsx` muestra `ComingSoon` (nuevo componente). i18n: `common.coming_soon_title/body` añadidas. Tests de premium UI con `jest.mock('../../lib/featureFlags', ...)` que fuerza `premium: true` — mismo patrón que `ProfileScreen.test.tsx`. Backend (webhook, subscription service, endpoints) intacto para Fase 4. CLAUDE.md: featureFlags actualizado, B18/B19/B20 diferidos a Fase 4, decisión documentada.

**Fecha**: 2026-06-21 (sesión 31) — 6 fixes aplicados. Tests: 507 API (39 suites) + 314 mobile (26 suites). 0 errores TS/lint. Cobertura API 81.72% stmt / 82.4% branch.
**FIX1 — BUG-CRÍTICO-1 (seguridad/GDPR)**: `PublicUser` añadido a `packages/types/src/index.ts` (omite `email`, `isPremium`, `premiumUntil`, `lastSyncAt`). `mapPublicUser()` creado en `user.service.ts`. `getPublicProfile` cambiado a retornar `PublicUser` (sin email) + filtro `deletedAt: null`. Tests: 4 tests nuevos en `user.service.test.ts` (no expone email, no expone passwordHash, NOT_FOUND para usuarios eliminados, where incluye deletedAt:null).
**FIX2 — BUG-CRÍTICO-2 (GDPR)**: `deleteAccount` reescrito con flujo completo: soft delete (`deletedAt = now()`), anonimizar `ActivityEvent.payload → {}`, borrar `PlatformAccount` y `PasswordResetToken`, mantener `UserPoint`/`UserChallenge` (auditoría). `prisma.$transaction(async tx => {...})` atómica. `compareProfiles` añade `deletedAt: null` al targetUser lookup. `findUserByEmail` en `user.repository.ts` añade `deletedAt: null`. `authenticate.ts` verifica `deletedAt: null` en BD tras verificar el JWT (fail-open ante error de BD transitorio). `gdpr-cleanup.scheduler.ts` creado: `runGdprCleanup()` borra físicamente usuarios con `deletedAt <= now() - 30 días`; cron `0 4 * * * UTC`; registrado en `index.ts`. Tests: 6 tests nuevos en `user.service.test.ts`, 3 tests nuevos en `middleware.test.ts`, 4 tests nuevos en `gdpr-cleanup.scheduler.test.ts`. Actualizado `repositories.test.ts` para el nuevo where con `deletedAt: null`.
**FIX3 — BUG-MEDIO-3**: `syncUserExpress` en `retroachievements.adapter.ts` cambiado de `for...of` secuencial a `Promise.allSettled` con chunks de `RA_PROCESS_CONCURRENCY=3` — igual que `syncUser`/`syncUserBatched`. `logger.warn` por cada juego que falla individualmente. Tests: `retroachievements.adapter.test.ts` creado (3 tests: no aborta cuando DB upsert falla, loguea warn, procesa correctamente cuando todo OK).
**FIX4**: `rankings.tsx` `RankingList` — `isRefetching` eliminado del destructuring. `isManualRefreshing = useState(false)`. `handleRefresh` async: `setIsManualRefreshing(true)` → `queryClient.invalidateQueries` → `finally(false)`. `RefreshControl` usa `refreshing={isManualRefreshing}`. `useQueryClient` añadido. Tests: `RankingsScreen.test.tsx` migrado a `renderWithClient` + `QueryClientProvider`, 1 test nuevo (refreshing=false aunque isRefetching=true).
**FIX5**: `upsertUserScore` en `ranking.service.ts` paraleliza las queries de `getPlatformXp`: `Promise.all(platforms.map(p => getPlatformXp(userId, p)))` + `Promise.all(platforms.map(...zadd))`. Antes: bucle `for...of` secuencial. Tests existentes verificados.
**FIX6**: `useSubscription.ts` — `rcApiKey` leído en el cuerpo del hook (no a nivel de módulo) para testabilidad. `customerInfo = useState<CustomerInfo | null>(null)`. `useEffect` llama `Purchases.getCustomerInfo()` si RC configurado → `setCustomerInfo`. `subscriptionStatus.isPremium` deriva de RC (fuente primaria) con fallback a `user.isPremium` del JWT. `isLoadingStatus` verdadero mientras RC carga. `syncPremiumState` actualiza `customerInfo` tras compra. `getCustomerInfo: jest.fn()` añadido al mock global en `jest.setup.ts`. Tests: 5 tests nuevos en `useSubscription.test.ts`.
**Decisión soft delete GDPR**: `deleteAccount` implementa soft delete completo según spec de CLAUDE.md. `authenticate.ts` añade DB check (fail-open ante errores transitorios para no bloquear requests). La verificación en middleware añade ~1-5ms de latencia por request autenticada — trade-off aceptado por requisito de seguridad GDPR.

**Fecha**: 2026-06-20 (sesión 30) — Revisión exhaustiva sin cambios de código. 4 bugs confirmados:
**BUG-CRITICO-1** (seguridad/GDPR): `getPublicProfile` en `user.service.ts` llama a `mapUser` que incluye `email: string`, y la ruta `GET /api/v1/users/:username` no tiene `authenticate` — cualquier llamada no autenticada obtiene el email del usuario. Fix: crear `mapPublicUser` que excluye `email` y usarlo en `getPublicProfile`.
**BUG-CRITICO-2** (GDPR): `deleteAccount` hace `prisma.user.delete` (hard delete inmediato) en lugar del flujo especificado: soft delete `deletedAt = now()` → anonimizar `ActivityEvent.payload` → borrar `PlatformAccount`/`PasswordResetToken` → mantener `UserPoint`/`UserChallenge` → job físico a los 30 días. Los registros de auditoría de puntos se destruyen inmediatamente con el cascade.
**BUG-MEDIO-3**: `retroachievements.adapter.ts` `syncUserExpress` usa `for...of` secuencial sin `Promise.allSettled` — un error en un juego aborta el express sync completo (sync llamado al vincular RA). `syncUser`/`syncUserBatched` ya usan `Promise.allSettled` correctamente.
**BUG-MEDIO-4**: `getPublicProfile` y `compareProfiles` no filtran `deletedAt: null` — si BUG-CRITICO-2 se corrige a soft delete, los usuarios borrados seguirían siendo accesibles via perfil público. Code smells: `isRefetching` en `rankings.tsx` RefreshControl (patrón incorrecto vs sesión 18), `subscriptionStatus` hardcoded en `useSubscription.ts`, `getPlatformXp` secuencial en `upsertUserScore` (paralelizable). Tests: 491 API (37 suites) + 308 mobile (25 suites). 0 errores TS/lint. Cobertura API 81.57% stmt / 82.47% branch.

**Fecha**: 2026-06-19 (sesión 29) — Flag `--only-steam` en seed-games.ts. `seedSteamUsers(prisma, usernamesOverride)` añadida en `scripts/seed-games.ts`: resuelve vanity URL → SteamID64 vía `ISteamUser/ResolveVanityURL/v1/`, obtiene `GetOwnedGames`, filtra por `has_community_visible_stats`, hace upsert de juegos y logros igual que `seedSteam` con `normalizeSteamPoints` y `l: 'spanish'`. Guard temprano: `process.exit(1)` si `STEAM_API_KEY` no está en el entorno. `const key: string = apiKey` evita el problema de narrowing de tipo en el closure (mismo patrón que `seedPSN`). `main()` actualizado: `onlySteam` flag, `skipCatalog = onlyPsn || onlySteam`, cuarto resultado `steamUsersResult`, summary condicional por modo. Interfaz `SteamOwnedGameEntry` añadida a la sección de tipos. **Ejecución Seithek**: SteamID64 resuelto correctamente a `76561198088669581`, pero `GetOwnedGames` devolvió 0 juegos — perfil de Steam privado. Comando: `cd apps/api && railway run -- npx tsx ../../scripts/seed-games.ts --only-steam --usernames="Seithek"`. API TS: 0 errores. Mobile TS: 0 errores.

**Fecha**: 2026-05-31 (sesión 30) — Premium desactivado para lanzamiento inicial. `featureFlags.ts`: `premium: false`, `pointsRedeem: false`, `advancedStats: false`. `ComingSoon.tsx` creado (icono rocket, i18n `common.coming_soon_title/body`, botón Volver). `PremiumBanner.tsx`: guard `if (!FEATURES.premium) return null` antes de cualquier lógica. `premium.tsx`: guard `if (!FEATURES.premium) return <ComingSoon />` tras todos los hooks. `es.json` + `en.json`: claves `common.coming_soon_title/body` añadidas. Tests mockeados con `premium: true` en `PremiumBanner.test.tsx` y `PremiumScreen.test.tsx` para preservar cobertura del código de compra. Para reactivar en Fase 4: `premium: true`, `pointsRedeem: true`, `advancedStats: true` en `featureFlags.ts` — todo el backend (webhook RevenueCat, subscription service, hooks) intacto. TypeScript 0 errores · Lint 0 errores · 314/314 mobile tests pasando.

**Fecha**: 2026-05-30 (sesión 29) — Revisión exhaustiva + 6 fixes. BUG-CRÍTICO-1 (email en perfil público): `mapPublicUser()` creada en `user.service.ts` excluyendo `email`/`passwordHash`/`birthDate`; `getPublicProfile` y `compareProfiles` usan `mapPublicUser`; tipo `PublicUser` nuevo en `packages/types`. BUG-CRÍTICO-2 (GDPR hard delete): `deleteAccount` reescrito con transacción Prisma atómica (soft delete → anonimizar ActivityEvent → eliminar PlatformAccount/PasswordResetToken → mantener UserPoint/UserChallenge); `authenticate.ts` verifica `deletedAt: null` en cada request; `gdpr-cleanup.scheduler.ts` nuevo — cron diario que borra físicamente usuarios con `deletedAt > 30 días`. BUG-MEDIO-3 (RA syncUserExpress con Promise.all): sustituido por `Promise.allSettled` con chunks de 3 — un juego fallido no aborta los demás. FIX-4 (rankings.tsx RefreshControl): `isManualRefreshing` local, elimina `isRefetching` del RefreshControl — mismo patrón que `index.tsx` sesión 18. FIX-5 (upsertUserScore secuencial): `getPlatformXp` lanzado en paralelo con `Promise.all` por plataforma. FIX-6 (useSubscription hardcoded): `CustomerInfo` de RevenueCat leído al montar; `subscriptionStatus.isPremium` deriva de RC con fallback a `user.isPremium` del JWT cuando RC no está configurado. Tests: 507 API (39 suites) + 314 mobile (26 suites). Cobertura API 81.72% stmt. 0 errores TS/lint.

**Fecha**: 2026-06-18 (sesión 28) — 8 bugs + mejoras. BUG-1 (Steam privado): `checkSteamProfilePublic(steamId)` añadido en `steam.adapter.ts`; `linkSteamHandler` lo llama tras `resolveVanityUrl` — lanza `STEAM_PROFILE_PRIVATE` (400) antes de vincular; `steam.tsx` lo maneja con `err.apiError.code === 'STEAM_PROFILE_PRIVATE'`; i18n `error_profile_private` ES/EN. BUG-2 (ranking nacional eliminado): `KEYS.country` eliminado de `ranking.service.ts`; `upsertUserScore`/`removeUserFromRankings` sin `countryCode`; `getCountryRanking` eliminada; route `/country/:country` eliminada; `useCountryRanking` eliminada de `useRankings.ts`; filtro "Nacional" eliminado de `rankings.tsx`. BUG-3 (rankings plataforma usan XP total): `upsertUserScore` ahora llama `getPlatformXp(userId, platform)` por cada plataforma y usa el XP específico de esa plataforma para el sorted set — un usuario con 50k XP de Steam ya no aparece #1 en RA. BUG-4 (normalización RA): fórmula corregida a `Math.max(5, Math.round(points/5))` (antes `Math.min(100, Math.max(1, points))`); creado `scripts/backfill-ra-xp.ts` idempotente. BUG-5 (AppState listener): `AppState.addEventListener('change', ...)` en `index.tsx` invalida `my-games` cuando la app vuelve al frente — cubre el caso donde el sync nocturno terminó mientras la app estaba en background. BUG-6 (sort por rareza eliminado): `sortByRarity` state y botón eliminados de `game/[id].tsx` — rareza no es consistente entre plataformas. BUG-7 (Steam en español): `fetchGameSchema` añade `l: 'spanish'` y cambia clave de caché a `steam:schema:{appId}:es` — Steam hace fallback a inglés automáticamente. Tests nuevos: `steam.adapter.test.ts` (8 tests: `checkSteamProfilePublic` + `resolveVanityUrl`); actualización de fórmula RA en `retroachievements.adapter.test.ts`; `ranking.service.test.ts` reescrito con nueva API sin `countryCode` y con XP por plataforma; `sync.worker.test.ts` + `platform.service.test.ts` + `user.service.test.ts` actualizados. Tests: 491 API (37 suites) + 308 mobile (25 suites). 0 errores TS/lint.

**Fecha**: 2026-06-17 (sesión 27) — 6 bugs de dispositivo físico. BUG-1: `justify-center` añadido a todos los Pressable de acción primaria en login, register, steam, ra, psn — sin él, el texto se acumula arriba del espacio vertical en Android. BUG-2: `sync.worker.ts` — cuando `xpEarned=0`, se llama `upsertUserScore` con el XP actual del usuario y todas sus plataformas vinculadas; cubre usuarios que vincularon RA/PSN antes de la sesión 25 y cuyas syncs posteriores no generaban XP nuevo (nunca entraban en `ranking:platform:ra`/`ranking:platform:psn`). BUG-3: `(tabs)/_layout.tsx` — añadido `Redirect href="/(auth)/login"` cuando `!isAuthenticated` (después de todos los hooks, para respetar React Rules of Hooks); el botón "atrás" de Android ya no puede acceder a los tabs tras hacer logout. BUG-5+8: `handleRefresh` en `index.tsx` invalida `sync-summary` en paralelo con `resetQueries` para que `anyPlatformLinked` y el estado de cooldown se actualicen inmediatamente al hacer pull-to-refresh (el `staleTime: 30s` lo retrasaba). BUG-6: `link-platform/steam.tsx`, `ra.tsx` y `psn.tsx` — `onSuccess` invalida `sync-summary` y `my-games`; el empty state "Tus juegos aparecerán pronto" ahora aparece al navegar a la biblioteca tras vincular. BUG-9: `platform.controller.ts` — `queueInitialSync` cambiado de `void` a `.catch(logger.error)` para que los fallos de BullMQ/Redis sean visibles en logs Railway. `sync.worker.test.ts`: mock de `ranking.service.upsertUserScore` añadido; `prisma.user.findUnique` y `prisma.platformAccount.findMany` añadidos al mock de Prisma; test BUG-9 renombrado y ampliado para verificar el nuevo comportamiento. BUG-4 (plataformas no cargan al login) y BUG-7 (error 409 en Steam/RA) no tienen código a cambiar — ya estaban correctos en el código actual. Tests: 484 API (36 suites) + 308 mobile (25 suites). 0 errores TS/lint.

**Fecha**: 2026-06-16 (sesión 26) — Bug mount refresh biblioteca. `LibraryScreen` ahora llama `queryClient.invalidateQueries({ queryKey: ['my-games'] })` en `useEffect([user?.id, queryClient])` al montar. Causa raíz: TanStack Query con `staleTime: 3 min` en React Native no tiene `refetchOnWindowFocus` ni `AppState` listener, y `hydrateFromApi(false)` en `useSyncProgress` no llama `invalidateQueries` cuando no hay syncs activos en Redis. Sin el fix, si el sync nocturno terminó mientras la app estaba en background con caché < 3 min, la lista mostraba datos del caché stale al abrir sin actualizarse. `invalidateQueries` hace background refetch (sin spinner) y descarta el `staleTime`. 2 tests nuevos en `FeedScreen.test.tsx`: "invalida my-games al montar cuando el usuario tiene ID" y "NO invalida when user.id is undefined". Tests: 484 API (36 suites) + 308 mobile (25 suites). 0 errores TS/lint.

**Fecha**: 2026-06-15 (sesión 25) — 4 bugs + Wrapped extendido. BUG-1: `sortGames(games, order, isRunning)` — parámetro `isRunning` nuevo; cuando `true`, `lastActivityAt=null` se trata como `Date.now()+1_000_000_000` para que juegos nuevos durante sync aparezcan arriba. BUG-2: `index.tsx` llama `useSyncStatus(user?.id)` para obtener `anyPlatformLinked`; `ListEmptyComponent` ahora muestra `library.empty_linked_title` ("Tus juegos aparecerán pronto") cuando hay plataformas vinculadas pero sin juegos — sin mensaje erróneo "Vincula tus plataformas". BUG-3: `linkPlatform()` en `platform.service.ts` ahora busca todos los `platformAccounts` del usuario tras crear el registro y llama `upsertUserScore(userId, user.xp, user.countryCode, allPlatforms)` — el usuario aparece en rankings de plataforma inmediatamente al vincular. BUG-4: `handleRefresh` usa `queryClient.resetQueries({ queryKey: ['my-games'] })` en lugar de `invalidateQueries` — carga solo la primera página, spinner resuelve en 1 request. MEJORA-5: `GamingWrapped` extendido con `completedGamesByPlatform`, `platinumsEarned`, `longestStreakInYear`, `mostActivePlatform`, `mostProductiveDay` (tipo `packages/types`). `wrapped.service.ts` — `loadUserAchievements()` extraída, `computeStats` acepta `preloaded` para evitar doble query, `computeExtendedStats()` nueva función (2 queries paralelas: `game.findMany` + `userAchievement.findMany` earnedAllTime; rest calculado en JS desde achievements ya cargados; early return si no hay logros). `wrapped/[year].tsx` — 5 tarjetas nuevas con `FadeInDown` (platinos, completados por plataforma, racha larga, día épico, plataforma activa); solo se muestran si el valor es > 0/null. i18n: 8 claves nuevas en ES/EN (`platinums_earned/sub`, `completed_games_title/a11y`, `longest_streak`, `most_productive_day/count`, `most_active_platform`). Tests: 484 API (36 suites) + 306 mobile (25 suites). 0 errores TS/lint.

**Fecha**: 2026-06-14 (sesión 24) — Paralelismo sync PSN/RA + mejoras SyncStatusBar + onboarding paso 4. API: `psn.adapter.ts` refactorizado: `processSingleTitle()` extraído, `processTitles()` con `Promise.allSettled` chunks de 5 (`PSN_PROCESS_CONCURRENCY=5`). `retroachievements.adapter.ts`: `syncUser()` y `syncUserBatched()` con chunks de 3 (`RA_PROCESS_CONCURRENCY=3`). Steam: `TTL_SCHEMA` ya era 86400 (24h), sin cambio; T15 documentado. Mobile: `SyncStatusBar.tsx` — `useQueryClient` para invalidar `['sync-summary']` al expirar countdown, `setTimeout`-chain para countdown independiente del `refetchInterval` 60s, aviso ámbar `sync_long_warning` tras 30s de sync activo, early return movido después de todos los hooks (Rules of Hooks). `SyncStatusBar.test.tsx` migrado a `renderWithClient` con `QueryClientProvider` (+1 test para `sync-long-warning`). `onboarding.tsx` — paso 4 con botones Steam/PSN/RA (`PlatformRoute` type, `linkPlatform()` llama `completeOnboarding()` + `router.replace`), CTA secundario "Hacer esto más tarde". i18n ES/EN: 8 claves onboarding nuevas (`step4_title/body`, `cta_skip_platforms`, `platform_steam/psn/ra`). Tests: 475 API (36 suites) + 302 mobile (25 suites). 0 errores TS/lint.

**Fecha**: 2026-06-13 (sesión 23) — Google Play Billing vía RevenueCat + pantalla premium. Mobile: `react-native-purchases` v10 instalado, `hooks/useRevenueCat.ts` (initRevenueCat/cleanupRevenueCat, logIn al autenticarse), `hooks/usePremiumPlans.ts` (offerings RC → PremiumPlan[], fallback hardcoded), `hooks/useSubscription.ts` reescrito (purchasePackage, restorePurchases v10 devuelve CustomerInfo directo, cancelSubscription), `refreshAccessToken()` exportada de `lib/api.ts`, `app/premium.tsx` reescrito (título + 4 beneficios + 2 planes radio + CTA con `busy` + separador + canje 300 pts + restaurar + legal), `app/_layout.tsx` añade `<RevenueCatInit />`, `FEATURES.premium = true`, `jest.setup.ts` mock global `react-native-purchases`. Backend: `REVENUECAT_WEBHOOK_SECRET` en `env.ts`, `controllers/webhooks.controller.ts` (verifica bearer, INITIAL_PURCHASE/RENEWAL activa, EXPIRATION/CANCELLATION expira, siempre 200), `services/subscription.service.ts` añade `expireSubscriptionFromWebhook`, `routes/webhooks.routes.ts`, registrado en `routes/index.ts`. i18n ES/EN: `common.close`, `common.or`, sección `premium` completa. Tests: 470 API (+25 webhook tests) + 301 mobile (+13 premium + 3 PremiumBanner fix). 0 errores TS/lint.

**Fecha**: 2026-06-12 (sesión 22) — SyncStatusBar en Biblioteca: feedback completo de sync en tiempo real. Backend: `getAggregateSyncStatus(userId, isPremium)` en `sync.service.ts` — agrega estado Redis por plataforma (`cooldownKey`, `dailyCountKey`), expone `lastSyncAt`, `nextAutoSyncAt`, `canSyncNow`, `manualSyncsUsedToday`, `dailySyncsLimit`, `anyPlatformLinked`. Endpoint `GET /api/v1/sync/my-summary` (declarado antes de `/:platform` para evitar match falso). Mock server actualizado. Hook `useSyncStatus` con `refetchInterval: 60_000`, `staleTime: 30_000`, formateo via claves i18n. `SyncStatusBar` component: botón sync (spinner si activo, cooldown countdown si no puede), syncs restantes (solo free), última sync relativa, próximo auto sync. Integrado en `index.tsx` sustituyendo el botón `⟳` antiguo. Tests: 460 API (+9) + 288 mobile (+25). 0 errores TS/lint.

**Fecha**: 2026-06-11 (sesión 21) — Dos cambios independientes. PARTE 1: borrado en cascada al desvincular plataforma — `unlinkPlatform()` con `prisma.$transaction` atómica (borra `UserAchievement`, `PlatformAccount`, recalcula XP/nivel). `calculateLevel` exportada de `user.service.ts`. Mobile invalida `my-games` + `my-stats` en `onSuccess`. PARTE 2: sort biblioteca carga todas las páginas — `fetchAllRemainingPages` con `result.hasNextPage` del loop, `handleSortChange` llama `fetchAllRemainingPages` si `hasNextPage`, botón sort muestra `ActivityIndicator` mientras carga, pull-to-refresh con sort activo usa `pendingFetchAllAfterRefreshRef` + `useEffect`. Tests: 451 API (+6) + 263 mobile (+4). 0 errores TS/lint.

**Fecha**: 2026-06-09 (sesión 19) — Fix auto-refresco lista durante sync: `hydrateFromApi` (fallback polling) ahora llama `invalidateQueries({ queryKey: ['my-games'] })` cuando hay syncs activos (throttle 15s) y cuando el sync termina en modo fallback. Tests: 445 API + 250 mobile (+2 nuevos). 0 errores TS/lint.

**Fecha**: 2026-06-08 (sesión 18) — 3 mejoras: fix pull-to-refresh separado del infinite scroll (`isManualRefreshing` local, elimina confusión con `isRefetching`), confirmación de auto-refresco durante sync (ya funcionaba por prefix matching TanStack Query), `AvatarPlaceholder` con iniciales + color determinista por username en `UserCard`/`profile.tsx`/`profile/[username].tsx`. Tests: 445 API + 248 mobile (+15 nuevos). 0 errores TS/lint. Cobertura API 80.57% stmt.

**Fecha**: 2026-06-07 (sesión 17) — 10 mejoras UI/UX: jerarquía visual logros en `game/[id].tsx` (badge earned vs no-earned), `lastActivityAt` = MAX(unlockedAt) para sort "último jugado" real (campo `UserAchievement.unlockedAt` confirmado en schema), pull-to-refresh via `queryClient.invalidateQueries`, `contentFit="contain"` en iconos de juego, badge "Platino" en `LibraryGameCard` cuando `platinumEarned`, ícono cámara en avatar de perfil, placeholder PSN sin username real, selector de tema oculto, más espaciado en chips de Search, tab Challenges gateado con `FEATURES.challenges = false`. Tests: 445 API + 233 mobile. 0 errores TS/lint. Cobertura API 80.8% stmt / 83.66% branch.

**Fecha**: 2026-06-06 (sesión 16) — Padding header reducido (`pt-2→pt-1`) en 6 tabs. Badge PSN simplificado: solo tick ✓ verde cuando `isCompleted` — sin texto ni badge de platino. `globalRateLimiter` 300→500 req/15min. Investigación sync PSN: estructural (300 llamadas secuenciales), sin rate limiting detectado, sin cambios de código. Investigación contadores BD: query eficiente con `@@index([userId])`, documentado como T14. Tests: 445 API + 233 mobile. 0 errores TS/lint. Cobertura API 80.8% stmt / 83.66% branch.

**Fecha**: 2026-06-05 (sesión 15) — APK #4 build + smoke test. Sin cambios de código. Build local debug 169 MB. PSN sync falla con "Expired token" — NPSSO del sistema expirado. Auth rate limiter (10 req/15 min) disparado por peticiones curl de diagnóstico desde la misma IP del emulador. Dos hallazgos documentados en Decisiones tomadas.

**Fecha**: 2026-06-04 (sesión 14) — 8 bugs/mejoras UI + sync lockDuration. Padding `pt-4→pt-2` en 5 pantallas. Sort button muestra label activo. `last_played` con desempate por `pct_desc`. Contador juegos: denominador gris. Badges PSN independientes. `lib/platformColors.ts` centralizado (fix `#003087→#1e90ff` en GameCard+AchievementSearchCard). Toggle ES|EN en login. BullMQ `lockDuration: 300_000`. Tests: 445 API + 233 mobile. 0 errores TS/lint. Cobertura API 80.8% stmt / 83.66% branch.

**Fecha**: 2026-06-03 (sesión 13) — Fix rate limiter producción: `max: 100→300` req/15min, `/health` excluido del middleware. 0 código nuevo, solo `app.ts` + `rateLimiter.ts`. Tests: 443 API + 216 mobile. 0 errores TS/lint.

**Fecha**: 2026-06-03 (sesión 12) — Contador `totalGames`/`totalCompletedGames` en cabecera de biblioteca. Backend + hook + UI + i18n + tests. Tests: 443 API + 216 mobile. 0 errores TS/lint. Cobertura API 80.8% stmt / 83.66% branch.

**Fecha**: 2026-06-02 (sesión 11) — Mock server endpoint `sync/status` añadido. BUG-12 `hydrateFromApi` (`socketSilent`). Back buttons WCAG. `fallbackLng: 'en'`. "Biblioteca". i18n audit completo. Tests: 438 API + 214 mobile. 0 errores TS/lint. Cobertura API 80.77% stmt / 83.66% branch.

**Fecha**: 2026-06-01 (sesión 10) — BUG-7/8/9/10/11 corregidos. PSN states, sort modal, color #1e90ff, i18n. Tests: 438 API + 214 mobile. 0 errores TS/lint. Cobertura API 80.77% stmt / 83.66% branch.

**Fecha**: 2026-05-31 (sesión 9) — Fix `PLATFORM_ACCOUNT_ALREADY_LINKED`: código renombrado, handler 409 añadido en psn.tsx, mensajes i18n corregidos en Steam/RA, clave `error_already_linked` añadida en PSN. `LinkPsnScreen.test.tsx` refactorizado a patrón factory. Revisión completa Parte 2: 0 bugs adicionales. Tests: 427 API + 208 mobile. 0 errores TS/lint.

**Fecha**: 2026-05-31 (sesión 8) — Steam y RA vinculación simplificada: solo username. `resolveVanityUrl` + `lookupRaUser` exportadas. UI reescrita (guía colapsada, sin campos de API key). i18n ES/EN actualizado. Tests: 426 API + 204 mobile. 0 errores TS/lint.

**Fecha**: 2026-05-30 (sesión 7) — Smoke test APK #3 completo. BUG-6 identificado (PSN screen NPSSO stale — Metro cache). BUG-3/4/5 re-confirmados ✅. AdMob banners ✅. 15/16 pasos completados (offline mode no testeable en emulador). Ver detalles en Sesión 7.

**Fecha**: 2026-05-30 (sesión 6) — APK #3 generada localmente (debug). Downgrade `react-native-google-mobile-ads` v16→v13. `app-debug.apk` 165.7 MB lista para smoke test. Ver detalles en Sesión 6.

### Sesión 20 — 2026-06-10 — Banner "X juegos nuevos" durante sync activo

**Objetivo**: mostrar un chip discreto en la parte superior de la lista cuando llegan juegos nuevos durante un sync activo, sin interrumpir al usuario si está revisando un juego.

**Análisis previo (PARTE 1):**
- No existía `flashListRef` en el FlashList — añadido.
- `isRunning` ya estaba disponible desde `useSyncProgress` (línea 157).
- No existía detección de juegos nuevos. Se usa `allGames.length` (no `games.length` que varía con filtros) como baseline.

**Componente `components/NewGamesBanner.tsx`:**
- `Animated.spring` para entrada (opacity 0→1, translateY -20→0) — mismo patrón que `OfflineBanner`.
- `position: 'absolute'` para flotar sobre la lista sin desplazar contenido.
- `testID="new-games-banner"` para tests y Maestro.
- `accessibilityRole="button"` + `accessibilityLabel` via `library.new_games_banner_a11y`.

**Lógica en `app/(tabs)/index.tsx`:**
- `flashListRef = useRef<FlashList<LibraryGame>>(null)`.
- `seenGamesCount = useState(0)` — inicializado a `allGames.length` en primera carga (previene banner en load inicial).
- `showNewGamesBanner = useState(false)`.
- `useEffect 1` (inicialización): `if allGames.length > 0 && seenGamesCount === 0 → setSeenGamesCount(allGames.length)`.
- `useEffect 2` (lógica): `!isRunning → hide + reset; isRunning && allGames.length > seenGamesCount && seenGamesCount > 0 → show`.
- `handleNewGamesBanner`: scroll top + `seenGamesCount = allGames.length` + hide.
- `handleRefresh` actualizado: hide + `seenGamesCount = allGames.length` antes de invalidar.
- El FlashList se envuelve en `<View style={{ flex: 1, position: 'relative' }}>` para que el banner flote correctamente.

**i18n ES/EN:**
- `library.new_games_banner_one/other` + `library.new_games_banner_a11y_one/other` — patrón `_one/_other` de i18next.

**Tests:**
- `NewGamesBanner.test.tsx` (nuevo, 5 tests): testID presente, accessibilityRole button, accessibilityLabel definido, onPress llamado, texto i18n clave presente.
- `FeedScreen.test.tsx` (+4 tests): banner NO con `isRunning=false`, banner NO en carga inicial, banner SÍ con sync activo + juegos nuevos, banner desaparece en pull-to-refresh.
- Mock de `NewGamesBanner` en `FeedScreen.test.tsx` para testear solo lógica de `index.tsx`.
- `renderWithClient` refactorizado para exponer `rerender` con mismo `QueryClientProvider` wrapper.

**Estado de calidad:**
| Categoría | Resultado |
|---|---|
| TypeScript strict (API + mobile) | ✅ 0 errores |
| Lint (API + mobile) | ✅ 0 errores, 0 warnings |
| Tests backend | ✅ 445/445 — 35 suites |
| Tests mobile | ✅ 259/259 — 22 suites |

---

### Sesión 19 — 2026-06-09 — Fix auto-refresco lista durante sync

**Objetivo**: la lista de la biblioteca no se actualizaba progresivamente durante un sync de plataforma — solo al hacer pull-to-refresh manual.

**Diagnóstico:**
- `useSyncProgress` tiene dos paths para mantener el banner actualizado:
  1. **Socket.io** (`onSyncProgress`): llama `invalidateQueries` en cada lote ✅ — funciona cuando el socket recibe eventos
  2. **Fallback polling** (`hydrateFromApi`): llama la API Redis cada 2s — solo actualizaba `activeSyncs` (banner), **sin `invalidateQueries`** ❌
- En emulador/device, el socket frecuentemente no recibe eventos → el fallback polling mantiene el banner activo pero la lista nunca se refresca → el usuario solo ve cambios al deslizar (pull-to-refresh).

**Fix — `apps/mobile/hooks/useSyncProgress.ts`:**
- Nueva constante `LIST_INVALIDATE_THROTTLE_MS = 15_000`.
- Nuevo ref `lastInvalidateRef` para throttle.
- `hydrateFromApi` ahora llama `void queryClient.invalidateQueries({ queryKey: ['my-games'] })` en dos puntos:
  1. Cuando `running.length > 0` (sync en curso): throttled a 15s — el socket hace lo mismo sin throttle por cada lote
  2. Cuando `running.length === 0 && socketSilent` (sync completado en modo fallback): sin throttle — es el refresco final
- `queryClient` añadido a la dependency array de `hydrateFromApi`.

**Tests añadidos — `__tests__/hooks/useSyncProgress.test.ts`:**
- `BUG-8: invalida my-games cuando hydrateFromApi detecta syncs en curso (fallback polling)`: verifica que `invalidateQueries` se llama cuando la API devuelve syncs activos.
- `BUG-8: invalida my-games cuando hydrateFromApi detecta que el sync terminó (socketSilent=true)`: simula el ciclo completo (sync activo → timer de gracia → API devuelve vacío) con fake timers.
- Existente `BUG-8: hidrata el Map desde la API en el mount...`: añadida aserción de `invalidateQueries`.

**Estado de calidad:**
| Categoría | Resultado |
|---|---|
| TypeScript strict (API + mobile) | ✅ 0 errores |
| Lint (API + mobile) | ✅ 0 errores, 0 warnings |
| Tests backend | ✅ 445/445 — 35 suites |
| Tests mobile | ✅ 250/250 — 21 suites |

---

### Sesión 18 — 2026-06-08 — Fix pull-to-refresh, AvatarPlaceholder con iniciales

**Objetivo**: 3 mejoras UX — fix confusión pull-to-refresh vs infinite scroll, confirmación auto-refresco durante sync, placeholder de avatar con iniciales.

**PARTE 1 — Fix pull-to-refresh vs infinite scroll:**
- **Causa raíz**: `refreshing={isRefetching}` en el `RefreshControl`. En TanStack Query, `isRefetching = isFetching && !isLoading`. Cuando `fetchNextPage()` carga la página siguiente, `isFetching = true` y `isLoading = false` → `isRefetching = true` → el spinner de pull-to-refresh aparecía en el top al llegar al final de la lista.
- **Fix**: estado local `isManualRefreshing` (empieza en `false`). `handleRefresh` async con `setIsManualRefreshing(true)` → `await queryClient.invalidateQueries(...)` → `setIsManualRefreshing(false)` en `finally`. `RefreshControl` usa `refreshing={isManualRefreshing}`. `isRefetching` eliminado del destructuring de `useMyGames`.
- `onEndReached` → `fetchNextPage` | `onRefresh` → `handleRefresh` — gestos completamente independientes.

**PARTE 2 — Auto-refresco durante sync (ya funcionaba):**
- Confirmado: `useSyncProgress` llama `queryClient.invalidateQueries({ queryKey: ['my-games'] })` en cada batch (`sync:progress`) y al completar (`sync:complete`).
- TanStack Query usa prefix matching: `['my-games']` invalida `['my-games', 'all']`, `['my-games', 'STEAM']`, etc. No había bug. Documentado sin cambiar código.

**PARTE 3 — `AvatarPlaceholder` con iniciales y color determinista:**
- `components/AvatarPlaceholder.tsx`: `getAvatarColor(username)` — hash sobre paleta de 8 colores (indigo/violet/pink/amber/emerald/blue/red/teal). `getInitials(username)` — primeras 2 letras en mayúsculas. Tamaño configurable (`size` prop, default 80). `testID="avatar-placeholder-container"`. `accessibilityLabel` via i18n `profile.avatar_placeholder`.
- `UserCard.tsx`: `user.avatar ? <Image> : <AvatarPlaceholder>` — elimina `require('../assets/images/icon.png')` como fallback.
- `profile.tsx` (perfil propio): `user.avatar ? <Image> : <AvatarPlaceholder size={96}>` — el ícono de cámara sigue visible sobre el placeholder.
- `profile/[username].tsx` (perfil público): `profile.avatar ? <Image> : <AvatarPlaceholder size={80} style={borderStyle}>` — mantiene el borde de 3px.
- i18n: `profile.avatar_placeholder` — `"Foto de perfil de {{username}}"` / `"Profile photo of {{username}}"`.

**Tests añadidos/modificados:**
- `AvatarPlaceholder.test.tsx` (nuevo, 10 tests): `getInitials` (3), `getAvatarColor` (3), componente (4 — iniciales con `includeHiddenElements`, accessibilityLabel, tamaño, color determinista).
- `UserCard.test.tsx`: mock `AvatarPlaceholder`, 2 tests nuevos (placeholder cuando avatar null, imagen cuando avatar tiene URL).
- `FeedScreen.test.tsx`: import `act`, test `handleRefresh` convertido a async con `act()`, 2 tests nuevos (callbacks distintos, `refreshing=false` cuando `isFetchingNextPage=true`).

**Estado de calidad:**
| Categoría | Resultado |
|---|---|
| TypeScript strict (API + mobile) | ✅ 0 errores |
| Lint (API + mobile) | ✅ 0 errores, 0 warnings |
| Tests backend | ✅ 445/445 — 35 suites |
| Tests mobile | ✅ 248/248 — 21 suites |
| Cobertura API | ✅ 80.57% stmt |

---

### Sesión 17 — 2026-06-07 — UI/UX polish: jerarquía logros, lastActivityAt, iconos, badges, Challenges gateado

**Objetivo**: 10 mejoras UI/UX priorizadas + verificación de tests + actualización CLAUDE.md.

**P1 — Jerarquía visual logros (`game/[id].tsx`):**
- Antes: logros earned con `bg-primary/10 border border-primary/30` (apenas visible) parecían más apagados que los no-earned con `bg-surface-card`.
- Ahora: ambos usan `bg-surface-card`; solo earned recibe borde inline `{ borderWidth: 1, borderColor: 'rgba(129,140,248,0.45)' }`. Iconos: opacity 1 si earned, 0.4 si no.

**P2 — `lastActivityAt` = MAX(unlockedAt) por juego:**
- Campo `UserAchievement.unlockedAt DateTime` confirmado en schema Prisma — implementación real.
- `getMyGames` selecciona `unlockedAt: true` en `userAchievements`; el loop actualiza `lastActivityAt = max(entry.lastActivityAt, ua.unlockedAt)`.
- `useMyGames.ts`: campo `lastActivityAt: string | null` añadido a `LibraryGame`.
- Sort `last_played` en `index.tsx` usa `lastActivityAt` en lugar de `lastSyncedAt`.

**P3 — Pull-to-refresh via `queryClient.invalidateQueries`:**
- Añadido `import { useQueryClient }` y `const queryClient = useQueryClient()` en `index.tsx`.
- `onRefresh` cambiado de `refetch()` a `queryClient.invalidateQueries({ queryKey: ['my-games'] })`.
- `FeedScreen.test.tsx` actualizado: envuelto en `QueryClientProvider` (necesario para `useQueryClient`), test de pull-to-refresh cambiado a "no lanza".

**P4 — Iconos de juego sin recorte (`contentFit="contain"`):**
- `LibraryGameCard.tsx`: `contentFit="cover"` → `contentFit="contain"` + `backgroundColor: '#1e293b'`.
- `game/[id].tsx` header: misma corrección.

**P5 — Badge "Platino" en `LibraryGameCard`:**
- Reemplaza el tick verde `isCompleted` por badge amarillo `platinumEarned`: `bg-yellow-400 rounded px-1 text-black`.
- i18n: `library.psn_platinum_badge` → ES `"Platino"` / EN `"Platinum"`.
- Tests `LibraryGameCard.test.tsx` reescritos para nueva lógica.

**P6 — Ícono cámara en avatar de perfil:**
- `profile.tsx`: dentro del `Pressable` del avatar, cuando `!avatarMutation.isPending`, muestra badge circular `w-28 h-28 bg-primary` con `Ionicons name="camera"` en esquina inferior derecha.
- i18n: `profile.change_avatar_hint` → ES/EN.

**P7 — Placeholder PSN sin username real:**
- `es.json`: `"Ej: Sorrow_Lord"` → `"Ej: tu_username_psn"`.
- `en.json`: `"e.g. Sorrow_Lord"` → `"e.g. your_psn_username"`.

**P8 — Selector de tema oculto:**
- Bloque `bg-surface-elevated rounded-xl` del tema eliminado de `profile.tsx` → reemplazado por `{/* TODO Fase 4: selector de tema */}`.

**P9 — Espaciado chips Search:**
- `contentContainerStyle={{ gap: 8, paddingVertical: 6 }}` → `{ gap: 10, paddingVertical: 8 }`.

**P10 — Challenges gateado:**
- `featureFlags.ts`: añadido `challenges: false`.
- `_layout.tsx`: importa `FEATURES`; calcula `href = tab.name === 'challenges' && !FEATURES.challenges ? null : undefined`. La pantalla sigue existiendo.

**Estado de calidad:**
| Categoría | Resultado |
|---|---|
| TypeScript strict (API + mobile) | ✅ 0 errores |
| Lint (API + mobile) | ✅ 0 errores, 0 warnings |
| Tests backend | ✅ 445/445 — 35 suites |
| Tests mobile | ✅ 233/233 — 20 suites |
| Cobertura API | ✅ 80.8% stmt / 83.66% branch |

---

### Sesión 16 — 2026-06-06 — UI polish + rate limiter + investigaciones

**Objetivo**: reducir espacio header→contenido en las 6 tabs, simplificar badges PSN, investigar sync PSN y contadores BD, aumentar rate limiter global.

**PARTE 1 — Padding header reducido:**
- `pt-2 → pt-1` en `<View>` de cabecera de contenido en index.tsx, search.tsx, rankings.tsx, friends.tsx (×2 ramas).
- `mb-4 → mb-2` en el título de search.tsx (reducía el gap antes del input de búsqueda).
- `py-3 → pt-2 pb-3` en challenges.tsx (solo reduce el top, mantiene bottom por el border visual).
- `pt-8 → pt-6` en profile.tsx sección avatar (24px en lugar de 32px).

**PARTE 2 — Badge PSN simplificado:**
- Antes: dos badges independientes con texto (`showPsnPlatinum` → `🏆 Platino`, `showPsn100` → `🥇 100%`).
- Ahora: único tick circular verde (`w-5 h-5 bg-green-500 rounded-full`) con `✓` solo cuando `game.platform === 'PSN' && game.isCompleted`. `platinumEarned` sin badge propio.
- i18n keys `library.psn_platinum` y `library.psn_100` eliminadas de ES y EN.
- `LibraryGameCard.test.tsx` reescrito: 5 tests PSN badge + 2 tests básicos.

**PARTE 3 — Investigación sync PSN:**
- Logs Railway: mínimos (3 líneas del 2026-05-23). NPSSO expirado → no hay syncs PSN activos en producción.
- **Sin evidencia de 429** de PSN. La lentitud es estructural: `processTitles` tiene un `for...of` secuencial; `getUserTrophiesEarnedForTitle` (no cacheado) = 1 HTTP call por juego = ~300 calls para 300 juegos. `getTitleTrophies` cacheado 24h = 0 calls tras primer sync.
- **Conclusión**: no se añaden delays. El `lockDuration: 300_000` ya resuelve el stalled job issue.

**PARTE 4 — Investigación contadores BD:**
- `Game.totalAchievements` está desnormalizado ✅.
- `earnedAchievements`, `totalGames`, `totalCompletedGames` se calculan en JS a partir de `UserAchievement.findMany` completo.
- `UserAchievement.userId` tiene `@@index` — query eficiente a escala actual.
- Riesgo futuro: >100k achievements por usuario. Documentado como T14. **No implementar sin confirmación.**

**PARTE 5 — Rate limiter global 300→500 req/15min:**
- `apps/api/src/middleware/rateLimiter.ts`: `max: 300 → max: 500`.
- `authRateLimiter` (10 req/15 min en `/auth/*`) sin cambios.
- **Distinción documentada**: Express `express-rate-limit` (código nuestro, evita abusos) es completamente independiente de los límites del plan Railway (RAM, horas de ejecución).

**Tests añadidos/modificados:**
- `LibraryGameCard.test.tsx`: 5 tests badge PSN + 2 básicos (7 total, reescritos).

**Estado de calidad:**
| Categoría | Resultado |
|---|---|
| TypeScript strict (API + mobile) | ✅ 0 errores |
| Lint (API + mobile) | ✅ 0 errores, 0 warnings |
| Tests backend | ✅ 445/445 — 35 suites |
| Tests mobile | ✅ 233/233 — 20 suites |
| Cobertura API | ✅ 80.8% stmt / 83.66% branch |

---

### Sesión 15 — 2026-06-05 — APK #4 smoke test + diagnóstico producción

**Objetivo**: build local debug de APK #4 (todos los cambios sesiones 10-14) + smoke test contra API de producción.

**Build APK #4:**
- Pre-build checks: TS 0 errores, lint 0 errores, 445 API + 233 mobile tests pasando.
- `npx expo prebuild --platform android --clean` → `react-native bundle --dev false --entry-file expo-router/entry.js` con `EXPO_PUBLIC_API_URL=https://unlockhub-production.up.railway.app` + `NODE_ENV=production` → `gradlew assembleDebug`.
- `app-debug.apk` generada: **169 MB**, BUILD SUCCESSFUL en 3m 13s.
- Bundle verificado: contiene `unlockhub-production.up.railway.app` ✅.

**Hallazgos del smoke test:**

**HALLAZGO 1 — PSN sync: "Expired token" (infra, no código)**
- Síntoma: biblioteca muestra solo ~50 de 300+ juegos PSN; sync nunca completa.
- Causa: logs Railway muestran `Sync fallido platform="PSN" err="Expired token"` en cada intento desde las 22:43 del día anterior. El error se repite cada hora (background sync scheduler). RA sync funciona correctamente.
- Raíz: `PSN_SYSTEM_NPSSO` en Railway ha expirado. El valor en el navegador puede parecer idéntico al configurado en Railway, pero Sony invalida la sesión subyacente periódicamente incluso manteniendo el mismo valor de cookie. No es detectable comparando strings.
- Fix: logout + login en my.playstation.com → F12 → Application → Cookies → copiar nuevo `npsso` → actualizar `PSN_SYSTEM_NPSSO` en Railway Variables → Railway reinicia automáticamente.
- Frecuencia estimada: cada ~60 días. Los syncs PSN fallidos se reintentarán solos tras la renovación.

**HALLAZGO 2 — Auth rate limiter compartido con emulador (quirk de diagnóstico)**
- Síntoma: `RATE_LIMIT_EXCEEDED` al intentar login desde el emulador tras ejecutar pruebas curl desde la misma máquina.
- Causa: `authRateLimiter` (10 req/15 min en `/auth/*`) aplica por IP. El emulador Android y los comandos curl del sistema host comparten la misma IP externa (NAT del router). Múltiples peticiones curl de diagnóstico (incluyendo las mal formateadas) consumen el cupo del rate limiter y bloquean el login del emulador.
- Fix: esperar ~15 min para que se resetee la ventana. En diagnósticos futuros, evitar curl masivo a `/auth/*` si hay un emulador activo en la misma red.

**Estado de calidad (sin cambios de código):**
| Categoría | Resultado |
|---|---|
| TypeScript strict (API + mobile) | ✅ 0 errores |
| Lint (API + mobile) | ✅ 0 errores, 0 warnings |
| Tests backend | ✅ 445/445 — 35 suites |
| Tests mobile | ✅ 233/233 — 20 suites |
| APK #4 build | ✅ BUILD SUCCESSFUL — 169 MB |
| PSN sync | ⚠️ Falla con "Expired token" — NPSSO expirado (acción del desarrollador) |
| Auth login | ⚠️ Rate limit disparado por curl de diagnóstico — esperar 15 min |

---

### Sesión 14 — 2026-06-04 — UI polish + sync lockDuration

**Objetivo**: 8 bugs/mejoras de UI + fix de stalled jobs en sync de 300+ juegos PSN.

**PARTE 1 — Padding uniforme:**
- `pt-4` → `pt-2` en cabeceras de `index.tsx`, `search.tsx`, `rankings.tsx`, `friends.tsx` (×2), `game/[id].tsx` (×2).

**PARTE 2 — Sort button con label activo:**
- `{t('library.sort_button')} ▼` → `{activeSortLabel} ▼`. `activeSortLabel` ya se calculaba en el componente.

**PARTE 3 — Sort `last_played` con desempate:**
- El comparador ya era correcto. Causa raíz: `lastSyncedAt` es por plataforma (de `syncMap.get(g.platform)`), no por juego. Dentro de la misma plataforma todos los juegos tienen la misma fecha → orden aparentemente aleatorio.
- Fix: desempate secundario por `completionPct` desc cuando `lastSyncedAt` coincide.

**PARTE 4 — Contador juegos: denominador en gris:**
- `{totalCompletedGames}/{totalGames}` todo en `text-green-400` → split con `<Text className="text-gray-500">/{totalGames}</Text>` inline. Solo `totalCompletedGames` en verde.

**PARTE 5 — Badges PSN independientes:**
- Antes: `if (isCompleted) psnBadge = psn_100; else if (platinumEarned) psnBadge = psn_platinum` — mutuamente excluyentes.
- Ahora: `showPsnPlatinum = platform === 'PSN' && platinumEarned` y `showPsn100 = platform === 'PSN' && isCompleted`, dos renders independientes. Ambos pueden mostrarse simultáneamente (ej: platino ganado + 100% DLC incluido).

**PARTE 6 — `lib/platformColors.ts` centralizado:**
- Nuevo archivo con `PLATFORM_COLORS` (STEAM `#1b9aaa`, RA `#e8a838`, XBOX `#107c10`, PSN `#1e90ff`) y `getPlatformColor(platform, fallback?)`.
- `LibraryGameCard`, `GameCard`, `AchievementSearchCard` migrados a importar desde `platformColors.ts`.
- Fix colateral: `GameCard` y `AchievementSearchCard` tenían PSN `#003087` (contraste insuficiente) — ahora heredan `#1e90ff`.
- `profile.tsx` conserva su `PLATFORM_COLORS` propio (colores de dots indicadores, uso diferente: oscuros de marca).

**PARTE 7 — Toggle idioma en login:**
- `useLanguage` hook integrado en `LoginScreen`. Toggle ES|EN en esquina superior derecha (fuera del scroll), disponible sin autenticación.
- Clave i18n añadida: `auth.login.language_toggle` en ES/EN.
- `testID="language-toggle"` para selectores de test y Maestro.

**PARTE 8 — BullMQ lockDuration 5 min:**
- Causa: `lockDuration` por defecto = 30s. 300 juegos PSN / 10 por lote = 30 lotes con llamadas API → fácilmente > 30s → job marcado como stalled.
- Fix: `lockDuration: 300_000, stalledInterval: 30_000` en opciones del worker de sync.
- Conservador: no afecta syncs cortos (usuarios con < 20 juegos el lock se renueva normalmente).

**Tests añadidos:**
- `__tests__/lib/platformColors.test.ts` (nuevo): 7 tests — colores correctos, fallback, fallback personalizado.
- `__tests__/components/LibraryGameCard.test.tsx` (nuevo): 7 tests — 4 casos de badges PSN + 2 básicos.
- `__tests__/screens/LoginScreen.test.tsx`: 3 tests nuevos — toggle visible, `changeLanguage('en')`, `changeLanguage('es')`.
- `apps/api/src/__tests__/sync.worker.test.ts`: 2 tests nuevos — `lockDuration: 300_000`, `stalledInterval: 30_000`, `concurrency: 5`.

**Estado de calidad:**
| Categoría | Resultado |
|---|---|
| TypeScript strict (API + mobile) | ✅ 0 errores |
| Lint (API + mobile) | ✅ 0 errores, 0 warnings |
| Tests backend | ✅ 445/445 — 35 suites |
| Tests mobile | ✅ 233/233 — 20 suites |
| Cobertura API | ✅ 80.8% stmt / 83.66% branch |

---

### Sesión 13 — 2026-06-03 — Fix rate limiter producción

**Objetivo**: corregir `RATE_LIMIT_EXCEEDED` en producción que bloqueaba el acceso a RetroAchievements y eventualmente a toda la API (incluyendo `/health`).

**Causa raíz**: `globalRateLimiter` estaba configurado a `max: 100 / 15 min`. TanStack Query con infinite scroll, múltiples tabs cargando simultáneamente y pull-to-refresh genera decenas de peticiones en ráfaga al abrir la app — este límite se agotaba en uso normal. Adicionalmente, `/health` estaba declarado **después** de `app.use(globalRateLimiter)` en `app.ts`, por lo que UptimeRobot y el healthcheck de Railway también podían ser bloqueados.

**`apps/api/src/middleware/rateLimiter.ts`:**
- `max: 100` → `max: 300` (≈1 req cada 3 segundos de media — conservador pero funcional)

**`apps/api/src/app.ts`:**
- `/health` route movida **antes** de `app.use(globalRateLimiter)` — nunca debe ser rate-limited
- `authRateLimiter` (10 req/15min en `/auth/*`) sin cambios — correcto para seguridad

**Estado de calidad:**
| Categoría | Resultado |
|---|---|
| TypeScript strict (API + mobile) | ✅ 0 errores |
| Lint (API + mobile) | ✅ 0 errores, 0 warnings |
| Tests backend | ✅ 443/443 — 35 suites |
| Tests mobile | ✅ 216/216 — 18 suites |

---

### Sesión 12 — 2026-06-03 — Contador juegos completados/totales en biblioteca

**Objetivo**: añadir contador `completados/totales` de juegos a la cabecera de la biblioteca, junto al contador de logros ya existente.

**Backend — `apps/api/src/services/user.service.ts`:**
- `getMyGames` ahora devuelve `totalGames` (número de juegos distintos del usuario) y `totalCompletedGames` (juegos donde `earnedAchievements === totalAchievements`), calculados sobre `allGames` antes del `slice` de paginación — mismo patrón BUG-10.
- `isCompleted` ya existía en el map de `allGames` — reutilizado vía `.filter((g) => g.isCompleted).length`, sin duplicación.

**Mobile — `apps/mobile/hooks/useMyGames.ts`:**
- `LibraryPage` interface extendida con `totalGames: number` y `totalCompletedGames: number`.
- Ambos campos expuestos en el retorno del hook, leídos de `pages[0]` (mismo patrón que los otros aggregate stats).

**Mobile — `apps/mobile/app/(tabs)/index.tsx`:**
- Cabecera: condición cambiada de `totalAvailableAchievements > 0` a `totalGames > 0`.
- Contador de juegos: `{totalCompletedGames}/{totalGames}` en `text-green-400` + etiqueta `library.games_short`.
- `accessibilityElementsHidden` en los `Text` individuales; `accessibilityLabel` combinado en el `View` padre con claves `library.achievements_progress` y `library.games_progress`.

**i18n — ES + EN:**
- `library.games_short`: `"juegos completados"` / `"completed"`
- `library.achievements_progress`: `"{{earned}} logros / {{total}} totales"` / `"{{earned}} achievements / {{total}} total"`
- `library.games_progress`: `"{{completed}} juegos completados / {{total}} totales"` / `"{{completed}} games completed / {{total}} total"`

**Tests añadidos:**
- `user.service.test.ts`: 5 tests nuevos — `totalGames` = juegos distintos, `totalCompletedGames` con mezcla completado/incompleto, edge case 0 completados, edge case todos completados, pre-paginación (25 juegos / limit 20 / 5 completados).
- `FeedScreen.test.tsx`: 2 tests nuevos — contador visible con `includeHiddenElements: true` cuando `totalGames > 0`, invisible cuando `totalGames = 0`. `baseMyGamesResult` extendido con `totalGames: 0` y `totalCompletedGames: 0`.

**Decisiones tomadas:**
- `getByText('3/10', { includeHiddenElements: true })` en tests mobile — los `Text` tienen `accessibilityElementsHidden={true}`, lo que los excluye del árbol de accesibilidad; `includeHiddenElements` los hace encontrables por el test.

**Estado de calidad:**
| Categoría | Resultado |
|---|---|
| TypeScript strict (API + mobile) | ✅ 0 errores |
| Lint (API + mobile) | ✅ 0 errores, 0 warnings |
| Tests backend | ✅ 443/443 — 35 suites |
| Tests mobile | ✅ 216/216 — 18 suites |
| Cobertura API | ✅ 80.8% stmt / 83.66% branch |

---

### Sesión 11 — 2026-06-02 — Mock server, BUG-12, WCAG back buttons, i18n audit

**Objetivo**: emulador local funcional, banner sync incorrecto, espaciado, back buttons, idioma dispositivo, "Biblioteca", "Último jugado", auditoría i18n completa.

**Fixes:**
- **PARTE 1** ✅: `GET /api/v1/sync/status` añadido al mock server (`apps/api/mock-server.js`). Endpoint retorna todos los `DEMO_PLATFORMS` con `isRunning: false`. `useAuth.ts`: detección de errores de red ampliada para incluir `TypeError` y mensajes `'Network request failed'` / `'Network Error'` — cubría solo `err.message.includes('fetch')`.
- **BUG-12** ✅ (`useSyncProgress.ts`): `hydrateFromApi` añadía plataformas al Map pero nunca las eliminaba — si PSN terminaba y el socket se desconectaba, PSN quedaba stuckeada en el Map y el banner mostraba "Syncing PlayStation" durante un sync de RA. Fix: parámetro `socketSilent: boolean`. Cuando `true` (polling de fallback), reconstruye el Map desde cero con solo las plataformas en ejecución según Redis. Cuando `false` (mount), solo añade entradas nuevas para preservar el estado del socket.
- **PARTE 3** ✅ (`challenges.tsx`): `mt-6` → `mt-3` en skeleton y tarjeta de contenido — gap visual excesivo entre el título de sección y la tarjeta del reto.
- **PARTE 4** ✅: `game/[id].tsx` y `profile/[username].tsx` — botones back tenían solo `hitSlop` pero no `minWidth/minHeight`. Añadido `style={{ minWidth: 44, minHeight: 44, justifyContent: 'center' }}` en ambos para cumplir WCAG 2.1 AA.
- **PARTE 5** ✅ (`i18n/index.ts`): `fallbackLng: 'es'` → `'en'` y `?? 'es'` → `?? 'en'`. Dispositivos en francés/alemán/etc. ahora caen a inglés en lugar de español.
- **PARTE 6** ✅: `library.title` → `"Biblioteca"` / `"Library"`.
- **PARTE 7** ✅: `library.sort_last_played` → `"Último jugado"` / `"Last played"`. No se añade campo `lastPlayedAt` — `lastSyncedAt` es aproximación suficiente (Steam expone `rtime_last_played` pero PSN/RA no tienen equivalente; añadirlo requeriría modelo `UserGame`, migración y 3 adapters). Decisión documentada.
- **PARTE 8** ✅: Claves `profile.change_avatar`, `profile.avatar_error_title/message`, `profile.avatar_permission_title/message` añadidas en ES/EN (usadas en `profile.tsx` pero ausentes en ambos locale files). `friends.pending_item_label` añadida en ES/EN. `friends.tsx` línea 115: `accessibilityLabel` hardcodeado en español → `t('friends.pending_item_label', { username })`.

**Decisiones tomadas:**
- `socketSilent=false` en mount (no reconstruye Map) para preservar posibles eventos previos del socket que llegaron antes de la hidratación API.
- `socketSilent=true` solo en el timer de polling (cuando el socket lleva >5s silencioso), reconstruyendo desde la verdad de Redis.
- No se añade `lastPlayedAt` a `Game` ni `UserGame` — ver PARTE 7 arriba.

**Estado de calidad:**
| Categoría | Resultado |
|---|---|
| TypeScript strict (API + mobile) | ✅ 0 errores |
| Lint (API + mobile) | ✅ 0 errores, 0 warnings |
| Tests backend | ✅ 438/438 — 35 suites |
| Tests mobile | ✅ 214/214 — 18 suites |
| Cobertura API | ✅ 80.77% stmt / 83.66% branch |

---

### Sesión 10 — 2026-06-01 — BUG-7 a BUG-11 + PSN states + Sort + Color

**Objetivo**: 5 bugs críticos + estados PSN + ordenación biblioteca + color PSN + optimización sync.

**Bugs corregidos:**
- **BUG-7** ✅: `useSyncProgress` reescrito con `Map<string, SyncProgressState>` — syncs concurrentes no se sobreescriben.
- **BUG-8** ✅: `hydrateFromApi()` en mount + polling fallback 2s si Socket.io silencioso >5s — el race condition de conexión async ya no deja la barra stuckeada.
- **BUG-9** ✅: `addXp(userId, xpEarned, 'ACHIEVEMENT')` añadido en `sync.worker.ts` tras calcular `xpEarned` — XP ahora se persiste correctamente tras cada sync.
- **BUG-10** ✅: `totalEarnedAchievements`/`totalAvailableAchievements` calculados sobre todos los juegos antes del `slice` de paginación — el header muestra el total real, no el de la página actual.
- **BUG-11** ✅: XBOX eliminado del array `FILTERS` en `app/(tabs)/index.tsx` — `PlatformFilter` es ahora `'ALL' | 'STEAM' | 'RA' | 'PSN'`.

**Features/mejoras:**
- PSN states en `LibraryGameCard`: badge `🏆 Platino` (`#f5c518`) cuando `platinumEarned`, badge `🥇 100%` (`#22c55e`) cuando `isCompleted` en juego PSN. `getMyGames` consulta `prisma.achievement.findMany` para detectar platino por `normalizedPoints === 300`.
- Sort modal en biblioteca: 5 opciones (`last_played`, `alpha_asc`, `alpha_desc`, `pct_desc`, `pct_asc`). Client-side sobre datos ya cargados. Persistido en AsyncStorage via `preferencesStore`.
- Color PSN cambiado de `#003087` a `#1e90ff` (WCAG ratio ~6.5:1 sobre fondo oscuro, supera AA).
- i18n ES/EN: claves `syncing`, `syncing_a11y`, `sync_complete`, `sync_complete_a11y`, `sort_*`, `psn_platinum`, `psn_100`.
- `LibrarySortOrder` movido a `preferencesStore.ts` (eliminada dependencia circular con `app/(tabs)/index`).
- `@react-native-async-storage/async-storage` mockeado globalmente en `jest.setup.ts`.

**Tests añadidos:**
- `user.service.test.ts`: 11 tests nuevos — PSN hasPlatinum/platinumEarned/isCompleted, BUG-10 aggregate stats pre-paginación, Steam/isCompleted para non-PSN. Mock `prisma.achievement.findMany` añadido al mock de Prisma.
- `sync.worker.test.ts`: 2 tests nuevos BUG-9 — verifica que `addXp` se llama con la suma de `normalizedPoints` cuando hay logros nuevos, y que NO se llama si `xpEarned === 0`. Mock `user.service.addXp` añadido.
- `useSyncProgress.test.ts`: reescrito completamente — 14 tests con nueva API Map. BUG-7 (multi-plataforma), BUG-8 (hidratación API), callbacks, limpieza.

**Estado de calidad:**
| Categoría | Resultado |
|---|---|
| TypeScript strict (API + mobile) | ✅ 0 errores |
| Lint (API + mobile) | ✅ 0 errores, 0 warnings |
| Tests backend | ✅ 438/438 — 35 suites |
| Tests mobile | ✅ 214/214 — 18 suites |
| Cobertura API | ✅ 80.77% stmt / 83.66% branch |

---

### Sesión 7 — 2026-05-30 — Smoke test APK #3 ✅

**Objetivo**: smoke test completo de APK #3 (16 pasos). Verificar AdMob banners, nuevo flujo PSN username-only, banner perfil privado, re-confirmar BUG-3/4/5.

**Resultado**: 15/16 pasos completados. 1 bug nuevo encontrado (BUG-6). 0 crashes nuevos.

**Bugs encontrados:**
- **BUG-6** 🟡: PSN link screen muestra el flujo NPSSO antiguo ("To connect your PSN account you need your NPSSO token") en lugar del nuevo flujo de username. Causa: Metro bundler usó bundle JS cacheado de antes de los commits PSN (`0f32f35`, `f4a172e`). La causa del cache stale es que `gradlew assembleDebug` no llama a `expo export` — reutiliza el bundle de la compilación previa si el archivo existe. Fix: ejecutar `npx expo prebuild --platform android --clean` (o borrar `android/app/src/main/assets/index.android.bundle`) antes de `gradlew assembleDebug`.

**Bugs re-verificados ✅:**
- BUG-3 (Rankings crash): ✅ Arreglado
- BUG-4 (UGC guides crash): ✅ Arreglado
- BUG-5 (Login wrong password → generic error): ✅ Arreglado

**Pantallas verificadas ✅:** Registro+onboarding, Login, Home+AdMob banner, Search+AdMob+filtros logros, Rankings, Friends, Challenges, Notifications, Profile+Steam validation+RA validation, Game detail (filtros/sort/guides), Wrapped 2025+2024, Perfil público (COMPARISON section), Performance (0 ANR nuevos).

**Notas de entorno:**
- UMP GDPR: sin dialog (correcto — emulador US = NOT_REQUIRED)
- Offline mode: no testeable (emulador usa bridge de red del host, `svc wifi/data disable` no corta la conectividad real)
- AdMob: banner visible como "Espacio publicitario" (placeholder de test — correcto con test App IDs)
- Filter chips: H~30dp (pre-existente, no regresión APK #3)

**Fix BUG-6 para APK #4:**
```bash
# Desde apps/mobile/:
npx expo prebuild --platform android --clean
# Añadir en AndroidManifest.xml (APPLICATION_ID meta-data) — ver Sesión 6
cd android && gradlew assembleDebug
```

**Estado de calidad (pre-test, sin cambios de código esta sesión):**
| Categoría | Resultado |
|---|---|
| TypeScript strict (API + mobile) | ✅ 0 errores |
| Lint (API + mobile) | ✅ 0 errores, 0 warnings |
| Tests backend | ✅ 415/415 |
| Tests mobile | ✅ 188/188 |

---

### Sesión 6 — 2026-05-30 — APK #3 ✅ (build local debug)

**Objetivo**: generar APK #3 con todos los cambios desde APK #2 (`27d0e02d`, 2026-05-27).

**APK generada**:
- Ruta local: `apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk`
- Tamaño: 165.7 MB
- Tipo: debug (signed con debug keystore automático)
- Diferencia vs EAS preview: sin minificación R8, sin ProGuard. Para smoke test es equivalente funcional.

**Cambios incluidos desde APK #2:**
- AdMob + UMP SDK (`react-native-google-mobile-ads`, `useInterstitialAd`, `useRewardedAd`, endpoint `POST /api/v1/points/rewarded-ad`)
- PSN flujo de sistema (`PSN_SYSTEM_NPSSO`): usuario solo proporciona username, sin NPSSO propio
- PSN perfil privado: `psnProfilePrivate` en schema, `checkPsnProfilePrivacy()`, banner ⚠️ en link screen, badge en Profile
- 2 tests rewarded-ad en `points.service.test.ts`
- `.gitignore` fix (`/app.json` solo en root)
- Downgrade `react-native-google-mobile-ads` v16→v13 (build fix)

**Pre-build checks (pasados antes de lanzar el build):**
| Categoría | Resultado |
|---|---|
| TypeScript strict (API + mobile) | ✅ 0 errores |
| Lint (API + mobile) | ✅ 0 errores, 0 warnings |
| Tests backend | ✅ 415/415 |
| Tests mobile | ✅ 188/188 |

**Historial de intentos EAS (todos fallaron, resuelto localmente):**
| Build ID | Resultado | Causa del error |
|---|---|---|
| `7b5ba56d` | ❌ Fallo Gradle | Plugin `react-native-google-mobile-ads` no resuelto (`find-up` interceptado por `lib/commonjs/package.json`) |
| `22e28dd7` | ❌ Fallo Gradle | Mismo error |
| `2ef1ef80` | ❌ Fallo Gradle | `play-services-ads:25.0.0` metadata Kotlin 2.2.0 vs compilador 1.9.0 |
| local debug | ✅ BUILD SUCCESSFUL | Downgrade v13 + `play-services-ads:23.1.0` (Kotlin 1.x) |

**Causa raíz resuelta** — `play-services-ads:25.0.0` (incluido en v16+) usa metadata Kotlin 2.2.0. El compilador de React Native es 1.9.0 y no puede leerlo. Subir `kotlinVersion` en `expo-build-properties` cambia el stdlib pero no el compilador (controlado por el gradle plugin de React Native), causando un conflicto inverso en `expo-modules-core`. Solución definitiva: downgrade a v13.6.1 que usa `play-services-ads:23.1.0` (Kotlin 1.x).

**Cambios en `app.json` para v13:**
- Eliminado: `["../../node_modules/react-native-google-mobile-ads/app.plugin.js", {...}]` (v13 no tiene app.plugin.js)
- Añadido: clave `react-native-google-mobile-ads.android_app_id` en root del JSON (mecanismo nativo de v13)
- Revertido: `kotlinVersion: "1.9.23"` (no necesario con v13)

**Instalar APK en emulador:**
```bash
# Arrancar emulador, luego:
adb install apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk
```

**Regenerar APK localmente (si se cambia código):**
```bash
# Desde apps/mobile/:
npx expo prebuild --platform android --clean
# Añadir manualmente en android/app/src/main/AndroidManifest.xml (dentro de <application>):
# <meta-data android:name="com.google.android.gms.ads.APPLICATION_ID" android:value="ca-app-pub-3940256099942544~3347511713"/>

# PASO CRÍTICO: generar bundle JS manualmente antes de Gradle
# Gradle no llama a Metro en debug builds con este setup de Expo — sin este paso la app crashea
# con "Unable to load script. index.android.bundle is not packaged correctly"
# NODE_ENV=production + --dev false es obligatorio para que Babel inlinee EXPO_PUBLIC_* vars;
# en modo --dev true el transform no las inlinea y process.env queda vacío en Hermes → fallback localhost:3000
mkdir -p android/app/src/main/assets
EXPO_PUBLIC_API_URL=https://unlockhub-production.up.railway.app NODE_ENV=production npx react-native bundle \
  --platform android \
  --dev false \
  --entry-file "../../node_modules/expo-router/entry.js" \
  --bundle-output android/app/src/main/assets/index.android.bundle \
  --assets-dest android/app/src/main/res

# Compilar (incremental si ya se hizo un build completo antes)
cd android && JAVA_HOME="C:/Program Files/Android/Android Studio/jbr" ANDROID_HOME="C:/Users/Juanjo/AppData/Local/Android/Sdk" ./gradlew assembleDebug
```

**EAS Build (cuando se quiera publicar en Play Store):**
Con el downgrade a v13, `eas build --platform android --profile preview --non-interactive` también debería funcionar ahora (sin el conflicto Kotlin). La cuota EAS resetea 2026-06-01.

---

**Fecha**: 2026-05-30 (sesión 5) — PSN perfil privado implementado: `psnProfilePrivate` en schema, `checkPsnProfilePrivacy()`, banner ⚠️ en link screen, badge en Profile, tests. 415 API + 188 mobile. 0 errores TS/lint.

### Sesión 5 — 2026-05-30

**PSN perfil privado — implementación completa:**
- `PlatformAccount.psnProfilePrivate Boolean @default(false)` + migración `20260530000000_psn_profile_private`
- `checkPsnProfilePrivacy(auth, accountId)` en `psn.adapter.ts`: probe `getUserTitles limit:1` al vincular
- `linkPsnHandler`: si privado → vincula con `psnProfilePrivate: true`, omite sync. Si público → vincula + sync express como antes
- `fetchUserTitles`: envuelve bucle en try/catch → lanza `AppError('PSN_PROFILE_PRIVATE', 403)` si `getUserTitles` falla
- `sync.worker.ts`: captura `PSN_PROFILE_PRIVATE` → marca flag en BD. Camino de éxito siempre resetea `psnProfilePrivate: false`
- `link-platform/psn.tsx`: vista inline con banner ⚠️ + pasos + CTA "Ir a biblioteca" cuando `account.psnProfilePrivate === true`
- `profile.tsx`: badge ⚠️ (testID `psn-private-badge`) junto a cuenta PSN privada; `lastSyncedAt` oculto cuando privado
- i18n ES/EN: claves `profile_private_title/body/cta/step1-3/go_library`
- Tests: `checkPsnProfilePrivacy` (false/true), `PSN_PROFILE_PRIVATE` en syncUser, banner/badge en mobile (16 suites / 188 tests)

**Estado de calidad:**
| Categoría | Resultado |
|---|---|
| TypeScript strict (API + mobile) | ✅ 0 errores |
| Lint (API + mobile) | ✅ 0 errores, 0 warnings |
| Tests backend | ✅ 415/415 |
| Tests mobile | ✅ 188/188 |

**Fecha**: 2026-05-29 (sesión 4) — Re-seed kikecorrales10 completado: 879 juegos PSN + 36.649 logros. BD total: ~2.600 juegos + ~142.574 logros. NPSSO consumido → necesita renovación para backfill consola.

### Sesión 4 — 2026-05-29

**Re-seed kikecorrales10 completado:**
- 882 títulos procesados → **879 juegos PSN, 36.649 logros** insertados vía upsert
- 59 errores de conexión puntual con BD (proxy pública `yamanote.proxy.rlwy.net`) — el script continuó correctamente con try/catch
- Token PSN refrescado en títulos 101, 201, 301, 401, 501, 601, 701, 801 — fix `a2dc1e4` funcionó correctamente
- **NPSSO consumido** tras el seed: PSN invalida el NPSSO después del primer intercambio de tokens. El backfill de consola falló con "Is your NPSSO code valid?" — necesita nuevo NPSSO.

**BD Railway estimada (post sesión 4):** ~2.600 juegos + ~142.574 logros (kikecorrales10 añadió ~529 juegos nuevos + ~29.000 logros al total anterior de 2.161/105.925).

**Git log top 5 (develop):**
```
f2a45dd docs: estado sesión 3 — AdMob commiteado, guard Steam confirmado
5038dda chore: eliminar check-counts.ts + cerrar investigación guard Steam
e7076a8 feat: AdMob + UMP SDK — rewarded-ad endpoint, hooks, AdBanner por placement, migración REWARDED_AD
49363a1 docs: BD Railway definitiva 2026-05-29 — 2161 juegos, 0 vacíos
d257bfd docs: CLAUDE.md PSN sistema credenciales + estado BD 2026-05-29
```

**Estado de calidad (sin cambios de código esta sesión):**
| Categoría | Resultado |
|---|---|
| TypeScript strict (API + mobile) | ✅ 0 errores |
| Lint (API + mobile) | ✅ 0 errores, 0 warnings |
| Tests backend | ✅ 412/412 |
| Tests mobile | ✅ 179/179 |

**Pendiente para próxima sesión (todo es acción del desarrollador, no código):**
1. ✅ **`PSN_SYSTEM_NPSSO` renovado** en Railway Variables (2026-05-29 sesión 4).
2. ✅ **Backfill console kikecorrales10 completado** — 882 juegos actualizados: PS4(417) + PS5(409) + PS3(23) + PSVITA(6) + cross-gen(27).
3. ✅ **Backfill console Adramm completado** — 509 juegos PSN actualizados con `console` (PS5/PS4/PS3/PSVITA).
4. ✅ **Railway variables configuradas**: `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `APP_SCHEME=unlockhub`, `CLOUDINARY_URL`, `ADMIN_SECRET`, `LOGTAIL_SOURCE_TOKEN` (N2 ✅), `POSTHOG_API_KEY` (N4 ✅) — todas configuradas.
5. **EAS Build producción** (N5) — NO lanzar sin pedirlo explícitamente en ese mensaje.
6. **T8**: upgrade Expo SDK 51→55 + vulnerabilidades build-time. PR dedicado post-lanzamiento.

**Nota NPSSO**: el NPSSO es una cookie de sesión de PlayStation que PSN invalida tras el primer intercambio por access+refresh tokens. Los scripts de seed usan `buildAuthWithRefresh()` que consume el NPSSO una vez y luego renueva con el refresh token. Para volver a autenticar desde cero (backfill, nuevo seed) se necesita un NPSSO fresco.

**Fecha**: 2026-05-29 (sesión 2) — Sistema de vinculación PSN migrado a credenciales del sistema. 0 errores TS/lint. 412 tests API + 179 mobile. 4 commits en `develop`.

### PSN sistema de credenciales — sesión 2026-05-29

**Objetivo**: cambiar el flujo de vinculación PSN de "el usuario proporciona su NPSSO" a "el usuario proporciona su username público, el backend usa sus propias credenciales" — mismo modelo que PSNProfiles/TrueTrophies/Exophase.

#### Archivos modificados
- **`packages/validators/src/platform.validators.ts`**: `linkPsnAccountSchema` cambiado de `{ npsso }` a `{ username: string (3-16 chars, regex [A-Za-z0-9_-]) }`.
- **`apps/api/src/config/env.ts`**: `PSN_SYSTEM_NPSSO: z.string().optional()` añadido.
- **`apps/api/.env.example`**: sección `PSN_SYSTEM_NPSSO` con instrucciones de obtención.
- **`apps/api/src/platforms/psn.adapter.ts`**: `getSystemPsnAuth()` + `lookupPsnUser()` exportadas. `syncUser()` usa `getSystemPsnAuth()` + `account.externalId`. `buildAuthWithRefresh()` hecho público (lo sigue usando `seed-games.ts`). `fetchUserTitles()` y `fetchMergedTrophies()` reciben `accountId` explícito.
- **`apps/api/src/controllers/platform.controller.ts`**: `linkPsnHandler` acepta `{ username }`, llama `lookupPsnUser` → obtiene `accountId` + `onlineId`, persiste con `encryptedToken: ''`.
- **`apps/mobile/app/link-platform/psn.tsx`**: reescrito — formulario de username simple + guía expandible 3 pasos "¿Cómo hacer tu perfil público?". Sin NPSSO, sin cookies, sin banner de reauth.
- **`apps/mobile/i18n/locales/es.json` + `en.json`**: sección `psn` actualizada — nuevas claves `username_label/placeholder/hint`, `guide_title/step1-3`, `error_not_found/service_unavailable`.
- **`apps/api/src/platforms/psn.adapter.test.ts`**: reescrito — tests de `getSystemPsnAuth` (cache hit, cache miss, no configurado, NPSSO expirado), `lookupPsnUser` (encontrado, no encontrado), `PsnAdapter.syncUser` (usa token del sistema, no actualiza `encryptedToken`).
- **`apps/api/src/__tests__/psn.adapter.test.ts`**: reescrito — tests de `buildAuthWithRefresh` (token válido, access expirado, refresh expirado, token corrupto).

#### Estado de calidad
| Categoría | Resultado |
|---|---|
| TypeScript strict (API) | ✅ 0 errores |
| TypeScript strict (mobile) | ✅ 0 errores |
| Lint (API) | ✅ 0 errores, 0 warnings |
| Lint (mobile) | ✅ 0 errores, 0 warnings |
| Tests backend | ✅ 412/412 |
| Tests mobile | ✅ 179/179 |

#### BD Railway post-seed Adramm + limpieza (2026-05-29)
- Seed parcial: Adramm procesó 345/948 títulos antes de que el NPSSO expirara.
- **19 juegos Steam vacíos** eliminados — residuos anteriores a la corrección del 2026-05-22 que sobrevivieron esa limpieza. El guard `if (schema.length === 0 || playerAchievements.length === 0) continue` está en `processGames()` (método compartido), que es llamado por `syncUser`, `syncUserExpress` y `syncUserBatched` — todos los caminos están cubiertos. No hay fix de código pendiente.
- **Totales finales**: **2.161 juegos (80 Steam + 1.001 RA + 1.080 PSN) + 105.925 logros, 0 juegos sin logros.**
- kikecorrales10: seed parcial — 350/882 juegos. Token PSN expiró a mitad + caída breve de BD. Fix aplicado (`a2dc1e4`): refresco de token cada 100 títulos.
- ✅ **Backfill console Adramm completado** (sesión 2026-05-29): 509 juegos PSN actualizados con `console`.

#### Acciones pendientes para el desarrollador
1. ✅ **`PSN_SYSTEM_NPSSO`** — configurar en Railway dashboard → Variables. **Sin esto, el sync PSN de usuarios no funcionará en producción.**
2. **Re-seed kikecorrales10** (350/882 juegos, token expiró): `cd apps/api && railway run -- sh -c 'DATABASE_URL="${DIRECT_URL:-$DATABASE_URL}" PSN_NPSSO="${PSN_NPSSO:-$PSN_SYSTEM_NPSSO}" npx tsx ../../scripts/seed-games.ts --only-psn --usernames="kikecorrales10"'`
3. ✅ Backfill `console` Adramm completado — 509 juegos actualizados.
4. ✅ Eliminado `apps/api/check-counts.ts` (script temporal de verificación).

**Nota importante**: Al ejecutar scripts localmente via `railway run`, usar siempre `DATABASE_URL="${DIRECT_URL:-$DATABASE_URL}"` — la URL interna `postgres.railway.internal` no es accesible desde fuera de Railway. `DIRECT_URL` (proxy pública `*.proxy.rlwy.net`) funciona desde local.

**Fecha**: 2026-05-29 — Revisión pre-lanzamiento completa. Sin datos sensibles. 0 errores TS/lint. 407 tests pasando. 2 fixes aplicados.

### Revisión pre-lanzamiento — sesión 2026-05-29

**Objetivo**: auditoría completa de seguridad, código, tests y configuración antes de publicar en Play Store.

#### Seguridad ✅
- **Historial Git**: limpio. Los placeholders `[NIF_DESARROLLADOR]` / `[NOMBRE_DESARROLLADOR]` son el resultado de la limpieza `git filter-branch` de 2026-05-28. 0 datos personales reales en el historial.
- **AdMob IDs**: solo IDs públicos de prueba de Google (`ca-app-pub-3940256099942544/*`) en el código. IDs de producción en EAS secrets — nunca en el repo.
- **`.env`**: nunca fue commitado. `.gitignore` cubre `.env`, `.env.local`, `*.pem`, `*.jks`, `google-play-service-account.json`.
- **`console.log`**: 0 ocurrencias en código de producción.
- **TODO/FIXME**: 0 en código fuente.

#### Correcciones aplicadas
- **`chore: .gitignore`** — `app.json` cambiado a `/app.json` para que la regla solo aplique al directorio raíz, evitando que `apps/mobile/app.json` quede untrackeable si se elimina del índice.
- **`test: claimRewardedAdPoints`** — 2 tests añadidos a `points.service.test.ts`: camino feliz (otorga 10 pts + escribe en Redis) y cooldown activo (lanza 429 `REWARDED_AD_COOLDOWN`).

#### Estado de calidad
| Categoría | Resultado |
|---|---|
| TypeScript strict (API) | ✅ 0 errores |
| TypeScript strict (mobile) | ✅ 0 errores |
| Lint (API) | ✅ 0 errores, 0 warnings |
| Lint (mobile) | ✅ 0 errores, 0 warnings |
| Tests backend | ✅ 407/407, cobertura 80.59% stmt / 82.44% branch |
| Tests mobile | ✅ 179/179 |
| console.log en producción | ✅ 0 |
| TODO/FIXME en código | ✅ 0 |
| Datos sensibles en código | ✅ 0 (solo placeholders y test IDs públicos) |
| Datos sensibles en historial Git | ✅ 0 (limpieza previa confirmada) |
| .env commitado | ✅ Nunca |

#### Vulnerabilidades npm (sin cambios respecto a T8)
- **API — 2 high**: `node-tar` vía `@mapbox/node-pre-gyp` — build-time, no runtime. Sin fix no-breaking disponible.
- **API — 5 moderate**: `ws` (socket.io), `brace-expansion`. Fix requiere `--force` con breaking changes.
- **Mobile — 17 high + 15 moderate**: `node-tar` + `ws` vía Expo build tooling — build-time. Pendiente T8 post-lanzamiento.
- **Ninguna vulnerabilidad nueva de runtime** detectada.

#### Edge cases revisados ✅
- `steam.adapter.ts`: guards `schema.length === 0 || playerAchievements.length === 0` antes del upsert. Arrays con null coalescing. Errores de red con fallback a `[]`.
- `psn.adapter.ts`: `buildAuthWithRefresh()` maneja access token expirado + refresh expirado (`PSN_REFRESH_TOKEN_EXPIRED`). Guard `trophies.length === 0` antes del upsert.
- `authenticate.ts`: token Bearer correcto. `authenticateOptional` no falla sin token.
- `sync.worker.ts`: Redis progress key eliminada en error (`redis.del`) y en completado. Socket.io emit solo si `io !== null`. `requiresReauth=true` en PSN refresh expirado.
- `AdBanner.tsx` / `useRewardedAd.ts` / `useInterstitialAd.ts`: `user?.isPremium` check al inicio. `admobModule` con try/catch. `EARNED_REWARD` antes de `CLOSED` para la recompensa.
- Paginación: `limit.max(50)` en todos los endpoints vía Zod.
- Rate limiting: global (100 req/15min), auth (10 req/15min), search (60 req/min), rewarded-ad (cooldown 3h Redis).

#### Configuración verificada ✅
- `app.json`: versión 1.0.0, bundleIdentifier correcto, AdMob test App IDs. `usesCleartextTraffic: true` — decisión documentada para SDK 51, inofensiva en prod (API es HTTPS).
- `eas.json`: preview → Railway prod URL, production → app-bundle, `google-play-service-account.json` gitignoreado.
- `railway.json`: `preDeployCommand: npx prisma migrate deploy`, healthcheck `/health`, restart on failure.

#### Pendiente (no bloqueante para lanzamiento)
- T8: upgrade Expo SDK 51→55 + fix vulnerabilidades build-time. PR dedicado post-lanzamiento.
- `usesCleartextTraffic: true` — evaluar usar `app.config.js` para hacerlo profile-dependent al subir a SDK 55.

---

**Fecha**: 2026-05-28 — AdMob + UMP SDK integrado: `react-native-google-mobile-ads`, `useInterstitialAd`, `useRewardedAd`, endpoint rewarded-ad backend, migración `REWARDED_AD`.

### AdMob + UMP SDK — sesión 2026-05-28

- **`react-native-google-mobile-ads`** instalado en `apps/mobile`.
- **`app.json`**: plugin `react-native-google-mobile-ads` con test App IDs (Android `~3347511713`, iOS `~1458002511`). ⚙️ Sustituir por los IDs de producción cuando estén disponibles (B8-B9).
- **`components/AdBanner.tsx`**: nuevo prop `unitId: 'home' | 'search'` — usa `EXPO_PUBLIC_ADMOB_HOME_BANNER_ID` / `EXPO_PUBLIC_ADMOB_SEARCH_BANNER_ID`. Fallback a test ID de Google. Carga dinámica con try/catch — funciona aunque el módulo nativo no esté disponible.
- **`app/(tabs)/index.tsx`**: `<AdBanner unitId="home" />`.
- **`app/(tabs)/search.tsx`**: `<AdBanner unitId="search" />` añadido bajo los chips de filtro.
- **`hooks/useInterstitialAd.ts`**: pre-carga el anuncio al montar. `show()` fire-and-forget. Solo activo para usuarios free. Re-carga automática tras cierre.
- **`hooks/useRewardedAd.ts`**: `showForReward()` devuelve `Promise<number | null>`. Llama `POST /api/v1/points/rewarded-ad` solo si el usuario completa el anuncio (`EARNED_REWARD` recibido antes de `CLOSED`).
- **`apps/api/src/services/points.service.ts`**: `claimRewardedAdPoints()` — cooldown 3h por usuario en Redis (`rewarded-ad:{userId}`), crea `UserPoint` con `reason: REWARDED_AD`, devuelve `{ pointsEarned: 10 }`. Error 429 si cooldown activo.
- **`apps/api/src/controllers/points.controller.ts`**: `rewardedAdHandler`.
- **`apps/api/src/routes/points.routes.ts`**: `POST /rewarded-ad`.
- **`apps/api/prisma/schema.prisma`**: `REWARDED_AD` añadido a enum `PointReason`.
- **`packages/types/src/index.ts`**: `PointReason` actualizado con `REDEEM | REWARDED_AD`.
- **Migración**: `20260528000000_point_reason_rewarded_ad` — `ALTER TYPE "PointReason" ADD VALUE 'REWARDED_AD'`.
- **Test IDs integrados en código**: Banner `6300978111`, Interstitial `1033173712`, Rewarded `5224354917`. Sin hardcoding de IDs de producción — siempre via `EXPO_PUBLIC_*` env vars (EAS secrets, repo público).
- **TypeScript**: 0 errores API + 0 errores mobile. Lint: 0 errores.

---

**Fecha**: 2026-05-28 — limpieza de historial Git: NIF y domicilio del desarrollador eliminados de todos los commits.

### Limpieza de datos personales del historial Git — sesión 2026-05-28

- **Problema**: `docs/privacy-policy.html` tenía NIF y domicilio del desarrollador en el historial desde el commit `b4a22ec`. El repo había sido hecho público para GitHub Pages y luego vuelto a privado, pero el historial quedó con esos datos.
- **Solución**: `git filter-branch --tree-filter "node /tmp/clean-sensitive.js"` ejecutado sobre los 164 commits. El script Node.js eliminó los datos sensibles de todos los blobs afectados.
- **Resultado**: 0 ocurrencias de NIF o domicilio en `git log --all -p`. Force push a `origin/develop`.
- **Estado actual del fichero**: solo contiene `Responsable: Juan Jose Muñoz Reja Villalba` + email de contacto — sin NIF ni dirección.
- **Acción pendiente del desarrollador**: hacer el repo público de nuevo en GitHub → Settings → Danger Zone → Change visibility → Public. GitHub Pages se reactivará automáticamente.

---

**Fecha**: 2026-05-27 — smoke test completo APK #2 `27d0e02d-bc78-438f-b41b-6e308f22a8a2` — BUG-3/4/5 validados, 0 bugs nuevos encontrados.

### Smoke test APK `27d0e02d` — sesión 2026-05-27

Prueba manual completa contra emulador `emulator-5554` (1080×2400, API producción). Cuenta: TestUser99 / test99@example.com / Test1234!.

**Pre-build checks:** TypeScript 0 errores · Lint 0 errores · Tests 179 mobile + 405 API passing.

**BUG-3/4/5 confirmados ✅:**
- BUG-3 (Rankings crash): ✅ Rankings carga correctamente — Global/National/Steam/RetroAchievements/PlayStation sin crash
- BUG-4 (UGC Guides crash): ✅ Guías muestran `user.username` correctamente — no crash al submit
- BUG-5 (Login wrong password → error genérico): ✅ "Email o contraseña incorrectos. Por favor, comprueba tus datos." en rojo

**Pantallas verificadas (✅ sin issues):** Home autenticado (filtros All/Steam/RA/PSN/Xbox, empty state correcto), Notifications center (empty state), Rankings (5 filtros sin crash), Search Games (resultados con badges de plataforma), Search Achievements (XP/rareza/locked state/sub-filtros plataforma/sin Xbox), Challenges (empty state), Friends (empty state + CTA), Profile (Level/XP/Streak, platform links, Advanced Stats paywall, Gaming Wrapped 2025/2024), Wrapped 2025 (empty state sin crash), Language toggle ES↔EN (toda la UI cambia: tabs, secciones, botones, dialogs), Logout (confirmación en idioma activo, redirect correcto).

**0 bugs nuevos encontrados.**

**Nota técnica — entrada de `!` via adb:** `adb shell input text "Test1234!"` no envía `!` correctamente. Solución: `input text "Test1234"` + cambiar a teclado de símbolos (`?123`) + tap directo en tecla `!` en pantalla.

**Pendiente (requiere acción del desarrollador):**
- Vinculación Steam/RA/PSN con credenciales reales + sync progresivo E2E
- Forgot Password (requiere `RESEND_API_KEY` en Railway — acción B3)

---

**Fecha**: 2026-05-26 — smoke test exhaustivo APK preview `d226d5a5` + fix BUG-3, BUG-4, BUG-5.

### Smoke test APK `d226d5a5` — sesión 2026-05-26

Prueba manual completa contra emulador `emulator-5554` (1080×2400, API producción). Cuenta: TestUser99 / test99@example.com / Test1234!.

**Pantallas verificadas (✅ sin issues):** Register flow completo (validación GDPR edad <16, enlaces ToS/PP, onboarding 3 pasos), Login, Forgot Password, Home autenticado (empty state, filtros, ad placeholder), Search (Games/Achievements/People con sub-filtros), game/[id] completo (header con progreso, filtros All/Unlocked/Pending, sort rarity, share/challenge/guides UGC), Challenges (empty state correcto), Profile completo (stats, vincular plataformas Steam/RA/PSN, Advanced Stats paywall, Wrapped, Settings ES↔EN, delete account dialog, Privacy Policy in-app, Notifications), profile/[username] (sección COMPARISON).

**Bugs encontrados y estado:**

- **BUG-3** ✅ Fix commit `a8a8901`: Rankings crash "Cannot read property 'toLocaleString' of undefined" — `ranking.service.ts` devolvía `{global, globalTotal}` en lugar de `{rank, xp}`; tab protegido por ErrorBoundary hasta nuevo APK.
- **BUG-4** ✅ Fix commit `a8a8901`: Crash al ver guías tras submit — `Guide` interface usaba `author.username` pero la API devuelve `user.username`. Interfaz corregida en `game/[id].tsx`.
- **BUG-5** ✅ Fix commit `586c62f`: Login contraseña incorrecta → "error inesperado" en lugar de "Email o contraseña incorrectos". Causa: `apiRequest` interceptaba el 401 de login e intentaba refrescar el token. Fix: `{ skipRefresh: true }` en `loginMutation` y `registerMutation` de `useAuth.ts`.

---

**Fecha**: 2026-05-18 — documentación legal publicada: Privacy Policy + ToS en GitHub Pages, texto legal en pantalla de registro, datos del desarrollador rellenados.

### Cambios sesión 2026-05-18 (legal + hosting)

- **`docs/privacy-policy.html`**: Política de privacidad GDPR completa en español — 14 secciones, bases legales Art. 6.1, terceros (AdMob/Sentry/Cloudinary/PostHog/Resend/Railway), derechos RGPD, edad mínima 16 años. Datos del desarrollador rellenados.
- **`docs/terms-of-service.html`**: ToS completos en español para Google Play — suscripción premium (2,99€/mes · 19,99€/año), sistema de puntos (sin valor monetario), plataformas de terceros, ley española.
- **`docs/index.html`**: Índice con enlaces a ambos documentos.
- **GitHub Pages**: Repo hecho público. Pages activo desde branch `develop`, carpeta `/docs`. Auto-deploy en cada push. URLs en vivo verificadas (200).
- **`app/privacy.tsx`**: `PRIVACY_POLICY_URL` actualizado a URL real de GitHub Pages.
- **`app/(auth)/register.tsx`**: Bloque de texto legal con `Linking.openURL` a ToS y Privacy Policy antes del botón de submit. Claves i18n nuevas.
- **`apps/mobile/i18n/locales/es.json` + `en.json`**: Claves `auth.register.legal_prefix`, `legal_connector`, `legal_accessibility`, `terms_label`, `privacy_label`.
- **Cloudflare Pages**: Descartado — intentó `npm ci` sobre el root del monorepo aunque se configuró `Path: docs`. GitHub Pages fue la solución definitiva.

---

**Fecha**: 2026-05-23 — sync progresivo por lotes: Socket.io `sync:progress/complete/error`, `syncUserBatched` en Steam/RA/PSN, `syncUserExpress` al vincular, Redis progress TTL 2h, `useSyncProgress` hook + banner + toast en Biblioteca.

### Resumen ejecutivo

| Categoría | Estado |
|---|---|
| TypeScript strict (API) | ✅ 0 errores `tsc --noEmit` |
| TypeScript strict (mobile) | ✅ 0 errores `tsc --noEmit` |
| Lint errores (API) | ✅ 0 errores, 0 warnings |
| Lint errores (mobile) | ✅ 0 errores, 0 warnings |
| Tests backend | ✅ 405 tests pasando, 35 suites — cobertura 81% stmt / 83% branch |
| Tests mobile | ✅ 179 tests, 179 pasando |
| API build | ✅ `tsc -p tsconfig.json` sin errores |
| npm audit API | ⚠️ 18 high (build-time, pre-existente) — pendiente T8 |
| npm audit mobile | ⚠️ 17 high: `node-tar` vía Expo build tooling (build-time) — pendiente T8 |
| Maestro E2E | ✅ 5 flows pasando contra emulador Android (APK preview) |

### Correcciones y limpieza BD (2026-05-22)

- **Token PSN en sync real**: `buildAuthWithRefresh()` ya existía y funcionaba correctamente (renovación con Refresh Token + persistencia). Gap detectado: cuando Refresh Token expira, el error `PSN_REFRESH_TOKEN_EXPIRED` solo se logueaba. Fix: `sync.worker.ts` ahora captura el error → `requiresReauth=true` en BD + notificación in-app. El sync exitoso resetea `requiresReauth=false`. Re-vincular también lo resetea.
- **`PlatformAccount.requiresReauth Boolean @default(false)`**: nuevo campo para señalizar sesión PSN expirada. Migration: `20260522000000_platform_account_requires_reauth`. Expuesto en `getLinkedPlatforms`, `getProfile`, `getPublicProfile`. Banner de reauth en `app/link-platform/psn.tsx` cuando el campo es `true`.
- **Guard PSN `syncUser()`**: `if (trophies.length === 0) continue` antes del game upsert — evita insertar títulos PSN sin trofeos (DLC sin soporte, demos).
- **Guard RA `syncUser()`**: comprobación `if (!achievements || Object.keys(achievements).length === 0)` movida ANTES del `prisma.game.upsert` — evitaba que juegos sin logros entraran en BD.
- **Guard Steam `syncUser()`**: `if (schema.length === 0 || playerAchievements.length === 0) continue` — `GetPlayerAchievements` puede devolver `success: false` (perfil parcialmente privado, juego sin stats para el usuario) mientras `GetSchemaForGame` devuelve logros desde caché → juego se insertaba sin Achievement records.
- **Limpieza BD**: eliminados **3.333 juegos Steam vacíos** causados por el bug del guard anterior.
- **BD Railway post-seed 5 usuarios PSN 2026-05-22: 1.882 juegos (80 Steam + 1.001 RA + 801 PSN) + 92.740 logros, 0 juegos sin logros, 0 duplicados.**
- `psn.adapter.test.ts` creado: 5 tests cubriendo token válido / access expirado / refresh expirado (×2 aserciones).

### Limpieza BD y correcciones (2026-05-20)

- Eliminados **30.251 juegos sin logros** (30.066 Steam + 185 RA/PSN) — causados por `steam.adapter.ts` que hacía upsert antes del guard de logros vacíos
- Constraint en `Achievement` corregido: `(platform, externalId)` → `(platform, gameId, externalId)` — el `apiname` Steam no es globalmente único entre juegos
- Migración manual creada: `20260520000000_achievement_unique_platform_gameid_externalid`
- Todos los adapters (Steam, RA, PSN, Xbox) y `seed-catalog.worker.ts` actualizados al nuevo accessor `platform_gameId_externalId`
- `steam.adapter.ts` `syncUser()`: guard `if (schema.length === 0) continue` añadido antes del game upsert
- `scripts/seed-games.ts`: `refreshPsnAuth()` helper + refresco cada 5 usuarios; guard `trophies ?? []` en PSN
- BD Railway post-limpieza: **1.406 juegos, 72.264 logros** (Steam: 78/7.807 · RA: 1.001/47.889 · PSN: 327/16.568)

### Seed PSN ejecutado en producción (2026-05-19)

- PSN_NPSSO proporcionado → seed completado: 327 juegos PSN + 16.568 logros insertados en Railway
- Total BD (antes de limpieza): **1.407 juegos, 72.554 logros** (Steam: 80/8.177 · RA: 1.000/47.809 · PSN: 327/16.568)
- 45 títulos omitidos por `trophies` undefined en respuesta API (DLC / sin soporte de trofeos)
- Neozaine/Seithek/Keching07 omitidos por "Expired access token" — token expiró tras 372 títulos
- `scripts/check-db-size.ts` creado: BD Railway en ~41 MB / 1 GB (4%)

### Features implementadas en esta sesión (2026-05-17)

**FEATURE — Búsqueda global de logros**
- `GET /api/v1/search?type=achievements&q=...&platform=...` — JWT opcional, Xbox excluido, 20 resultados/pág
- `GET /api/v1/games/:id/achievements` — logros de un juego con estado isUnlocked por usuario
- `authenticateOptional` middleware: extrae usuario del JWT si presente, continúa sin error si ausente
- `AchievementSearchResult` añadido a `packages/types/src/index.ts`; `SearchResponse` incluye `achievements[]`
- Search tab: nuevo filtro chip "Achievements" + sub-filtro de plataforma (Steam / RA / PSN)
- `AchievementSearchCard.tsx`: icono con opacity 0.4 si bloqueado, badge de plataforma con color, XP y rareza
- `useSearchAchievements.ts`: `useInfiniteQuery`, debounce 400ms, staleTime 5min, infinite scroll en FlashList
- `game/[id].tsx`: header muestra "X/Y logros · Z% completado" cuando autenticado; empty state en filtro "Earned" sin sesión

**NOTA — BD pre-poblada ✅**
- Seed ejecutado en producción: 1.407 juegos + 72.554 logros (Steam + RA + PSN).
- Search devuelve resultados desde el día 1 sin necesidad de que ningún usuario haga sync.

### Correcciones aplicadas en esta sesión (2026-05-16)

**BUG CRÍTICO — Profile crash tras registro**
- `profile.tsx`: `user.xp.toLocaleString()` crasheaba cuando `xp`/`level`/`streakDays` llegaban undefined tras registro
- Fix: null coalescing en todos los campos numéricos (`user.xp ?? 0`, `user.level ?? 1`, `user.streakDays ?? 0`)

**BUG — Barra de filtros azul a pantalla completa en Home y Rankings**
- `index.tsx` + `rankings.tsx`: ScrollView horizontal sin `flexGrow: 0` se expandía ocupando todo el flex space
- Fix: `style={{ flexGrow: 0 }}` + `alignItems: 'center'` en `contentContainerStyle`

**BUG — Icono incorrecto en tab Challenges**
- `_layout.tsx`: `challenges.tsx` existía en `app/(tabs)/` pero no tenía entry en el array TABS → usaba icono por defecto
- Fix: añadida entrada con `flash-outline` / `flash` (Ionicons)

**BUG — Errores genéricos en Friends/Rankings/Challenges**
- `friends.tsx`, `challenges.tsx`, `rankings.tsx`: error UI diferenciada por tipo (network / auth / server)
- `useFriends.ts`, `useChallenges.ts`: expuesto `error: Error | null` desde TanStack Query
- Traducciones ES/EN: claves `error_network`, `error_auth`, `error_server` añadidas en las 3 secciones

**INVESTIGACIÓN — Steam muestra 0 logros**
- Causa raíz: no es un bug de código. `steam.adapter.ts` es correcto.
- Causas más probables: (1) `STEAM_API_KEY` no en `.env` local, (2) perfil Steam privado, (3) caché Redis TTL 30min-24h con arrays vacíos, (4) todos los juegos sin `has_community_visible_stats`

**Maestro E2E — 5 flows creados y validados**
- `01_registro.yaml`: clearState + detección condicional de pantalla de login/tabs
- `02_login_navegacion.yaml`: ✅ login condicional + navegación 6 tabs sin crash
- `03_vincular_steam.yaml`: ✅ Profile tab + sección vinculación Steam sin crash
- `04_busqueda.yaml`: ✅ Search tab + input texto sin crash
- `05_notificaciones.yaml`: ✅ notificaciones sin crash
- **Limitación documentada**: APK preview usa `https://unlockhub-production.up.railway.app`. `demo@unlockhub.test` es cuenta mock — no existe en producción. Los flows usan `runFlow/when` condicional para adaptarse a sesión activa o expirada. Para tests de auth completos se necesita un development build (`eas build --profile development`) o cuenta real en producción.

**testID en login.tsx**
- Añadidos `testID="login-email"` y `testID="login-password"` para futuros selectores Maestro más robustos (activos en el próximo build)

### Pendientes documentados

- **T8**: `node-tar` vulnerabilidades high — ninguna runtime. PR dedicado post-lanzamiento.
- **T12**: ✅ Implementado, ejecutado y corregido en producción (Steam+RA+PSN + 5 usuarios adicionales PSN). **BD 2026-05-22: 1.882 juegos (80 Steam + 1.001 RA + 801 PSN) + 92.740 logros, 0 juegos sin logros.** Guards en todos los adapters + limpieza de 3.333 juegos Steam vacíos.
- **Maestro auth completa**: requiere development build con `EXPO_PUBLIC_API_URL=http://10.0.2.2:3000` o cuenta real en producción para testear login/registro/plataformas autenticadas.
- **ChallengesScreen.test.tsx / RankingsScreen.test.tsx**: corregidos (2026-05-18) — error_server en lugar de error_message.
- **Backfill console en RA**: ✅ Completado (2026-05-21) — 1.001 juegos RA actualizados con sus consolas (NES/SNES/GBA/etc).
- **Backfill console en PSN**: ✅ Completado (2026-05-21) — 584 juegos PSN actualizados vía `scripts/backfill-psn-console.ts` (getUserTitles only, sin re-seed completo).
- **Token PSN**: ✅ Renovación automática + notificación reauth implementadas (2026-05-22). `PlatformAccount.requiresReauth` añadido al schema. Migration: `20260522000000_platform_account_requires_reauth`.
