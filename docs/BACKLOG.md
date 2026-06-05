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
| T4 | Paginación cursor en feed | 🔲 Cuando el volumen lo justifique |
| T5 | Tests de carga k6 | ✅ |
| T6 | Tests unitarios nuevos servicios | ✅ |
| T7 | Reescribir FeedScreen.test.tsx | ✅ Reescrito correctamente — mockea `useMyGames`; 9 tests pasando |
| T8 | Subir Expo a v55 para vulnerabilidades node-tar | ✅ Completado sesión 56 — Expo 55.0.26, RN 0.83.6, React 19.2.0, reanimated 4.2.1+worklets 0.7.4, flashlist 2.0.2, rn-google-mobile-ads 16.3.3, sentry 7.11.0. 352/352 tests. 0 errores TS/lint. |
| T9 | Resolver 145 warnings import/order en API | ✅ Resuelto — `eslint --fix` + override en `.eslintrc.js` para ficheros de test |
| T10 | Flows Maestro E2E | ✅ 5 flows en `apps/mobile/.maestro/` — todos pasando contra emulador Android con APK preview |
| T11 | Search de logros + endpoint logros de juego | ✅ Backend `GET /api/v1/games/:id/achievements` + `GET /api/v1/search?type=achievements` — JWT opcional, Xbox excluido, paginado 20/pág |
| T12 | Job "seed de logros populares" | ✅ Completo — BD producción (post-limpieza PL13, sesión 59): **2.878 juegos + 134.928 logros**. Seed inicial: 1.406 juegos (78 Steam + 1.001 RA + 327 PSN) + 72.264 logros. Bugs PSN corregidos: guard `trophies ?? []` + refresco token cada 5 usuarios. Campo `console` backfilled: RA (1.001 juegos) + PSN (584 juegos). Flag `--only-steam --usernames="X"` implementado en `scripts/seed-games.ts`. **Seithek Steam**: 0 juegos obtenidos — perfil de Steam privado (`GetOwnedGames` devuelve lista vacía). Hacer público en Configuración de Steam para seedear. |
| T13 | Sync optimization: parallel RA batches + skip completed | 🔲 Documentado como pendiente — no implementado por riesgo de rate limiting RA y pérdida de logros DLC. Ver decisiones sesión 10. |
| T14 | Desnormalizar contadores de biblioteca (`earnedAchievements`, `totalGames`) | 🔲 Pendiente confirmación del desarrollador — no implementar sin acuerdo. Ver decisiones sesión 16. |
| T15 | Steam skip-completed optimization via `rtime_last_played` | 🔲 `GetOwnedGames` devuelve `rtime_last_played` (Unix timestamp) por juego. Usarlo para saltar juegos sin actividad reciente reduciría llamadas a Steam. No implementado: requiere añadir `lastPlayedAt` al modelo de caché Redis + interfaz `GameCacheEntry`, con riesgo de saltar achievements de DLC. Documentar como pendiente post-lanzamiento. |
| T16 | ✅ Backfill RA XP con fórmula correcta | Script `scripts/backfill-ra-xp.ts` creado e idempotente — pendiente solo ejecución manual en prod con `DATABASE_URL="${DIRECT_URL}"`. Nota: el XP de usuarios en BD/Redis NO se actualiza automáticamente — los usuarios verán el XP corregido en su próximo sync. |
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
| T27 | Fetch achievements on-demand al pulsar juego con 0 logros en Search | 🔲 Requiere `POST /api/v1/games/:id/fetch-achievements`, dispatch al adapter correcto según `game.platform`, guard para no re-fetchear si `updatedAt < 24h` |
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
| T44 | **CODE SMELL**: Duplicación `uploadAvatar`/`uploadBanner` en `user.controller.ts` | Handlers idénticos en lógica — extraer a función `handleUploadMedia(field, transform)`. Sesión 52 |
| T45 | **CODE SMELL**: Duplicación `uploadAvatar`/`uploadBanner` en `upload.middleware.ts` | `multer()` configurado dos veces con parámetros iguales — usar factory `createUploadMiddleware()`. Sesión 52 |
| T46 | **CODE SMELL**: QueryKeys dispersas en múltiples hooks (no centralizadas) | `useFriends.ts`, `useRankings.ts`, `useSyncStatus.ts` etc. cada uno define sus propias keys. Centralizar en `lib/queryKeys.ts`. Sesión 52 |
| T47 | **CODE SMELL**: Debounce duplicado en `useSearch.ts` y `useSearchAchievements.ts` | Exactamente el mismo patrón de debounce en 2 hooks — extraer a `useDebounce(value, delay)`. Sesión 52 |
| T48 | **CODE SMELL**: IDs de test de AdMob hardcodeados en 3 ficheros | `useInterstitialAd.ts`, `useRewardedAd.ts`, `AdBanner.tsx` tienen la misma constante — centralizar en `lib/constants.ts`. Sesión 52 |
| T49 | ✅ **CORREGIDO**: `background-sync.scheduler.ts` condición `gte` → `lte` en `lastSyncAt` | Bug confirmado: `gte: oneDayAgo` sincronizaba usuarios que SÍ habían sincronizado recientemente (opuesto al objetivo). Corregido a `lte: oneDayAgo` — ahora sincroniza usuarios que llevan más de 24h sin sincronizar. Sesión 56 |
| T50 | ✅ **COBERTURA TESTS**: Auth — tests de refresh token de usuario con soft delete | Añadidos en `auth.routes.test.ts`: (1) `POST /refresh` 401 cuando tokens revocados por `deleteAccount`; (2) `GET /me` 401 ACCOUNT_DELETED cuando `findUnique` con `deletedAt:null` devuelve null. Mock de `prisma.user.findUnique` añadido al fichero. Sesión 56 |
| T51 | ✅ **COBERTURA TESTS**: Points — test de race condition en `claimRewardedAdPoints` | Añadido en `points.service.test.ts`: dos llamadas simultáneas con `Promise.allSettled`, solo la primera adquiere lock (`SET NX` devuelve `'OK'`), la segunda recibe `REWARDED_AD_COOLDOWN` 429. `mockCreate` llamado exactamente 1 vez → saldo +10 no +20. También corregidos los tests previos para reflejar la firma `SET NX EX` de 5 args. Sesión 56 |
| T52 | ✅ Cachear datos de juegos para acelerar carga de biblioteca | Sesión 54 — `game-cache.ts`: clave `game:meta:{platform}:{externalId}` TTL 24h; adapters PSN/RA/Steam comprueban caché antes de cada `game.upsert`; syncs repetidos no generan escrituras a PostgreSQL para juegos ya conocidos. |
| T53 | ✅ Fix crash por sync largo | Sesión 54 — 4 fixes: `syncProgressKey` en `finally` de `sync.worker.ts`; guard `MAX_PAGES=10` en `fetchUserTitles` de `psn.adapter.ts`; claves stale RA con TTL 7 días en `retroachievements.adapter.ts`; throttle 15s en handler socket de `useSyncProgress.ts`. |
| T54 | Refactor general post-lanzamiento | 🔵 Cuando el volumen lo justifique — Fase 4. Deuda técnica acumulada: QueryKeys centralizadas (T46), deduplicar middleware upload (T44/T45), debounce unificado (T47), IDs AdMob centralizados (T48), code smells T44-T51. Rama dedicada `refactor/fase4`. |
| T55 | ✅ Fix edge-to-edge Android 15 — contenido desplazado hacia arriba | Sesión 54 — todos los tabs cambiados a `edges={['left', 'right']}` en `SafeAreaView`; el header de React Navigation gestiona el inset superior y el tab bar el inferior. Sin el fix, `targetSdkVersion=35` contaba el safe area inset del status bar dos veces. |
| T56 | ✅ Fixes de seguridad sesión 53 | ✅ En develop — `xbox.adapter.ts`: doble cifrado AES-256-GCM eliminado · `search.service.ts`: filtro `deletedAt: null` añadido en `searchUsers` · `user.service.ts`: revocación `RefreshToken`s añadida a transacción de borrado de cuenta |
| T57 | ✅ Modo claro UI | ✅ Implementado en rama `feat/t57-light-mode` — `lib/colors.ts` (darkColors/lightColors), `hooks/useTheme.ts`, `preferencesStore.theme: 'dark'|'light'`, selector de tema en profile.tsx (🌙/☀️ activo). 22 ficheros actualizados: 9 componentes globales + 5 tabs + 3 pantallas. Inline styles reemplazan clases NativeWind hardcoded. 364/364 tests ✅, 0 errores TS/lint. |

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
| F10 | OG profiles | 🟢 Largo plazo — Fase 4 |
| F11 | Búsqueda de logros con filtro de plataforma | 🔲 Eliminado del Search tab en sesión 37 — hook `useSearchAchievements` y endpoint `GET /api/v1/search?type=achievements` intactos para uso futuro (T27) |
| F12 | SyncStatusBar — feedback de sync en biblioteca | ✅ Botón sync, syncs restantes (free), cooldown countdown, última sync, próximo auto sync |
| F13 | Activar premium + RevenueCat | 🟡 Alta — Fase 4. Código 100% intacto. Pasos: (1) completar B18/B19/B20 · (2) `FEATURES.premium = true` en `featureFlags.ts` · (3) `FEATURES.pointsRedeem = true` · (4) `FEATURES.advancedStats = true`. `react-native-purchases` v10, `usePremiumPlans`, `useSubscription`, `useRevenueCat`, `premium.tsx`, webhook backend — todo listo. |
| F14 | PSN sync paralelo — `Promise.allSettled` con concurrencia 5 | ✅ `processSingleTitle()` extraído; `processTitles()` procesa chunks de 5 en paralelo con aislamiento de fallos por título |
| F15 | RA sync paralelo — `Promise.allSettled` con concurrencia 3 | ✅ `syncUser()` y `syncUserBatched()` procesan chunks de 3 juegos en paralelo con `Promise.allSettled` |
| F16 | SyncStatusBar — countdown local + aviso sync largo | ✅ Countdown `setTimeout`-chain independiente del `refetchInterval` 60s; aviso ámbar tras 30s de sync activo |
| F17 | Onboarding paso 4 — CTAs de vinculación de plataformas | ✅ Paso 4 con botones Steam/PSN/RA → `router.replace('/link-platform/[x]')`, CTA secundario "Hacer esto más tarde" |
| F18 | FriendshipButton consciente del estado de relación en perfil público | ✅ 5 estados (none/pending_sent/pending_received/accepted/blocked) · GET /api/v1/friends/status/:username · confirmación Alert en eliminar · sesión 35 |
| F19 | Banner upload (Cloudinary) | ✅ POST /api/v1/users/me/banner · Pressable 120px en profile.tsx · aspect 3:1 · crop/fill 1500×500 · sesión 42 |
| F20 | ✅ Ampliar placements de AdMob | ✅ Sesión 55. Banner Rankings (`unitId='rankings'`) + Banner Friends (`unitId='friends'`) integrados. `useWrappedInterstitial` (cooldown 24h AsyncStorage) en `wrapped/[year].tsx`. `useCompletedGamesInterstitial` (AsyncStorage por gameId) en `index.tsx`. `AdBanner` type ampliado a `'home'\|'search'\|'rankings'\|'friends'`. `.env.example` actualizado con los 6 IDs. **Pendiente acción dev**: crear 2 ad units en AdMob Console y configurar `EXPO_PUBLIC_ADMOB_RANKINGS_BANNER_ID` + `EXPO_PUBLIC_ADMOB_FRIENDS_BANNER_ID` como EAS secrets. |
| F21 | ✅ Ver logros de otros usuarios + comparativa | ✅ Implementado sesión 61. `GET /:username/games` + `GET /:username/games/:gameId/achievements` con `authenticateOptional` y privacidad F29. `app/user-game/[username]/[gameId].tsx`: toggle "Sus logros"/"Comparar". Sección Biblioteca en `profile/[username].tsx`. `useUserGames` + `useUserGameAchievements`. Tests: 593 API + 364 mobile. |
| F22 | Activar retos semanales (`FEATURES.challenges = true`) | 🟠 Media — Fase 4. Backend `WeeklyChallenge` + `UserChallenge` + scheduler + workers implementados. Solo requiere cambiar el flag y crear retos iniciales en BD. |
| F23 | Activar canje de puntos (`FEATURES.pointsRedeem = true`) | 🟠 Media — Fase 4. Endpoint `POST /api/v1/subscriptions/redeem-points` implementado. Activar junto a `FEATURES.premium`. |
| F24 | Activar estadísticas avanzadas (`FEATURES.advancedStats = true`) | 🟠 Media — Fase 4. Pantalla y datos implementados. Activar junto a `FEATURES.premium`. |
| F25 | Xbox — vinculación y sync | 🔵 Cuando el volumen lo justifique — Fase 4. `xbox.adapter.ts` implementado y gateado. Requiere OAuth2 Microsoft Identity Platform + verificación de empresa + `XBOX_CLIENT_ID`/`XBOX_CLIENT_SECRET` en Railway. |
| F26 | App Store iOS | 🟢 Largo plazo — Fase 4. Apple Developer Program $99/año (V4). Requiere cuenta + certificados + TestFlight + listing App Store. |
| F27 | Torneos internos | 🟢 Largo plazo — Fase 4. Consultar abogado antes de implementar (Ley 13/2011 — juegos de azar España). Solo recompensas en puntos/días premium. |
| F28 | Mostrar versión de la app en perfil | 🔲 Fase 4 — Añadir el número de versión de la app (ej: v1.0.0 (5)) en pequeño en la pantalla de perfil, típicamente al pie de la sección de ajustes. Usar expo-constants (Constants.expoConfig?.version + Constants.expoConfig?.android?.versionCode) para obtener la versión en tiempo de ejecución. |
| F29 | ✅ Privacidad de perfil (3 niveles) | ✅ Implementado sesión 60. Prisma: `ProfileVisibility` enum + `User.profileVisibility @default(PUBLIC)` + migración. Backend: `getPublicProfile` (PRIVATE→404, FRIENDS_ONLY→403 si no es amigo), `compareProfiles` respeta visibilidad, `updateProfile` sincroniza Redis al cambiar, `upsertUserScore` omite zadd si no PUBLIC, `authenticateOptional` en `GET /users/:username`. Mobile: selector inline 3 opciones en ajustes de perfil, perfil público diferencia 403 vs 404. i18n ES/EN. 575/575 API · 355/355 mobile · 0 errores TS/lint. |

### 🔶 Post-lanzamiento — Verificaciones pendientes

| # | Tarea | Detalle |
|---|---|---|
| PL12 | ✅ Declaración Data Safety actualizada para PostHog | PostHog (N4) está activo desde el lanzamiento — se ha declarado en el formulario de Seguridad de los datos. Si se cambia el proveedor de analítica en Fase 4, actualizar la declaración para reflejar el cambio. |
| PL13 | ✅ Limpieza de usuarios de prueba antes de abrir a Producción pública | ✅ **Ejecutado en producción (sesión 59)**. 7 usuarios de prueba eliminados (SmokeTest3, test, testuser123, testuser456, Seithek, Joels, testuser1234). Preservados: `TestUser99` (revisión Google Play) y `Sovelyss` (cuenta desarrollador). 7.684 UserAchievements + 17 RefreshTokens + datos asociados eliminados. Catálogo intacto: 2.878 juegos + 134.928 logros. Redis rankings dejados para regeneración natural (URL interna no accesible desde local). Script soporta múltiples `--preserve-username`: `npx ts-node ../../scripts/cleanup-test-users.ts --preserve-username=TestUser99 --preserve-username=Sovelyss`. |
| PL14 | Verificar edge-to-edge de Android 15 en dispositivo | `targetSdkVersion: 35` hace que Android 15 fuerce edge-to-edge (la app dibuja bajo las barras de estado y navegación del sistema). Verificar que `SafeAreaView` cubre correctamente el contenido en todas las pantallas (header/footer de tabs, pantallas de auth, game detail, profile) en dispositivo/emulador con Android 15 antes de promover a Producción. |
| PL15 | ✅ Merge develop → main antes de promover a Producción | ✅ Completado sesión 59 — `git merge --no-ff develop` + `git tag v1.0.0` + push. main refleja exactamente el código de producción. |

---
