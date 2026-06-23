# CLAUDE.md — UnlockHub

Documento de contexto persistente para Claude Code. Léelo completo al inicio de cada sesión antes de escribir cualquier código.

---

## ⚠️ ACCIONES REQUERIDAS POR EL DESARROLLADOR

Esta sección lista todo lo que **el desarrollador debe hacer manualmente** antes de que Claude Code pueda implementarlo. Claude Code no puede registrarse en servicios externos, pagar cuentas ni obtener credenciales — eso lo hace el desarrollador y luego proporciona las keys.

### 🔴 Bloqueantes — sin esto la app no puede lanzarse

| # | Acción | Dónde | Coste | Para qué se usa |
|---|---|---|---|---|
| ~~B3~~ | ✅ **Resend — cuenta + dominio verificado** | resend.com | Gratis hasta 3k emails/mes | ✅ Completado |
| ~~B4~~ | ✅ **`RESEND_API_KEY` y `RESEND_FROM_EMAIL` configuradas** | resend.com → API Keys → Railway Variables | Gratis | ✅ Completado |
| ~~B5~~ | ✅ **Backups Railway PostgreSQL verificados** | Railway dashboard → servicio PostgreSQL → Settings → Backups | Según plan | ✅ Completado |
| ~~B6~~ | ✅ **Persistencia Railway Redis verificada** | Railway dashboard → servicio Redis → Settings | Según plan | ✅ Completado |
| ~~B7~~ | ✅ **Cuenta Google Play Developer creada** | play.google.com/console | $25 pago único | ✅ Completado |
| ~~B8~~ | ✅ **Cuenta AdMob creada + app vinculada + ad units producción** | admob.google.com | Gratis | ✅ Completado — App ID `~6211856600`, 4 ad units de producción creados |
| ~~B9~~ | ✅ **Ad unit IDs configurados como EAS secrets** | `EXPO_PUBLIC_ADMOB_HOME_BANNER_ID`, `SEARCH_BANNER_ID`, `INTERSTITIAL_ID`, `REWARDED_ID` — todos configurados | Gratis | ✅ Completado — IDs de producción inyectados en builds EAS. |
| ~~B10~~ | ✅ **UMP SDK integrado** | `hooks/useGdprConsent.ts` + `_layout.tsx` — UMP SDK activo, muestra formulario si `status === REQUIRED` | Gratis | ✅ Código integrado. UMP message ya publicado en AdMob dashboard. |
| ~~B13~~ | ✅ **`APP_SCHEME=unlockhub` configurado en Railway** | Railway dashboard → service → Variables | Gratis | ✅ Completado |
| ~~B14~~ | ✅ **Email de soporte `soporte@unlockhub.app` creado** | Dominio Cloudflare | ~1-5€/mes | ✅ Completado |
| ~~B15~~ | ✅ **Privacy Policy publicada** | `docs/privacy-policy.html` → https://jmreja27.github.io/UnlockHub/privacy-policy.html | Gratis | ✅ Completado — GitHub Pages activo (repo público, branch `develop`, carpeta `/docs`). Datos del desarrollador rellenados. |
| ~~B16~~ | ✅ **Términos y Condiciones publicados** | `docs/terms-of-service.html` → https://jmreja27.github.io/UnlockHub/terms-of-service.html | Gratis | ✅ Completado — igual que B15. |
| B17 | ✅ **Migración Prisma en producción** | Automática en cada deploy — `npx prisma migrate deploy` configurado en `startCommand` de `railway.json` | Gratis | Aplicar todos los modelos nuevos en prod |
| B18 | Crear cuenta **RevenueCat** + configurar productos + webhook | app.revenuecat.com → crear app Android → crear productos `unlockhub_premium_monthly` + `unlockhub_premium_annual` → Integrations → Webhooks → apuntar a `POST /api/v1/webhooks/revenuecat` | Gratis hasta 2.500 MAU | Billing real en producción — diferido a Fase 4 |
| B19 | Configurar `EXPO_PUBLIC_REVENUECAT_API_KEY` como EAS secret | expo.dev → proyecto → Secrets → añadir `EXPO_PUBLIC_REVENUECAT_API_KEY` (Public SDK Key de RevenueCat) | Gratis | Sin esta key, `usePremiumPlans` devuelve precios hardcoded y no puede procesar compras reales — diferido a Fase 4 |
| B20 | Configurar `REVENUECAT_WEBHOOK_SECRET` en Railway | Railway dashboard → service → Variables → añadir `REVENUECAT_WEBHOOK_SECRET` (cualquier string seguro — RevenueCat lo enviará en `Authorization: Bearer`) | Gratis | Sin esta key, el endpoint webhook no verifica la firma y acepta cualquier petición — diferido a Fase 4 |

> **Estado de acciones completadas ✅**
> - B1-B2 (Sentry): ✅ DSNs configurados en Railway y EAS
> - B9 (Ad unit IDs): ✅ 4 EAS secrets configurados — `EXPO_PUBLIC_ADMOB_HOME_BANNER_ID`, `SEARCH_BANNER_ID`, `INTERSTITIAL_ID`, `REWARDED_ID`.
> - B10 (UMP SDK): ✅ `useGdprConsent.ts` activo, GDPR message publicado en AdMob dashboard. Plugin `react-native-google-mobile-ads` en `app.json`.
> - B11-B12 (Cloudinary): ✅ Cuenta creada + `CLOUDINARY_URL` configurada en Railway variables
> - B3-B4 (Resend): ✅ Cuenta + dominio verificado + `RESEND_API_KEY` + `RESEND_FROM_EMAIL` configuradas en Railway
> - B13 (APP_SCHEME): ✅ `APP_SCHEME=unlockhub` configurado en Railway
> - ADMIN_SECRET: ✅ Configurado en Railway
> - B15 (Privacy Policy): ✅ `docs/privacy-policy.html` — URL: https://jmreja27.github.io/UnlockHub/privacy-policy.html — GitHub Pages activo, repo público, datos del desarrollador rellenados. Auto-deploy en cada push a `develop` que toque `docs/`.
> - B16 (ToS): ✅ `docs/terms-of-service.html` — URL: https://jmreja27.github.io/UnlockHub/terms-of-service.html — igual que B15.
> - B17 (Migraciones Prisma): ✅ Automáticas en cada deploy — `startCommand` en `railway.json`
> - STEAM_API_KEY: ✅ Configurada en Railway
> - N1 (UptimeRobot): ⚙️ Actualizar URL del monitor a https://unlockhub-production.up.railway.app
> - B5 (Backups PostgreSQL): ✅ Verificado en Railway dashboard
> - B6 (Persistencia Redis): ✅ Verificado en Railway dashboard
> - B7 (Google Play Developer): ✅ Cuenta creada — $25 pagados
> - B14 (Email soporte): ✅ `soporte@unlockhub.app` creado con dominio Cloudflare
> - N2 (Logtail/Better Stack): ✅ Cuenta creada, fuente "UnlockHub API" con JavaScript/HTTP, `LOGTAIL_SOURCE_TOKEN` configurado en Railway Variables
> - N4 (PostHog): ✅ Proyecto EU (203333, `eu.i.posthog.com`) activo. `POSTHOG_API_KEY` configurado en Railway. `EXPO_PUBLIC_POSTHOG_API_KEY` (key EU) configurada como EAS secret. Cuenta US original obsoleta (ver PL24 en BACKLOG).
> - N5 (Keystore Android): ✅ Guardado desde expo.dev → proyecto → Credentials

### 🟡 Necesarios antes del lanzamiento

| # | Acción | Dónde | Coste | Para qué se usa |
|---|---|---|---|---|
| ~~N2~~ | ✅ **Logtail (Better Stack) conectado a Railway** | Better Stack → fuente "UnlockHub API" (JavaScript/HTTP) → `LOGTAIL_SOURCE_TOKEN` configurado en Railway Variables | Gratis (7 días retención) | ✅ Completado — logs estructurados JSON de pino enviados a Better Stack |
| N3 | Escalar Railway a **mínimo 2 réplicas** en producción | Railway dashboard → service → Settings → Replicas → 2 | ~5€/mes adicional | Alta disponibilidad — redis-adapter ya configurado |
| ~~N4~~ | ✅ **PostHog — cuenta + Project API Key configurada** | posthog.com → Create Project → `POSTHOG_API_KEY` configurado en Railway Variables | Gratis hasta 1M eventos/mes | ✅ Completado — **Proyecto EU (203333)**. `analytics.ts` apunta a `https://eu.i.posthog.com`. `EXPO_PUBLIC_POSTHOG_API_KEY` (key EU) configurada como EAS secret. Cuenta US original obsoleta — ver PL24 en BACKLOG. |
| ~~N5~~ | ✅ **Keystore Android guardado desde Expo credentials** | expo.dev → proyecto → Credentials | Gratis | ✅ Completado |

### 🟢 Cuando el volumen lo justifique

| # | Acción | Dónde | Coste | Cuándo |
|---|---|---|---|---|
| V1 | Migrar imágenes a **Cloudflare Images** | cloudflare.com | ~5€/mes | Con 5.000+ usuarios |
| V2 | Activar **read replica** en Neon | console.neon.tech | ~20€/mes adicional | Cuando queries de ranking superen 500ms |
| ~~V3~~ | ✅ **Separar workers BullMQ a proceso dedicado en Railway** | `apps/worker` en el monorepo — servicio `unlockhub-worker` en Railway. 14 Shared Variables. | ~5€/mes | ✅ Completado sesión 69 |
| V4 | Apple Developer Program para iOS | developer.apple.com | $99/año | Fase 4 — App Store iOS |

---

## ¿Qué es UnlockHub?

Aplicación móvil (iOS + Android) para tracking unificado de logros de videojuegos. Integra **Steam**, **RetroAchievements** y **PlayStation Network (PSN)**. Xbox está implementado pero gateado hasta Fase 4. La arquitectura de adaptadores permite añadir nuevas plataformas sin modificar código existente.

**Modelo de negocio:**
- Usuarios free: app completa con anuncios AdMob
- Usuarios premium (2,99€/mes o 19,99€/año): sin anuncios + sync cada 15 min + 3 escudos de racha/mes + acceso anticipado al Wrapped + estadísticas avanzadas
- Sistema de puntos: canjeables por días premium (300 puntos = 7 días)
- Rankings y funcionalidades sociales para todos — sin ventajas de pago en competición

---

## Stack tecnológico

### Mobile — `apps/mobile`

| Tecnología | Uso |
|---|---|
| React Native + Expo | Base de la app |
| Expo Router | Navegación basada en ficheros |
| Zustand | Estado global (sesión, preferencias) |
| TanStack Query | Fetching, caché y revalidación de datos del servidor |
| NativeWind | Estilos (Tailwind CSS para React Native) |
| i18next + expo-localization | Internacionalización ES/EN |
| FlashList (Shopify) | Listas de alto rendimiento — reemplaza FlatList siempre |
| expo-image | Imágenes con caché automática y blurhash placeholder |
| expo-haptics | Feedback háptico en acciones importantes |
| expo-notifications | Push notifications iOS y Android |
| expo-network | Detección de conectividad (OfflineBanner global) |
| `lib/formatTimeAgo` (`formatNumber`, `formatDayMonth`, `formatTimeAgo`) | Formateo de números y fechas sin Intl — usar siempre estas utilidades propias |
| socket.io-client | Conexión Socket.io para sync progress en tiempo real |
| react-native-reanimated | Animaciones nativas (usado en SkeletonBox, transiciones) — v4, requiere react-native-worklets@0.7.x |
| posthog-react-native | SDK de PostHog para analytics — usar siempre via `lib/analytics.ts` |
| react-native-purchases (RevenueCat) v10 | Google Play Billing — compra, restauración, offerings desde RevenueCat |

### Backend — `apps/api`

| Tecnología | Uso |
|---|---|
| Node.js + Express + TypeScript | Core del servidor |
| Prisma | ORM con tipado automático y migraciones |
| Zod | Validación de schemas (compartido con frontend) |
| JWT + Refresh tokens | Autenticación stateless |
| Socket.io + @socket.io/redis-adapter | Tiempo real con soporte multi-instancia via Redis |
| BullMQ + Redis | Cola de tareas: sync, rankings, notificaciones batch |
| Helmet.js | Headers de seguridad HTTP |
| express-rate-limit | Rate limiting en todos los endpoints |
| cookie-parser | Parseo de cookies httpOnly para JWT |
| compression | Compresión gzip/brotli de respuestas HTTP |
| multer | Upload de archivos (avatares y banners) — en memoria antes de Cloudinary |
| axios | Cliente HTTP para llamadas a APIs externas (Steam, PSN, RA) |
| Resend | Email transaccional — requiere `RESEND_API_KEY` (acción B3) |
| pino | Logger estructurado en JSON — nunca console.log en producción |

### Infraestructura

| Servicio | Uso | Estado |
|---|---|---|
| PostgreSQL (Railway) | Base de datos principal | ✅ Activo — backups verificados ✅ (B5) |
| Redis (Railway) | Rankings + caché + BullMQ | ✅ Activo — persistencia verificada ✅ (B6) |
| Cloudinary | Avatares y banners | ✅ Activo — `CLOUDINARY_URL` configurada en Railway |
| Railway (API) | Deploy API HTTP + Socket.io | ✅ Activo — https://unlockhub-production.up.railway.app |
| Railway (Worker) | Deploy workers BullMQ — proceso dedicado | ✅ Activo — `unlockhub-worker`. 14 Shared Variables compartidas con la API. Socket.io desde worker requiere `@socket.io/redis-emitter` para eventos en tiempo real — fallback polling Redis activo. Dockerfile propio en `apps/worker/Dockerfile` — build multi-stage con tsx runtime, WORKDIR /app. Railway Config File Path: `apps/worker/railway.json` configurado en dashboard. |
| AdMob | Anuncios usuarios free | ⚙️ Pendiente cuenta AdMob (B8) — IDs producción ✅ (B9) — código integrado (B10 ✅) |
| GitHub Actions | CI/CD | ✅ Configurado |
| Sentry | Crash reporting móvil + API | ✅ DSNs configurados — código integrado |
| UptimeRobot | Alertas de disponibilidad | ✅ Activo |
| Logtail (Better Stack) | Logs estructurados persistentes | ✅ Activo — integración vía log drain de Railway (no vía SDK en código) · `LOGTAIL_SOURCE_TOKEN` configurado en Railway |
| PostHog | Analíticas de producto | ✅ Activo — `POSTHOG_API_KEY` configurado en Railway |

---

## Estructura del monorepo

```
unlockhub/
├── apps/
│   ├── mobile/
│   │   ├── app/
│   │   │   ├── (auth)/              # login, registro, forgot-password
│   │   │   ├── (tabs)/              # home, search, rankings, friends, challenges, profile
│   │   │   ├── game/[id].tsx        # detalle de juego — filtros, compartir, retar, guías UGC
│   │   │   ├── profile/[username].tsx  # perfil público con sección "vs tú"
│   │   │   ├── link-platform/       # steam ✅, ra ✅, psn ✅, xbox 🚩
│   │   │   ├── wrapped/[year].tsx   # period mensual ("2025-01") y anual ("2025") — param se llama year por quirk de Expo Router
│   │   │   ├── onboarding.tsx
│   │   │   ├── premium.tsx          # 🚩 gateado — FEATURES.premium = false
│   │   │   ├── privacy.tsx          # ✅ URL pública: https://jmreja27.github.io/UnlockHub/privacy-policy.html
│   │   │   ├── notifications.tsx    # ✅ Centro de notificaciones in-app
│   │   │   └── reset-password.tsx
│   │   ├── components/
│   │   ├── hooks/
│   │   ├── stores/
│   │   ├── lib/                     # featureFlags.ts ✅, analytics.ts ✅ (stub)
│   │   ├── i18n/                    # ES / EN
│   │   └── __tests__/
│   │
│   ├── api/
│   │   ├── src/
│   │   │   ├── routes/
│   │   │   ├── controllers/
│   │   │   ├── services/
│   │   │   ├── repositories/
│   │   │   ├── jobs/                # BullMQ queues, workers y schedulers (compartidos con apps/worker)
│   │   │   ├── sockets/             # Socket.io + redis-adapter ✅
│   │   │   ├── middleware/          # auth, rate-limit, roles, errores
│   │   │   ├── admin/               # Dashboard ✅ — protegido por ADMIN_SECRET bearer
│   │   │   └── platforms/
│   │   │       ├── platform.interface.ts
│   │   │       ├── steam.adapter.ts
│   │   │       ├── retroachievements.adapter.ts
│   │   │       ├── psn.adapter.ts
│   │   │       └── xbox.adapter.ts  # 🚩 gateado hasta Fase 4
│   │   └── prisma/
│   │       ├── schema.prisma
│   │       └── migrations/
│   │
│   └── worker/                      # Proceso Railway dedicado — solo workers BullMQ, sin HTTP
│       └── src/
│           └── index.ts             # Arranca sync, streak, challenge, gdpr-cleanup, seed-catalog workers + schedulers
│
├── packages/
│   ├── types/
│   └── validators/
│
└── scripts/
    ├── rotate-encryption-key.ts        # ✅ Ejecutar desde apps/api/ — ver sección Seguridad
    ├── backfill-game-console.ts        # ✅ Backfill console en juegos RA — 8 llamadas API (1/consola)
    ├── backfill-psn-console.ts         # ✅ Backfill console en juegos PSN — solo getUserTitles(), rápido
    ├── seed-games.ts                   # ✅ Seed manual Steam+RA+PSN — ejecutar desde apps/api/
    └── load-test/                      # ✅ Scripts k6 implementados
```

---

## Convenciones de nombrado

| Tipo de fichero | Convención | Ejemplo |
|---|---|---|
| Servicios backend | `feature.service.ts` | `friendship.service.ts` |
| Repositorios backend | `feature.repository.ts` | `friendship.repository.ts` |
| Workers BullMQ | `feature.worker.ts` | `streak.worker.ts` |
| Schedulers BullMQ | `feature.scheduler.ts` | `challenge.scheduler.ts` |
| Adaptadores de plataforma | `platform.adapter.ts` | `psn.adapter.ts` |
| Hooks móvil | `useFeature.ts` | `useFriends.ts` |
| Componentes móvil | `PascalCase.tsx` | `ActivityCard.tsx` |
| Rutas API REST | `kebab-case` con prefijo `/api/v1/` | `/api/v1/link-platform/psn` |
| Variables de entorno | `SCREAMING_SNAKE_CASE` | `RESEND_API_KEY` |
| Ramas Git | `feat/nombre` / `fix/descripcion` | `feat/avatar-upload` |

---

## Versionado de la API

Todos los endpoints usan el prefijo `/api/v1/`. Cuando se necesiten breaking changes:
- Crear `/api/v2/` manteniendo `/api/v1/` activa durante mínimo **3 meses** de transición.
- Nunca eliminar un endpoint de v1 sin verificar que no hay clientes activos usándolo.
- Versión activa actual: **v1** (única).

---

## Componentes y hooks globales

Usar siempre estos en lugar de recrear funcionalidad equivalente.

| Archivo | Ruta | Estado | Cuándo usarlo |
|---|---|---|---|
| `ErrorBoundary` | `components/ErrorBoundary.tsx` | ✅ | Envolver árboles que pueden fallar. Integrado con Sentry. |
| `EmptyState` | `components/EmptyState.tsx` | ✅ | Pantallas o listas vacías. Props: `emoji`, `title`, `body`, `cta` (opcional). |
| `useSyncAll` | `hooks/useSyncAll.ts` | ✅ | Sync manual de todas las plataformas. Cooldown 30 min local. |
| `featureFlags` | `lib/featureFlags.ts` | ✅ | Gatear features. Ver sección "Feature Flags". |
| `analytics` | `lib/analytics.ts` | ✅ | Trackear eventos. Ver sección "Analíticas". |
| `OfflineBanner` | Global en layout raíz | ✅ | No recrear. Usa `expo-network` internamente. |
| `GameCard` | `components/GameCard.tsx` | ✅ | Tarjeta de juego con badge de plataforma. |
| `UserCard` | `components/UserCard.tsx` | ✅ | Tarjeta de usuario con avatar, username, nivel y XP. |
| `ActivityCard` | `components/ActivityCard.tsx` | ✅ | Evento del feed de actividad. |
| `NotificationBell` | `components/NotificationBell.tsx` | ✅ | Campana en header con badge de no leídas. |
| `AchievementSearchCard` | `components/AchievementSearchCard.tsx` | ✅ | Tarjeta de logro en resultados de búsqueda — estado locked/unlocked, XP, rareza, badge de plataforma. |
| `useDebounce` | `hooks/useDebounce.ts` | ✅ | Hook genérico de debounce `useDebounce<T>(value, delay)` — usar siempre en lugar de implementar timerRef manualmente. |
| `queryKeys` | `lib/queryKeys.ts` | ✅ | QueryKeys centralizadas de TanStack Query — usar siempre, nunca strings literales inline en queryKey. |
| `ADMOB_TEST_IDS` | `lib/adUnits.ts` | ✅ | IDs de test AdMob centralizados (BANNER, INTERSTITIAL, REWARDED) — usar en lugar de hardcodear strings. |

---

## Feature Flags

Todas las features gateadas se controlan desde `lib/featureFlags.ts`. No crear mecanismos alternativos.

```typescript
// lib/featureFlags.ts
export const FEATURES = {
  premium: false,        // 🚩 Desactivado — activar en Fase 4 tras configurar RevenueCat (B18/B19/B20)
  challenges: false,     // Activar cuando los retos semanales estén listos para Fase 4
  wrapped: true,         // ✅ ACTIVO
  pointsRedeem: false,   // 🚩 Desactivado — sin destino útil sin premium activo
  advancedStats: false,  // 🚩 Desactivado — feature premium, activar junto a premium
  ugcGuides: true,       // ✅ ACTIVO
  notifications: true,   // ✅ ACTIVO
} as const;
```

```typescript
// Para gatear una pantalla completa:
if (!FEATURES.premium) return <ComingSoon />;
// Para gatear contenido parcial (paywall con preview):
{!user.isPremium && <PaywallOverlay feature="advancedStats" />}
```

---

## Analíticas de producto

Usar siempre `lib/analytics.ts`. No llamar al SDK directamente desde componentes. Funciona en modo silencioso si `POSTHOG_API_KEY` no está definida.

```typescript
analytics.track('onboarding_completed')
analytics.track('platform_linked', { platform: 'steam' })
analytics.track('achievement_viewed', { achievementId, platform })
analytics.track('challenge_completed', { challengeId, points })
analytics.track('profile_shared')
analytics.track('wrapped_shared', { period })
analytics.track('premium_paywall_seen', { feature })
analytics.track('premium_purchased', { plan })
```

Proveedor: PostHog (acción N4). El wrapper abstrae el proveedor — si se cambia, solo se toca `analytics.ts`.

---

## Modelo de base de datos (Prisma)

```prisma
model User {
  id             String    @id @default(cuid())
  username       String    @unique
  email          String    @unique
  passwordHash   String
  birthDate      DateTime? // Verificación edad mínima 16 años (GDPR España)
  avatar         String?
  banner         String?
  bio            String?
  level          Int       @default(1)
  xp             Int       @default(0)
  streakDays     Int       @default(0)
  streakShields  Int       @default(0) // Free: máx 1/mes. Premium: máx 3/mes
  countryCode    String?
  role           UserRole  @default(USER)
  isPremium      Boolean   @default(false)
  premiumUntil   DateTime?
  lastSyncAt     DateTime?
  deletedAt      DateTime? // Soft delete GDPR
  createdAt      DateTime  @default(now())
}

enum UserRole { USER MODERATOR ADMIN }

model PlatformAccount {
  id                String    @id @default(cuid())
  userId            String
  platform          Platform
  externalId        String
  username          String
  encryptedToken    String    // AES-256, nunca texto plano. Vacío ("") para cuentas PSN (sistema NPSSO)
  lastSyncedAt      DateTime?
  syncCooldownUntil DateTime?
  requiresReauth    Boolean   @default(false) // PSN: refresh token expirado → usuario debe re-vincular
  psnProfilePrivate Boolean   @default(false) // PSN: perfil privado detectado en sync
  tokenExpiresAt    DateTime? // reservado para uso futuro
  createdAt         DateTime  @default(now())
  updatedAt         DateTime  @updatedAt

  @@unique([userId, platform])
  @@unique([platform, externalId])
}

enum Platform { STEAM RA XBOX PSN }

model Game {
  id                String   @id @default(cuid())
  platform          Platform
  externalId        String
  title             String
  console           String?  // PSN: "PS3"/"PS4"/"PS5"/"PSVITA" (o combinaciones "PS3,PS4" para cross-gen) · RA: "NES"/"SNES"/... · Steam/Xbox: null
  iconUrl           String?
  headerUrl         String?
  totalAchievements Int      @default(0)
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  @@unique([platform, externalId])
}

model Achievement {
  id               String   @id @default(cuid())
  gameId           String
  platform         Platform
  externalId       String
  title            String
  description      String?
  iconUrl          String?
  rawValue         Float?
  normalizedPoints Int
  rarity           Float?
  externalUrl      String?
}

model Friendship {
  id         String           @id @default(cuid())
  senderId   String           // usuario que envía la solicitud
  receiverId String           // usuario que la recibe
  status     FriendshipStatus @default(PENDING)
  createdAt  DateTime         @default(now())
  updatedAt  DateTime         @updatedAt

  @@unique([senderId, receiverId])
}

enum FriendshipStatus { PENDING ACCEPTED BLOCKED }

enum ActivityEventType {
  ACHIEVEMENT_UNLOCKED
  FRIEND_ADDED
  LEVEL_UP
  CHALLENGE_COMPLETED
  STREAK_MILESTONE
  GAME_COMPLETED
}

model ActivityEvent {
  id        String            @id @default(cuid())
  userId    String
  type      ActivityEventType  // enum tipado, no String genérico
  payload   Json              @default("{}")
  createdAt DateTime          @default(now())
}

enum ChallengeMetric {
  ACHIEVEMENTS_UNLOCKED
  XP_GAINED
  GAMES_PLAYED
  STREAK_MAINTAINED
}

model WeeklyChallenge {
  id          String          @id @default(cuid())
  title       String
  description String
  metric      ChallengeMetric  // enum tipado
  targetValue Int
  xpReward    Int             @default(500)  // da XP, no puntos canjeables
  startAt     DateTime
  endAt       DateTime
}

model UserChallenge {
  id          String    @id @default(cuid())
  userId      String
  challengeId String
  progress    Int       @default(0)
  completedAt DateTime?
}

// Saldo = suma del historial → auditable
model UserPoint {
  id        String      @id @default(cuid())
  userId    String
  amount    Int         // Positivo: ganado. Negativo: canjeado.
  reason    PointReason
  createdAt DateTime    @default(now())
}

enum PointReason { CHALLENGE STREAK ACHIEVEMENT REDEEM REWARDED_AD }

model Subscription {
  id                 String           @id @default(cuid())
  userId             String
  plan               SubscriptionPlan
  provider           StoreProvider
  status             String
  startedAt          DateTime
  expiresAt          DateTime
  storeTransactionId String
}

enum SubscriptionPlan { MONTHLY ANNUAL LIFETIME POINTS_REDEEM }
enum StoreProvider { GOOGLE_PLAY APP_STORE INTERNAL }

model Notification {
  id        String   @id @default(cuid())
  userId    String
  type      String   // FRIEND_REQUEST | ACHIEVEMENT_CHALLENGE | RANKING_UP | CHALLENGE_COMPLETED | STREAK_RISK
  title     String
  body      String
  read      Boolean  @default(false)
  createdAt DateTime @default(now())
}

model AchievementGuide {
  id            String   @id @default(cuid())
  achievementId String
  userId        String
  content       String
  upvotes       Int      @default(0)
  reported      Boolean  @default(false)
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
}

model PasswordResetToken {
  id        String    @id @default(cuid())
  userId    String
  tokenHash String    @unique  // hash SHA-256 del token — nunca el token en texto plano
  expiresAt DateTime
  usedAt    DateTime?
  createdAt DateTime  @default(now())
}

// Tokens de refresco de sesión — gestionados por el backend, nunca expuestos al cliente
model RefreshToken {
  id        String    @id @default(cuid())
  userId    String
  tokenHash String    @unique
  expiresAt DateTime
  revokedAt DateTime?
  createdAt DateTime  @default(now())
}

// Tokens Expo Push para notificaciones push en iOS y Android
model DeviceToken {
  id        String   @id @default(cuid())
  userId    String
  token     String   @unique
  platform  String   // "ios" | "android"
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

### Rankings — Redis Sorted Sets

Los rankings **nunca** se calculan en PostgreSQL en tiempo real. Siempre desde Redis:

```
ZADD ranking:global <xp> <userId>
ZADD ranking:global:es <xp> <userId>
ZADD ranking:platform:steam <xp> <userId>
ZADD ranking:platform:psn <xp> <userId>
ZRANK ranking:global <userId>             # O(log n) — siempre instantáneo
```

Snapshot diario a PostgreSQL para histórico. Redis **debe** tener AOF activado (acción B6).

### GDPR — Borrado de cuenta

Al borrar una cuenta:
1. Soft delete: `User.deletedAt = now()` — el usuario no puede hacer login.
2. Anonimizar: `ActivityEvent.payload` → `{}`, username en rankings → `[deleted]`.
3. Eliminar `PlatformAccount` y `PasswordResetToken`.
4. Mantener `UserPoint` y `UserChallenge` anonimizados para integridad.
5. Job programado: borrado físico de `User` a los 30 días del soft delete.

---

## Sistema de XP — normalización entre plataformas

No modificar estas fórmulas sin actualizar este documento y regenerar los valores existentes en BD.

| Plataforma | Valor original | Fórmula → XP UnlockHub |
|---|---|---|
| **Steam** | % jugadores con el logro (rareza) | `≤5% → 100 XP`, `≤15% → 50 XP`, `≤30% → 25 XP`, `>30% → 10 XP` |
| **RetroAchievements** | Puntos RA (1–500) | `Math.round(puntosRA / 5)`, mínimo 5 XP |
| **PSN** | Tipo de trofeo | Bronce → 15 XP, Plata → 30 XP, Oro → 90 XP, Platino → 300 XP |
| **Xbox** | Gamerscore (0–1000) | `Math.round(gamerscore / 10)`, mínimo 5 XP |

### Sistema de escudo de racha

- Free: máximo 1 escudo acumulable, recarga 1 el día 1 de cada mes.
- Premium: máximo 3 escudos acumulables, recarga 3 el día 1 de cada mes.
- `streak.worker.ts`: antes de resetear `streakDays` a 0, comprobar `streakShields > 0` → decrementar 1 y no resetear.
- UI: badge de escudo junto al contador de racha en el perfil.

### XP en el Wrapped — cálculo correcto

El XP del Wrapped **NO** usa el aggregate genérico de `UserPoint`. El cálculo en `wrapped.service.ts` es:

- `achievementXp` = suma de `normalizedPoints` de `UserAchievement` del período, filtrado por `unlockedAt` (fecha real del desbloqueo del logro).
- `streakXp` = suma de `UserPoint.amount` con `reason: 'STREAK'` filtrado por `createdAt` (correcto por construcción — el punto de racha se concede el día en que ocurre).
- `totalXpGained = achievementXp + streakXp`.

**Por qué no `UserPoint.createdAt` para achievements**: los `UserPoint` de tipo `ACHIEVEMENT` se registran en la fecha del sync (siempre reciente), no en la fecha real del logro — lo que hacía que `totalXpGained` fuera 0 para períodos históricos (bug T96, fix `04e8a9c`).

### Sistema de canje de puntos

- 300 puntos = 7 días premium.
- Endpoint: `POST /api/v1/subscriptions/redeem-points` — ✅ Implementado.
- Valida saldo en `UserPoint`, descuenta con `reason: REDEEM` (amount negativo), extiende `User.premiumUntil`.

---

## Plataformas — Patrón de extensibilidad

```typescript
// apps/api/src/platforms/platform.interface.ts
export interface PlatformAdapter {
  platform: Platform;
  getUserAchievements(externalId: string): Promise<Achievement[]>;
  getGameInfo(externalId: string): Promise<Game>;
  syncUser(account: PlatformAccount): Promise<SyncResult>;
}
```

| Adapter | Estado | Notas |
|---|---|---|
| `steam.adapter.ts` | ✅ Activo | |
| `retroachievements.adapter.ts` | ✅ Activo | |
| `psn.adapter.ts` | ✅ Activo | Usa `psn-api` npm |
| `xbox.adapter.ts` | 🚩 Gateado hasta Fase 4 | OAuth2 Microsoft requiere verificación de empresa |

---

## APIs externas

### Steam Web API
- `GetOwnedGames`, `GetPlayerAchievements`, `GetSchemaForGame`, `GetGlobalAchievementPercentagesForApp`
- Rate limit: **100.000 req/día** por API key. Estrategia obligatoria:
  - Caché Redis de metadatos de juego: TTL 6h.
  - BullMQ concurrencia máxima de llamadas a Steam: 5 simultáneas.
  - Contador diario en Redis (`steam:api:calls:<date>`): **80 %** → background-sync scheduler pausa (`background-sync.scheduler.ts`); **90 %** → `triggerManualSync` bloquea o omite Steam (multi-plataforma → `skippedByQuota: true` 200; solo Steam → `STEAM_QUOTA_EXCEEDED` 429). Constantes centralizadas en `apps/api/src/config/steamQuota.ts`.
  - **Tope por intento** (A51): `STEAM_MAX_GAMES_PER_SYNC = 100` en `steamQuota.ts`. En `syncUser` y `syncUserBatched`, los juegos elegibles se ordenan por `rtime_last_played` desc (señal primaria — último timestamp de juego retornado por GetOwnedGames con `include_appinfo=true`) + `playtime_forever` como desempate; se procesan solo los primeros 100. Los omitidos se recuperan en el siguiente sync nocturno o manual. Ajustable tras observar volumen real en producción. Implementación mínima de T90 (sin cursor de reanudación — diferido a Fase 4).
- Requisito: perfil del usuario **público** en Steam.

### RetroAchievements API
- `getUserSummary`, `getUserCompletedGames`, `getGameInfoAndUserProgress`
- Sin garantías SLA — cachear última respuesta válida siempre.
- Sin endpoint de búsqueda por título — los juegos solo aparecen tras un sync real.

### PlayStation Network (psn-api npm)
- **Modelo**: el backend usa credenciales propias (`PSN_SYSTEM_NPSSO`) para leer perfiles públicos — igual que PSNProfiles/TrueTrophies/Exophase. El usuario solo proporciona su username; no se almacena ningún token de usuario.
- `getSystemPsnAuth()`: intercambia `PSN_SYSTEM_NPSSO` → Access Token, cacheado en Redis TTL 55 min (`psn:system:access_token`). Lanza `PSN_SYSTEM_NOT_CONFIGURED` (503) si la var no está, `PSN_SYSTEM_NPSSO_EXPIRED` (503) si el NPSSO ha expirado (~60 días). **Aviso**: la cookie `npsso` puede aparecer con el mismo valor en el navegador aunque la sesión esté expirada — el síntoma es `Sync fallido err="Expired token"` en logs (RA funciona; solo PSN falla). Renovar: logout + login en my.playstation.com → nuevo `npsso` → Railway Variables.
- `lookupPsnUser(auth, username)`: resuelve username → `{ accountId, onlineId }` vía `getProfileFromUserName`. Lanza `PSN_USER_NOT_FOUND` (404) si el perfil no existe o es privado.
- `getUserTitles(auth, accountId, opts)`: acepta cualquier `accountId` (no solo `"me"`) — permite leer cualquier perfil público.
- `getUserTrophiesEarnedForTitle(auth, accountId, ...)`: igual.
- `buildAuthWithRefresh()`: método público mantenido — lo sigue usando `seed-games.ts` con NPSSO propio.
- Caché Redis: metadatos de trofeos 24h, lista de juegos 1h.

### Xbox Live (gateado — Fase 4)
- OAuth2 Microsoft Identity Platform → Xbox Live Token → XSTS Token.

### Sincronización — Cooldowns por tier

| | Free | Premium |
|---|---|---|
| Sync automático | Cada 60 min | Cada 15 min |
| Sync manual | Cada 30 min | Cada 5 min |
| Syncs manuales/día | 5 | Ilimitados |

**Sync lazy al abrir la app**: si `lastSyncAt` tiene más de 24h, lanzar sync automático silencioso.

### Background sync scheduler

`background-sync.scheduler.ts` — ✅ Implementado.
- Cron: `03:00 UTC` diariamente.
- Sincroniza usuarios cuyo `lastSyncAt` es `null` o lleva más de 24h sin actualizarse.
- Respeta contador Steam: pausa si `steam:api:calls:<date>` supera el 80% del límite.
- Concurrencia máxima: 5 usuarios en paralelo.

---

## Variables de entorno

El servidor valida un subconjunto al arrancar mediante schema Zod (`apps/api/src/config/env.ts`): `DATABASE_URL`, `REDIS_URL`, `JWT_*`, `ENCRYPTION_KEY`, `STEAM_API_KEY`, `PSN_SYSTEM_NPSSO`, `RA_SYSTEM_USER`, `RA_SYSTEM_KEY`, `CLOUDINARY_URL`, `REVENUECAT_WEBHOOK_SECRET`. Las demás variables (`SENTRY_DSN`, `ADMIN_SECRET`, `RESEND_*`, `POSTHOG_API_KEY`, `LOGTAIL_SOURCE_TOKEN`, `MAINTENANCE_MODE`) se leen directamente con `process.env` sin validación Zod. Ver `.env.example` en el repo.

| Variable | Usado en | Entornos | Estado |
|---|---|---|---|
| `DATABASE_URL` | Prisma | local, staging, prod | ✅ Configurada en Railway (URL interna `postgres.railway.internal`) |
| `DIRECT_URL` | Prisma migrations | local, staging, prod | ✅ Configurada en Railway (URL proxy pública `*.proxy.rlwy.net`) |
| `REDIS_URL` | BullMQ, caché, rankings | local, staging, prod | ✅ Configurada en Railway (URL interna `redis.railway.internal`) |
| `JWT_ACCESS_SECRET` | Firma access tokens | local, staging, prod | ✅ Configurada |
| `JWT_REFRESH_SECRET` | Firma refresh tokens | local, staging, prod | ✅ Configurada |
| `ENCRYPTION_KEY` | AES-256 tokens de plataformas | local, staging, prod | ✅ Configurada |
| `STEAM_API_KEY` | Steam Web API | local, staging, prod | ✅ Configurada |
| `SENTRY_DSN` | Crash reporting API | staging, prod | ✅ Configurada |
| `EXPO_PUBLIC_SENTRY_DSN` | Crash reporting móvil | staging, prod | ✅ Configurada |
| `CLOUDINARY_URL` | Subida de avatares/banners | staging, prod | ✅ Configurada en Railway |
| `RESEND_API_KEY` | Emails transaccionales | staging, prod | ✅ Configurada en Railway |
| `RESEND_FROM_EMAIL` | Remitente de emails | staging, prod | ✅ Configurada en Railway |
| `APP_SCHEME` | Deep links (`unlockhub://`) | local, staging, prod | ✅ Configurada en Railway (`unlockhub`) |
| `EXPO_PUBLIC_ADMOB_HOME_BANNER_ID` | Banner Home (EAS secret) | prod | ✅ Configurado como EAS secret (B9) |
| `EXPO_PUBLIC_ADMOB_SEARCH_BANNER_ID` | Banner Search (EAS secret) | prod | ✅ Configurado como EAS secret (B9) |
| `EXPO_PUBLIC_ADMOB_INTERSTITIAL_ID` | Interstitial (EAS secret) | prod | ✅ Configurado como EAS secret (B9) |
| `EXPO_PUBLIC_ADMOB_REWARDED_ID` | Rewarded (EAS secret) | prod | ✅ Configurado como EAS secret (B9) |
| `EXPO_PUBLIC_ADMOB_RANKINGS_BANNER_ID` | Banner Rankings (EAS secret) | prod | ✅ Configurado como EAS secret — ad unit `unlockhub_rankings_banner` |
| `EXPO_PUBLIC_ADMOB_FRIENDS_BANNER_ID` | Banner Friends (EAS secret) | prod | ✅ Configurado como EAS secret — ad unit `unlockhub_friends_banner` |
| `POSTHOG_API_KEY` | Analíticas | staging, prod | ✅ Configurada en Railway (N4 ✅) |
| `ADMIN_SECRET` | Acceso al dashboard admin (bearer) | prod | ✅ Configurada en Railway |
| `PSN_SYSTEM_NPSSO` | Sync PSN de usuarios (credencial del sistema) | prod | ⚙️ Obtener en my.playstation.com → F12 → Application → Cookies → `npsso`. Caduca ~60 días. **El valor puede parecer idéntico en el navegador y estar expirado — comparar strings no es diagnóstico fiable.** Síntoma: `Sync fallido err="Expired token"` en logs Railway (RA sigue funcionando). Fix: logout + login → nuevo `npsso` → Railway Variables. Configurar en Railway dashboard → Variables. **Nunca en código ni `.env` commiteado.** |
| `RA_SYSTEM_USER` | Usuario del sistema para RetroAchievements | local, staging, prod | ⚙️ Registrar cuenta en retroachievements.org → Settings → Keys. Usado por `lookupRaUser` y el adaptador RA para sync. Sin esta var, la vinculación RA devuelve `RA_SYSTEM_NOT_CONFIGURED` (503). |
| `RA_SYSTEM_KEY` | API key del sistema para RetroAchievements | local, staging, prod | ⚙️ Ver `RA_SYSTEM_USER`. Par de credenciales validadas en `env.ts` (Zod). |
| `MAINTENANCE_MODE` | Activa modo mantenimiento en `/health` | prod | Opcional. Si `MAINTENANCE_MODE=true`, `/health` devuelve 503 y `maintenance: true`. Usado por el hook `useMaintenanceCheck` en mobile para mostrar pantalla de mantenimiento. |
| `XBOX_CLIENT_ID` | OAuth2 Microsoft para Xbox Live | prod | 🚩 Gateado hasta Fase 4. Requerido cuando Xbox se active — OAuth2 Microsoft Identity Platform → Xbox Live Token → XSTS Token. |
| `XBOX_CLIENT_SECRET` | OAuth2 Microsoft para Xbox Live | prod | 🚩 Gateado hasta Fase 4. Ver `XBOX_CLIENT_ID`. |
| `EXPO_PUBLIC_REVENUECAT_API_KEY` | RevenueCat SDK key (EAS secret) | prod | ⚙️ Pendiente acción B19 — sin esta key `usePremiumPlans` devuelve precios hardcoded, no se pueden procesar compras reales |
| `REVENUECAT_WEBHOOK_SECRET` | Webhook RevenueCat bearer token | prod | ⚙️ Pendiente acción B20 — sin esta key el webhook no verifica la firma (acepta cualquier petición, riesgo de abuso) |

---

## Seguridad — Pilar fundamental

Si hay conflicto entre velocidad de desarrollo y seguridad, **siempre gana la seguridad**.

### Secrets — Regla absoluta

- `.env` con valores reales: solo en local y en Railway dashboard → Variables. Bloqueados en `.gitignore`.
- `.env.example`: solo placeholders. Único fichero de entorno en el repo.
- Si Claude Code detecta un secret real en un fichero → negarse y pedir que se configure como variable de entorno.
- Secret expuesto en el repo = comprometido. Rotarlo inmediatamente aunque el commit esté eliminado.

### Rotación de secrets

- **`JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET`**: rotar invalidando sesiones activas. Aceptable — usuarios hacen login de nuevo.
- **`ENCRYPTION_KEY`**: requiere migración con `scripts/rotate-encryption-key.ts` — ✅ implementado.

```bash
# Ejecutar SIEMPRE desde apps/api/ (@prisma/client solo está en apps/api/node_modules)
cd apps/api && npx ts-node ../../scripts/rotate-encryption-key.ts --old-key=<VIEJA> --new-key=<NUEVA>
# Ejecutar ANTES de actualizar ENCRYPTION_KEY en Railway dashboard → Variables
```

### Reglas de código

- **JWT**: access token (15 min) en `httpOnly cookie`. Nunca en `localStorage` ni `AsyncStorage`.
- **Refresh token**: 30 días, persistente en BD.
- **Tokens externos**: encriptados con AES-256. Nunca en texto plano.
- **Contraseñas**: bcrypt con mínimo 12 rounds.
- **Rate limiting**: en TODOS los endpoints. Estricto en `/auth/*`.
- **Helmet.js**: configurado siempre en Express.
- **Validación con Zod**: en TODOS los inputs, frontend y backend.
- **CSRF**: protección en todos los endpoints que mutan estado.
- **CORS**: estricto, solo orígenes explícitamente permitidos.
- **Sin secrets en logs**: nunca loguear contraseñas, tokens ni datos personales.
- **CI**: `npm audit --audit-level=high` en cada PR.
- **Verificación de edad**: en registro, validar que `birthDate` corresponde a mayores de 16 años.
- **Rutas admin**: protegidas por `ADMIN_SECRET` bearer token (no por role en JWT — ver Decisiones tomadas).
- **Magic bytes en uploads**: validar primeros bytes del buffer con `validateFileMagicBytes` (JPEG `FF D8 FF`, PNG `89 50 4E 47...`, WebP `RIFF/WEBP`) — nunca confiar solo en `Content-Type` declarado por el cliente.
- **Comparación constant-time**: usar `crypto.timingSafeEqual()` sobre hashes SHA-256 para comparar secrets de webhooks o cualquier token secreto — nunca `===` ni `!==` directo.
- **`deletedAt: null` en queries de lectura**: cualquier `findUnique` / `findMany` sobre `User` en un service debe incluir `deletedAt: null` en el `where` como defensa GDPR — no delegar la verificación exclusivamente al middleware `authenticate`.
- **`select` explícito en endpoints que devuelven datos de usuario**: nunca usar `include` sin `select` ni carga implícita de todos los campos del modelo `User`. Siempre listar explícitamente los campos necesarios. Previene filtración de `passwordHash`, `birthDate`, `role`, `deletedAt` si los mappers evolucionan o se añaden nuevas rutas sin auditoría. Aplica también a modelos relacionados — el hecho de que el mapper no use el campo no es suficiente; si el campo está en memoria, es filtrable con errores futuros.
- **`no-floating-promises` activo en `apps/api`**: configurado en `.eslintrc.js` + `tsconfig.eslint.json`; toda promesa devuelta por Express handlers o lifecycle hooks (SIGTERM) debe ser awaited para evitar cierres desordenados.
- **Timeout obligatorio en todas las llamadas HTTP a APIs externas**: toda llamada `axios.get`/`axios.post` a Steam, PSN, RA, Xbox, Cloudinary, Resend o cualquier servicio externo debe incluir `timeout: N` (10 000 ms para llamadas de datos, 15 000 ms para token exchanges). Sin timeout, un cuelgue de la API externa bloquea un slot de worker BullMQ hasta `lockDuration` (5 min), impidiendo que otros usuarios sincronicen.
- **Contadores de rate-limit por adapter**: cualquier adapter que llame a una API con límite diario (actualmente solo Steam — 100 000 req/día) debe incrementar su contador Redis (`redis.incr`) en cada llamada real (cache miss). El contador se usa para el umbral de pausa del scheduler y el dashboard de admin — leerlo sin escribirlo lo deja permanentemente en 0, haciendo la protección inoperante. Clave: `<plataforma>:api:calls:<YYYY-MM-DD>` con TTL 25 h (un día + margen de midnight boundary).
- **Sentry `beforeSend` obligatorio**: `Sentry.init` (mobile y API) debe incluir `beforeSend` que elimine `Authorization`/`authorization` de `event.request.headers`, redacte el body en rutas de autenticación (`/auth/*`), y verifique también `event.request.url`, query strings y breadcrumbs. Sin este filtro, credenciales y tokens pueden llegar a Sentry en texto plano.
- **Un 401 en refresh limpia sesión y redirige**: `refreshAccessToken()` debe detectar `response.status === 401` → llamar `deleteRefreshToken()` + `clearSession()` antes de propagar el error. Nunca dejar el store de sesión con `isAuthenticated: true` cuando el refresh token ha expirado — el guard de layout gestiona la redirección automáticamente al login.
- **Imágenes Cloudinary siempre vía `getCloudinaryThumb`**: toda imagen servida desde Cloudinary debe pasar por `lib/cloudinary.ts` — `getCloudinaryThumb(url, w, h)` inyecta `w_N,h_N,c_fill,q_auto,f_auto` en la URL. Nunca usar la URL original de Cloudinary directamente en componentes — se sirve la imagen a resolución original (hasta 4 MB) en lugar del tamaño exacto de render.

---

## Accesibilidad — WCAG 2.1 AA

- `accessibilityLabel`, `accessibilityRole` y `accessibilityHint` en todos los elementos interactivos.
- Contraste mínimo 4.5:1 en texto normal, 3:1 en texto grande.
- Soporte de VoiceOver (iOS) y TalkBack (Android).
- Área táctil mínima: **44x44 puntos** en todos los elementos interactivos.
- Textos escalables: respetar la configuración de tamaño de fuente del sistema.
- Nunca usar el color como único indicador de información.
- Estados de carga, error y vacío comunicados con `accessibilityLiveRegion`.
- Imágenes decorativas con `accessibilityElementsHidden={true}`.

---

## Usabilidad

- **Estados de carga**: en TODAS las acciones asíncronas, sin excepción.
- **Skeleton screens**: en listas y contenido principal, no spinners.
- **Mensajes de error**: en lenguaje humano. Qué pasó + qué puede hacer el usuario.
- **Modo offline**: datos cacheados con indicador visual. Nunca pantalla de error vacía.
- **Optimistic updates**: en acciones sociales (amigos, reacciones).
- **Confirmación**: antes de acciones destructivas o irreversibles.
- **Haptics**: `expo-haptics` en logros desbloqueados y subidas de nivel.
- **SafeAreaView**: en todas las pantallas. Soporte de notch y Dynamic Island.
- **Gestos nativos**: swipe para volver, pull-to-refresh donde corresponda.
- **Formateo de números y fechas**: usar siempre las utilidades propias de `lib/formatTimeAgo` (`formatNumber`, `formatDayMonth`, `formatTimeAgo`). **Nunca** usar `Intl.NumberFormat`, `Intl.DateTimeFormat`, `Intl.RelativeTimeFormat` ni `Number.prototype.toLocaleString()` — crash documentado en Sentry: `Intl.RelativeTimeFormat` es `undefined` en algunos dispositivos Android con el build actual de Hermes, lo que demuestra que el soporte Intl no está garantizado en todos los builds de Hermes aunque la documentación lo indique. `toLocaleString()` puede apoyarse en Intl internamente y sufrir el mismo crash.

### Gestión de errores — patrón establecido

| Situación | Cómo manejarlo |
|---|---|
| Error de red o servidor | Estado de error TanStack Query + mensaje humano en UI |
| Error inesperado de render | `ErrorBoundary` (ya global) + reporte automático a Sentry |
| Acción del usuario (form, submit) | Toast o mensaje inline junto al campo |
| Rate limit 429 | `lib/api.ts` lee `Retry-After` → muestra "Espera X segundos" |
| Modo offline | `OfflineBanner` global + datos cacheados + "Actualizado hace X min" |

---

## Rendimiento

### Frontend
- **FlashList** siempre en lugar de FlatList — sin excepciones.
- **expo-image** siempre en lugar de `Image` de React Native.
- `useMemo` y `useCallback` solo donde haya evidencia de re-renders innecesarios.
- TanStack Query con `staleTime` y `gcTime` configurados apropiadamente.
- `useInfiniteQuery` en todas las listas largas.
- Auditar bundle con `expo-bundle-analyzer` antes de cada release.

### Backend
- Rankings desde Redis Sorted Sets — nunca desde PostgreSQL en tiempo real.
- Índices en PostgreSQL en todas las FK y columnas frecuentes en `WHERE`/`ORDER BY`.
- **Índices nuevos en tablas grandes con `CONCURRENTLY`** — patrón obligatorio (ver INC-01 en AUDIT.md): (1) Crear archivo de migración con la sentencia `CREATE INDEX CONCURRENTLY IF NOT EXISTS` como documentación, pero **no** ejecutarlo via `migrate deploy` — Prisma 5.x envuelve toda migración en `BEGIN…COMMIT` independientemente del número de sentencias; `CONCURRENTLY` lanza código 25001 dentro de transacción y deja la BD en P3009 (bloqueada). (2) Aplicar el índice fuera de transacción: `npx prisma db execute --file <migration.sql>` (desde `apps/api/`). (3) Verificar `indisvalid=true` en `pg_indexes` antes de continuar; si `indisvalid=false`, el índice es inútil — `DROP INDEX CONCURRENTLY` y reintentar. (4) Marcar sin ejecutar: `npx prisma migrate resolve --applied <nombre>` (desde `apps/api/`). (5) Verificar `npx prisma migrate status` → 0 pendientes antes de push/redeploy. Aplicar un índice por migración; crear los archivos de docs separados por índice.
- **Paginación obligatoria** en todos los endpoints de listas.
- Compresión gzip/brotli con `compression` middleware.
- Caché Redis de respuestas de APIs externas con TTL apropiado.
- Workers BullMQ con concurrencia limitada para llamadas a APIs externas.
- Logger `pino` — nunca `console.log` en producción.

### Socket.io multi-instancia — ✅ Configurado

```typescript
// apps/api/src/sockets/index.ts
import { createAdapter } from '@socket.io/redis-adapter';
io.adapter(createAdapter(pubClient, subClient));
// Listo para escalar a 2 réplicas en Railway (N3) sin romper nada
```

---

## Testing

### Backend
- **Jest + ts-jest**: tests unitarios de services y repositories.
- **Supertest**: tests de integración con BD de test separada.
- Cobertura mínima: **80%**. CI bloquea el merge si no se alcanza.

### Frontend
- **Jest + @testing-library/react-native**: tests de componentes.
- **jest-axe**: tests de accesibilidad en componentes críticos.
- **Maestro**: tests E2E — flows: login, sync Steam, ver logro, buscar usuario, enviar solicitud de amistad, flujo premium.

### Tests de carga (k6) — ✅ Implementados

- Scripts en `scripts/load-test/`.
- Endpoints: `POST /auth/login`, `GET /api/v1/rankings`, `POST /api/v1/sync`, `GET /api/v1/feed`.
- Umbral: **p95 < 500ms** con 100 usuarios concurrentes.

### Pipeline CI — en cada PR
1. Lint (ESLint + Prettier)
2. Type check (TypeScript strict)
3. Tests unitarios
4. Tests de integración
5. Cobertura mínima 80%
6. `npm audit --audit-level=high`

**Merge bloqueado si cualquier paso falla.**

---

## Reglas generales de desarrollo

- **EAS Build — REGLA ABSOLUTA**: Nunca lanzar `eas build` sin que el desarrollador lo pida explícitamente en ese mismo mensaje.
- **TypeScript strict** en todo el código. Sin `any`. Sin excepciones.
- **Comentarios en español**, código (variables, funciones, clases) en inglés.
- Cada función de servicio debe tener su test unitario correspondiente.
- Errores HTTP: `{ error: string, code: string, details?: unknown }`.
- Respuestas de lista: `{ data: T[], total: number, page: number, limit: number }`.
- Tipos compartidos en `packages/types`, schemas Zod en `packages/validators`.
- Logs con `pino` — nunca `console.log` en producción.
- Analíticas con `lib/analytics.ts` — nunca llamar al SDK directamente.
- **Un único propietario del estado de progreso de sync**: no instanciar `useSyncProgress` en más de un componente simultáneamente. El componente raíz de la pantalla (ej. `LibraryScreen`) es el propietario; pasa `isRunning: boolean` como prop a los hijos (`SyncStatusBar`). Instanciar el hook en varios componentes duplica listeners Socket.io, timers de gracia e intervals de polling fallback por cada instancia.
- **Selectores Zustand siempre precisos**: usar `useStore((s) => s.campo)` en lugar de `useStore()` sin selector. Sin selector, cualquier cambio en el store (XP o nivel tras sync) re-renderiza el componente completo aunque el campo que usa no haya cambiado.
- **Actualizar el backlog** al final de cada sesión marcando ítems completados con ✅.

### Estrategia de branching

- `main` — producción. Solo recibe merges desde `develop` en el momento de una release.
- `develop` — integración. Base para todas las features y fixes.
- `feat/nombre-feature` — una rama por feature, sale de `develop`, se mergea de vuelta a `develop`.
- `fix/descripcion` — una rama por fix, sale de `develop`, se mergea de vuelta a `develop`.
- `hotfix/descripcion` — fix urgente en producción, sale de `main`, se mergea a `main` Y a `develop`.

**Flujo estándar:**
1. `git checkout develop && git pull origin develop`
2. `git checkout -b feat/nombre-feature`
3. Implementar + tests + lint
4. `git push origin feat/nombre-feature`
5. PR → `develop` con `--no-ff`
6. Cuando hay release: `develop` → `main` con `--no-ff` + `git tag vX.Y.Z`

**Nunca** commitear directamente en `main` ni en `develop` — siempre desde rama.

---

## Entornos

### Local — emulador Android

```bash
cd apps/api && npm run mock   # Mock server en :3000
```

Cuenta de prueba: `demo@unlockhub.test` / `Demo1234!`

**Quirks críticos (Expo SDK 55 + RN 0.83.6):**
- URL del host desde el emulador: `http://10.0.2.2:3000`, no `localhost`.
- `adb reverse` no es fiable — preferir siempre `10.0.2.2`.
- `usesCleartextTraffic` debe ir en `app.json > plugins` mediante `expo-build-properties`.
- `kotlinVersion: "2.1.20"` en `expo-build-properties` — alinea con el compilador de RN 0.83.6. No usar "1.9.x" (downgrade que conflictúa con play-services-ads 25.x de AdMob v16+).
- **compileSdkVersion 36 requerido**: `androidx.core:1.17.0` (dependencia transitiva de RN 0.83.6) requiere `compileSdk >= 36`. Configurado en `app.json` → `expo-build-properties` → `android.compileSdkVersion: 36`.
- `react-native-google-mobile-ads` en v16+ (antes gateado a v13.6.1 por Kotlin 2.2.0 metadata). Ahora compatible — RN 0.83.6 usa Kotlin 2.1.20.
- `react-native-reanimated` v4 requiere `react-native-worklets` como peer dep. Debe instalarse en `apps/mobile/` Y en el root del monorepo (para que el Babel plugin lo encuentre). Versión compatible: `worklets@0.7.x` para `reanimated@4.2.x`.
- **Gradle 9.0.0 incompatible con RN 0.83.6**: `expo prebuild --clean` genera Gradle 9.0.0 que rompe el build local. Tras cada prebuild, parchear manualmente `android/gradle/wrapper/gradle-wrapper.properties` → `distributionUrl=...gradle-8.13-all.zip`. EAS Build gestiona esto automáticamente — solo afecta a builds locales.
- **`react-native bundle` roto con CLI v20**: el comando falla con `Cannot resolve @react-native/metro-config`. El reemplazo correcto es `expo export:embed`:
  ```bash
  npx expo export:embed --platform android --dev false \
    --bundle-output android/app/src/main/assets/index.android.bundle \
    --assets-dest android/app/src/main/res
  ```
- **`--entry-file` no funciona en monorepo**: la ruta se resuelve desde la raíz del workspace y falla. Omitirlo — `package.json "main": "expo-router/entry"` lo resuelve automáticamente.
- **`@react-native-community/cli`**: instalar desde la raíz del monorepo con `npm install` — incluye `@react-native-community/cli@20.1.3` como dependencia transitiva de RN 0.83.6.
- Jest y `react-native-reanimated` v4: no usar `jest.requireActual('react-native-reanimated/mock')` — carga worklets nativo. Usar mock manual en `jest.setup.ts` (ya configurado). El moduleNameMapper redirige `react-native-worklets` a `__mocks__/react-native-worklets.js`.
- React 19: `jest.advanceTimersByTime()` que dispara actualizaciones de estado debe envolverse en `act()`.
- `@shopify/flash-list` v2: eliminado el prop `estimatedItemSize` — FlashList v2 lo calcula automáticamente.

### Producción — Railway

- **API**: https://unlockhub-production.up.railway.app
- **Worker**: `unlockhub-worker` — servicio Railway independiente con workers BullMQ y schedulers. `startCommand: npx tsx apps/worker/src/index.ts` (vía Dockerfile CMD). Dockerfile: `apps/worker/Dockerfile`. Socket.io desde worker usa fallback polling Redis (para eventos en tiempo real añadir `@socket.io/redis-emitter`).
- **DB**: Railway PostgreSQL — `DATABASE_URL` (interna) + `DIRECT_URL` (proxy pública)
- **Redis**: Railway Redis — `REDIS_URL` (interna)
- **Shared Variables**: 14 variables configuradas a nivel de proyecto en Railway — compartidas entre `unlockhub-api` y `unlockhub-worker` sin duplicarlas.
- **Health check**: `GET /health` ✅ — configurado en `railway.json` (`healthcheckPath`)
- **Migraciones**: ✅ Automáticas en cada deploy — `npx prisma migrate deploy` en `startCommand`
- **Mínimo 2 réplicas**: pendiente (N3) — redis-adapter ya listo

```bash
# Ver logs en tiempo real
railway logs

# Abrir shell en el contenedor en ejecución
railway shell

# Gestionar variables de entorno (también disponible en dashboard)
railway variables set KEY=value

# Forzar redeploy desde el directorio raíz del proyecto
railway up

# Ver estado del servicio
railway status
```

### Railway MCP — política de permisos

- **Lectura libre** (sin pedir confirmación): estado de servicios y deployments, logs de build/deploy, listar variables, métricas, dominios.
- **Acciones que REQUIEREN confirmación explícita del usuario ANTES de ejecutar** (mostrar el comando exacto y esperar OK): redeploy, accept/reject deploy, crear/editar/borrar variables de entorno, cambiar dominios o settings del servicio, restart de servicio, y cualquier uso de railway-agent.
- Antes de cualquier redeploy: confirmar que los cambios están pusheados a GitHub (Railway despliega el commit remoto, no los commits locales).
- Nunca operar sobre la base de datos de producción vía el MCP de Railway; la cirugía de BD (prisma migrate resolve, SQL) va por separado y con confirmación explícita.
- Alcance temporal: el MCP de Railway está conectado de forma provisional (~2 meses, fase de lanzamiento). Revisar si se mantiene tras ese periodo.

---

## Dashboard de administración — ✅ Implementado

Rutas `/admin/*` protegidas por `ADMIN_SECRET` bearer token en middleware.

Métricas disponibles:
- Usuarios registrados hoy / semana / total
- Usuarios premium activos
- Syncs completados vs fallidos en las últimas 24h
- Profundidad de colas BullMQ
- Errores 5xx en las últimas 24h
- Uso del rate limit de Steam API (% del límite diario)
- Guías UGC reportadas pendientes de moderación

---

## Estado de pantallas

### Tabs principales

| Tab | Ruta | Estado |
|---|---|---|
| Home (Biblioteca) | `app/(tabs)/index.tsx` | ✅ |
| Search | `app/(tabs)/search.tsx` | ✅ |
| Rankings | `app/(tabs)/rankings.tsx` | ✅ |
| Friends | `app/(tabs)/friends.tsx` | ✅ |
| Challenges | `app/(tabs)/challenges.tsx` | 🚩 Gateado — `FEATURES.challenges = false` oculta el tab del nav bar. La pantalla sigue existiendo. |
| Profile | `app/(tabs)/profile.tsx` | ✅ |

### Pantallas adicionales

| Ruta | Estado | Notas |
|---|---|---|
| `app/(auth)/login.tsx` | ✅ | |
| `app/(auth)/register.tsx` | ✅ | Validación de edad ≥16 implementada. Texto legal con enlaces a ToS y Privacy Policy antes del botón de registro. |
| `app/(auth)/forgot-password.tsx` | ✅ | Requiere RESEND_API_KEY (B3) para funcionar en prod |
| `app/reset-password.tsx` | ✅ | Deep link `unlockhub://reset-password?token=…` |
| `app/onboarding.tsx` | ✅ | Solo en primer login |
| `app/game/[id].tsx` | ✅ | Filtros, compartir, retar amigo, guías UGC. Header muestra "X/Y logros · Z% completado" cuando autenticado. |
| `app/profile/[username].tsx` | ✅ | Sección "vs tú" incluida |
| `app/link-platform/steam.tsx` | ✅ | Solo pide username (o SteamID64 directo). Backend usa `STEAM_API_KEY` del sistema vía `resolveVanityUrl`. Guía expandible colapsada. |
| `app/link-platform/ra.tsx` | ✅ | Solo pide username. Backend usa `RA_SYSTEM_KEY` del sistema vía `lookupRaUser`. Guía expandible colapsada. |
| `app/link-platform/psn.tsx` | ✅ | Formulario de username — el backend usa `PSN_SYSTEM_NPSSO`; no se almacena token de usuario. Guía expandible para hacer perfil público. |
| `app/link-platform/xbox.tsx` | 🚩 Gateado | Banner "Próximamente" hasta Fase 4 |
| `app/notifications.tsx` | ✅ | Centro de notificaciones in-app |
| `app/privacy.tsx` | ✅ | URL pública activa: https://jmreja27.github.io/UnlockHub/privacy-policy.html |
| `app/premium.tsx` | ✅ | RevenueCat integrado — título + 4 beneficios + 2 planes + CTA + canje puntos + restaurar + legal. Requiere B18/B19/B20 para funcionar en prod. |
| `app/wrapped/[year].tsx` | ✅ | Soporta period mensual ("2025-01") y anual ("2025") |

### Preferencias de usuario

- **Idioma**: ES / EN — cambiable desde Profile → Ajustes
- **Tema**: Oscuro y Claro — cambiable desde Profile → Ajustes (selector 🌙/☀️). Colores dinámicos vía `lib/colors.ts` + `hooks/useTheme.ts`. `preferencesStore.theme: 'dark' | 'light'` con persistencia AsyncStorage.
- **Onboarding**: `preferencesStore.onboardingCompleted`

---


## Inventario de funcionalidades

> Generado el 2026-06-22 leyendo el código real. Actualizar en cada sesión que añada o cambie una funcionalidad.
> Leyenda: ✅ Activo | 🚩 Gateado | ⚙️ Parcial | 🔲 Futuro/Eliminado

### Autenticación y cuenta

| Funcionalidad | Estado |
|---|---|
| Login con email/contraseña | ✅ Activo |
| Registro con validación GDPR (edad ≥16) | ✅ Activo |
| Recuperación de contraseña | ✅ Activo |
| Reset de contraseña via token | ✅ Activo |
| Refresh automático de sesión | ✅ Activo |
| Logout individual | ✅ Activo |
| Logout de todos los dispositivos | ✅ Activo |
| Onboarding post-registro (4 pasos) | ✅ Activo |
| Actualizar perfil (bio, banner, país) | ✅ Activo |
| Upload de avatar (Cloudinary) | ✅ Activo |
| Borrado de cuenta GDPR (soft delete + físico 30d) | ✅ Activo |
| Toggle idioma ES/EN en login | ✅ Activo |
| Privacy Policy in-app | ✅ Activo |
| Consentimiento GDPR / ATT (iOS) | ⚙️ Parcial |

### Plataformas vinculadas

| Funcionalidad | Estado |
|---|---|
| Vinculación Steam (username o SteamID64) | ✅ Activo |
| Verificación perfil Steam público | ✅ Activo |
| Sync Steam (full + batched + express) | ✅ Activo |
| Vinculación RetroAchievements (username) | ✅ Activo |
| Sync RA (full + batched + express) | ✅ Activo |
| Vinculación PSN (username, NPSSO del sistema) | ✅ Activo |
| Sync PSN (full + batched + express) | ✅ Activo |
| Detección perfil privado en vinculación (PSN/Steam/RA) | ✅ Activo |
| Vinculación Xbox | 🚩 Gateado |
| Sync Xbox | 🚩 Gateado |
| Desvinculación (cascade UserAchievement + XP) | ✅ Activo |
| Sync manual con cooldown por tier | ✅ Activo |
| Sync automático scheduler (03:00 UTC) | ✅ Activo |
| Sync express al vincular (top N juegos) | ✅ Activo |
| Sync progresivo por lotes (Socket.io) | ✅ Activo |
| Resumen estado sync (cooldown, límites diarios) | ✅ Activo |
| Cooldown Steam API (80% alert, 90% pausa) | ✅ Activo |

### Biblioteca de juegos

| Funcionalidad | Estado |
|---|---|
| Listado paginado (infinite scroll, 20/pág) | ✅ Activo |
| Filtros por plataforma (All/Steam/RA/PSN) | ✅ Activo |
| Ordenación en 5 modos (client-side) | ✅ Activo |
| Sort con carga completa de páginas | ✅ Activo |
| Contadores logros earned/total (pre-paginación) | ✅ Activo |
| Contadores juegos completados/total | ✅ Activo |
| Pull-to-refresh (resetQueries + fetchAllRemainingPages si sort activo) | ✅ Activo |
| SyncStatusBar (cooldown, syncs, countdown) | ✅ Activo |
| Invalidación automática al montar | ✅ Activo |
| AppState listener (sync nocturno en background) | ✅ Activo |

### Logros

| Funcionalidad | Estado |
|---|---|
| Búsqueda global de logros | ⚙️ Parcial |
| Filtro logros por plataforma (Steam/RA/PSN) | 🔲 Eliminado del Search UI |
| Estado locked/unlocked en búsqueda | 🔲 Eliminado del Search UI |
| XP y rareza en logros | ✅ Activo |
| Detalle de juego con progreso (X/Y · Z%) | ✅ Activo |
| Filtros en detalle (All/Unlocked/Pending) | ✅ Activo |
| Fetch achievements on-demand (juego sin logros) | ✅ Activo |
| Guías UGC de logros (crear + ver) | ✅ Activo |
| Retar amigo en logro | ⚙️ Parcial |
| Compartir logro | ✅ Activo |
| Ver logros de otros usuarios (Sus logros + Comparar) | ✅ Activo |

### Rankings

| Funcionalidad | Estado |
|---|---|
| Ranking global (XP total) | ✅ Activo |
| Ranking por plataforma (Steam/RA/PSN) | ✅ Activo |
| Mi posición en ranking | ✅ Activo |
| Snapshot diario a PostgreSQL | ✅ Activo |
| Ranking nacional | 🔲 Eliminado |

### Social

| Funcionalidad | Estado |
|---|---|
| Enviar solicitud de amistad | ✅ Activo |
| Búsqueda de usuarios (excluye usuario autenticado) | ✅ Activo |
| Estado de relación en perfil público (5 estados) | ✅ Activo |
| Listar amigos | ✅ Activo |
| Solicitudes pendientes (badge contador) | ✅ Activo |
| Aceptar solicitud de amistad | ✅ Activo |
| Rechazar solicitud de amistad | ✅ Activo |
| Eliminar amigo | ✅ Activo |
| Bloquear usuario | ✅ Activo |
| Feed de actividad (amigos) | ✅ Activo — cursor pagination (`id: { lt: cursor }`, `CursorPaginatedResponse<T>`, `useFeed` con `useInfiniteQuery`) |
| Feed de actividad (público) | ✅ Activo — cursor pagination idéntica a feed de amigos: `usePublicFeed` + `queryKeys.publicFeed()`. Sin `count()` ni `skip`. |
| Perfil público (sin email) | ✅ Activo |
| Comparación de perfiles ("vs tú") | ✅ Activo |
| Compartir perfil (URL OG) | ✅ Activo — share button en `profile/[username].tsx` comparte `https://unlockhub.app/u/{username}` |

### Notificaciones

| Funcionalidad | Estado |
|---|---|
| Centro in-app (listar, leer, contador) | ✅ Activo |
| Campana con badge en header | ✅ Activo |
| Push notifications (Expo Notifications) | ✅ Activo |
| Notificación: FRIEND_REQUEST | ✅ Activo |
| Notificación: ACHIEVEMENT_CHALLENGE | ✅ Activo |
| Notificación: RANKING_UP | ✅ Activo |
| Notificación: CHALLENGE_COMPLETED | ✅ Activo |
| Notificación: STREAK_RISK | ✅ Activo |
| Notificación: PSN reauth requerido | ✅ Activo |

### Gamificación

| Funcionalidad | Estado |
|---|---|
| Sistema de XP normalizado por plataforma | ✅ Activo |
| Niveles basados en XP | ✅ Activo |
| Racha diaria (streak) | ✅ Activo |
| Escudo de racha (Free: 1/mes · Premium: 3/mes) | ✅ Activo |
| Sistema de puntos (historial auditable) | ✅ Activo |
| Puntos por anuncio rewarded (10 pts, cooldown 3h) | ✅ Activo |
| Canje de puntos por premium (300 pts = 7 días) | 🚩 Gateado |
| Retos semanales (progreso + completación) | 🚩 Gateado |
| Wrapped anual (básico + extendido) | ✅ Activo |
| Wrapped mensual | ✅ Activo |
| Compartir Wrapped | ✅ Activo |

### Monetización

| Funcionalidad | Estado |
|---|---|
| AdMob banner Home | ✅ Activo |
| AdMob banner Search | ✅ Activo |
| AdMob banner Rankings | ✅ Activo |
| AdMob banner Friends | ✅ Activo |
| AdMob interstitial | ✅ Activo |
| AdMob interstitial Wrapped | ✅ Activo |
| AdMob interstitial 100% completado | ✅ Activo |
| AdMob rewarded (10 pts por visualización) | ✅ Activo |
| Pantalla premium (RevenueCat) | 🚩 Gateado |
| Compra de suscripción (RevenueCat) | 🚩 Gateado |
| Webhook RevenueCat (backend) | ⚙️ Parcial |
| Restauración de compras | 🚩 Gateado |
| PremiumBanner (paywall inline) | 🚩 Gateado |

### Perfil y personalización

| Funcionalidad | Estado |
|---|---|
| Avatar placeholder con iniciales | ✅ Activo |
| Upload de avatar (Cloudinary) | ✅ Activo |
| Bio y banner de perfil | ✅ Activo |
| Upload de banner (Cloudinary) | ✅ Activo |
| País (countryCode) | ✅ Activo |
| Idioma ES/EN persistente | ✅ Activo |
| Tema (oscuro y claro) | ✅ Activo |
| Versión de app en perfil | ✅ Activo — `expo-constants` al pie de Ajustes, i18n `profile.app_version` |
| Estadísticas avanzadas premium | 🚩 Gateado |
| Privacidad de perfil (PUBLIC/FRIENDS_ONLY/PRIVATE) | ✅ Activo |

### Infraestructura y operaciones

| Funcionalidad | Estado |
|---|---|
| Dashboard admin (HTML + JSON métricas) | ✅ Activo |
| Health check endpoint | ✅ Activo |
| Background sync scheduler (03:00 UTC) | ✅ Activo |
| GDPR cleanup job (04:00 UTC, físico 30d) | ✅ Activo |
| Streak scheduler (00:00 UTC) | ✅ Activo |
| Streak shields recharge (01:00 UTC día 1/mes) | ✅ Activo |
| Challenge scheduler | 🚩 Gateado |
| Seed catálogo (admin BullMQ job) | ✅ Activo |
| Socket.io multi-instancia (redis-adapter) | ✅ Activo |
| Sync progress Socket.io | ✅ Activo |
| Activity feed Socket.io | ✅ Activo |
| OG profiles (`GET /api/v1/users/:username/og`) | ✅ Activo — HTML Open Graph por perfil público; PRIVATE → 404 |
| Rate limiting global (500 req/15min) | ✅ Activo |
| Rate limiting auth (10 req/15min) | ✅ Activo |
| Rate limiting search (60 req/min) | ✅ Activo |
| Sentry crash reporting (mobile + API) | ✅ Activo |
| Analytics PostHog | ✅ Activo |
| OfflineBanner global | ✅ Activo |
| ErrorBoundary global | ✅ Activo |
| Modo mantenimiento | ✅ Activo |

---

## Decisiones de arquitectura

Ver [docs/DECISIONS.md](docs/DECISIONS.md)

---

## Flujo de trabajo con Claude

- Proyecto de Claude 'UnlockHub' sincronizado con los docs del repo (CLAUDE.md, BACKLOG.md, DECISIONS.md) vía integración GitHub.
- La sincronización NO es automática: pulsar 'Sync now' en el proyecto al inicio de cada sesión si se han pusheado cambios en los docs.
- Prompts a Claude Code siempre empiezan con 'Lee el CLAUDE.md completo antes de hacer cualquier cambio.'
- Flujo de release: develop → main con --no-ff + tag vX.Y.Z. EAS version source: remote (versionCode gestionado por EAS, ignora app.json).
- Builds de diagnóstico: usar build local (docs/BUILD_LOCAL.md) para no consumir cuota EAS. Build local apunta a producción cambiando EXPO_PUBLIC_API_URL en .env.local.

---

## Roadmap

| Fase | Contenido | Estado |
|---|---|---|
| **Fase 1 — MVP** | Monorepo, auth, Steam + RA, logros, rankings, perfil, i18n, AdMob | ✅ Completa |
| **Fase 2 — Social** | Amigos, feed, retos, puntos, racha, push notifications, Wrapped, perfil público, búsqueda | ✅ Completa |
| **Fase 3 — Producción** | Railway, Sentry, GDPR, escudo de racha, notificaciones, Wrapped mensual, canje puntos, stats, guías UGC, dashboard admin, tests k6, Play Store, premium diferido a Fase 4 | 🔄 En progreso |
| **Fase 4 — Avanzado** | Torneos internos, App Store iOS, Xbox | 🔲 Futuro |

> **Aviso legal Fase 4**: Torneos con recompensas económicas pueden clasificarse como juegos de azar en España (Ley 13/2011). Solo recompensas en puntos/días premium hasta consultar con abogado.

---

## Orden de desarrollo — Fase 3 (en progreso)

> ✅ = implementado | ⚙️ = acción manual del desarrollador

1. ✅ Redis AOF + Socket.io redis-adapter
2. ✅ Sentry — SDKs instalados y DSNs configurados
3. ✅ Pino — logger JSON activo. ✅ Logtail (Better Stack) conectado — `LOGTAIL_SOURCE_TOKEN` en Railway (N2 ✅)
4. ✅ UptimeRobot — monitor activo
5. ✅ Health check endpoint completo
6. ✅ Dashboard de administración
7. ✅ GDPR — borrado de cuenta. ⚙️ Migrar en prod (B17)
8. ✅ AdMob + UMP SDK integrado — `react-native-google-mobile-ads` instalado, plugin en `app.json` (test App ID), `AdBanner` actualizado (`unitId: 'home'|'search'`), `useInterstitialAd` + `useRewardedAd` hooks, endpoint `POST /api/v1/points/rewarded-ad` (10 pts, cooldown 3h Redis), `REWARDED_AD` en `PointReason`. ⚙️ Pendiente B8-B9: IDs de producción como EAS secrets.
9. ✅ Privacy policy en app. ✅ Privacy Policy + ToS publicados en GitHub Pages. ✅ Datos del desarrollador rellenados. ✅ Texto legal con enlaces en pantalla de registro.
10. ✅ Escudo de racha
11. ✅ Centro de notificaciones in-app
12. ✅ Variables Railway configuradas: `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `APP_SCHEME`, `CLOUDINARY_URL`, `ADMIN_SECRET`, `LOGTAIL_SOURCE_TOKEN` (N2 ✅), `POSTHOG_API_KEY` (N4 ✅).
13. 🚩 Google Play Billing vía RevenueCat — diferido a Fase 4. Código intacto. Activar con `FEATURES.premium = true` + completar B18/B19/B20.
14. ✅ Analíticas — analytics.ts activo en producción. `POSTHOG_API_KEY` configurada en Railway (N4 ✅)
15. ✅ Ayuda contextual en vinculación de plataformas
16. ✅ Wrapped mensual + anual
17. ✅ Canje de puntos por premium
18. ✅ Estadísticas avanzadas premium
19. ✅ Guías UGC
20. ✅ Tests de carga k6
21. ✅ Keystore Android guardado (N5 ✅) — EAS Build producción NO lanzar sin pedirlo explícitamente
22. ⚙️ Smoke tests de producción
23. ⚙️ Play Store submit — cuenta creada (B7 ✅) · AdMob producción (B8 ✅) · assets generados ✅ · listing con textos ✅ · validación release local OK ✅ · AAB producción versionCode 3 subido ✅ · Prueba interna publicada y enviada a testers ✅ · Listing completo (título, descripciones, contacto, categoría) ✅ · Clasificación de contenido completada ✅ · Seguridad de los datos completada ✅ · PENDIENTE: feedback de testers, limpiar BD (PL13), verificar edge-to-edge Android 15 (PL14), promover a Producción

---

## Backlog

Ver [docs/BACKLOG.md](docs/BACKLOG.md)

---

## Última revisión de código

**Fecha**: 2026-06-21 (fix XP Wrapped + listing Play Store + solicitud producción) — Fix BUG XP Wrapped (T96): `totalXpGained` en `wrapped.service.ts` calculaba sobre `UserPoint.createdAt` (fecha de sync, siempre 2026) → mostraba 0 para años anteriores. Fix: `achievementXp = sum(normalizedPoints)` de `UserAchievement` filtrados por `unlockedAt` (fecha real del desbloqueo) + `streakXp = sum(UserPoint.amount, reason: STREAK, createdAt en período)`. Rama `fix/wrapped-xp-zero` → develop (commit `04e8a9c`). Deploy automático Railway. Verificado en device: 42.200 XP en Wrapped 2025. Listing Play Store completado (PL22 ✅): nombre "UnlockHub: Logros y Trofeos", 5 capturas orientadas a lo social, solicitud de producción enviada a Google (2026-06-21) tras 14 días de prueba cerrada. Pendiente: aprobación Google + outreach día D. Tests: **412 mobile · 632 API · 0 TS/lint** (sesión solo docs).

**Fecha**: 2026-06-17 (diagnóstico PostHog EU + AdMob plugin fix + bugfix challenge friend_challenged) — Fix de región PostHog (US → EU, proyecto 203333) + `host: 'https://eu.i.posthog.com'` + `flushAt: 10` / `flushInterval: 5000` en `analytics.ts`. AdMob plugin movido a `expo.plugins` con `androidAppId`/`iosAppId` — `APPLICATION_ID` ahora inyectado correctamente en el manifest (banners no cargaban en builds release). Smoke test preview: PostHog EU ✅ (eventos `app_open` + `identify` capturados), A49 CMP ✅ (consentimiento antes de banners), AdMob banners ✅, A51 cubierto por tests (pendiente verificar en prod con usuario >100 juegos Steam). Bugfix `friend_challenged` (feature 100% rota en producción): `game/[id].tsx` enviaba `{ friendId }` → backend esperaba `{ friendUserId }` → 400 sistemático. Fix de 3 líneas en cliente + `analytics.friendChallenged(achievementId)` en `onSuccess` + test de regresión en `GameDetailScreen.test.tsx`. Barrido de 16 contratos cliente↔backend: único desajuste real. Tests: **412 mobile (+1) · 632 API · 0 TS/lint**.

**Fecha**: 2026-06-13 (analítica de retención pre-lanzamiento) — Instrumentación PostHog mínima para medir retención y activación. `lib/analytics.ts`: extendido con `identify(userId, properties)`, `reset()`, `appOpen()` y `syncCompleted(platform)`. `hooks/useAuth.ts`: `analytics.identify` en login/register `onSuccess`; `analytics.reset()` en ambas ramas de logout. `app/_layout.tsx` (`SessionRestorer`): `analytics.appOpen()` en cada cold start; `analytics.identify` tras restaurar sesión exitosamente. Eventos tipados conectados: `onboarding_completed` en `onboarding.tsx`, `platform_linked` en las 3 pantallas de vinculación (Steam/RA/PSN), `wrapped_shared` en `wrapped/[year].tsx`, `sync_completed` en `useSyncProgress.ts:onSyncComplete`. `.env.example` actualizado con `EXPO_PUBLIC_POSTHOG_API_KEY` (placeholder). Estado EAS secret: verificar en expo.dev → Secrets antes de la próxima build. Tests: 4 nuevos en `__tests__/hooks/useAuth.test.ts` (identify en login/register, reset en logout exitoso y fallido). Tests: **411 mobile (+4) · 632 API · 0 TS/lint**.

**Fecha**: 2026-06-13 (auditoría S7 — A51 tope de juegos Steam por sync) — Control de costes pre-lanzamiento. `STEAM_MAX_GAMES_PER_SYNC = 100` en `steamQuota.ts`. `steam.adapter.ts`: `rtime_last_played` en `SteamOwnedGame`; método privado `sortEligibleByActivity` (rtime_last_played desc + playtime_forever desempate); tope aplicado en `syncUser` y `syncUserBatched` antes de `processGames`; log pino cuando hay omisiones; `total` del progreso refleja solo juegos procesados. Coherencia A24: contador Redis solo incrementa en juegos procesados. `syncUserExpress` sin cambios (tope propio 20). `gamesSkipped` no propagado al socket/mobile (coste alto — log/no-op documentado). 3 tests: ≤100 todos procesados, >100 exactamente los 100 más recientes, contador Redis 301 (no 451). Tests: **632 API (+3) · 407 mobile · 0 TS/lint**.

**Fecha**: 2026-06-13 (auditoría S6b — cierre limpieza) — Sesión de cierre de la limpieza post-lanzamiento. **A22**: `triggerExpressSync` ahora llama `queueInitialSync` cuando el lock Redis no está disponible — el trabajo nunca se pierde silenciosamente; sin doble encolado cuando sí adquiere el lock. 2 tests nuevos. **A39**: `loadUserAchievements` en `wrapped.service.ts` migrado a `select` explícito — solo los 5 campos de achievement y 4 de game realmente usados en `computeStats`/`computeExtendedStats`; tipo `UserAchievementFull` actualizado. **A9**: `eslint-disable-next-line security/detect-unsafe-regex` con justificación en `useWrapped.ts:15`. **A12/A13**: `.depcheckrc` en `apps/api/` y `apps/worker/` documentando falsos positivos de depcheck. Barrido: madge 0 ciclos (375 archivos) · i18n ES=EN 627 claves 0 diff · 0 queryKeys literales en producción · `usePublicFeed` hook huérfano (sin pantalla consumidora — T93). **Reconciliación nomenclatura**: S6a (A49, A41, A2) + S6b (A9, A12, A13, A22, A37, A39, barrido) — etiquetas S6c/S6d absorbidas. A38/A40 formalizados como 🔲 Fase 4. Tests: **629 API (+2) · 407 mobile · 0 TS/lint**.

**Fecha**: 2026-06-13 (auditoría S6d — A37) — `getPublicFeed` migrado de offset pagination a cursor-based. Firma nueva: `getPublicFeed(limit, cursor?)` → `CursorPaginatedResponse<ActivityEvent>` — sin `count()`, sin `skip`, filtro `id: { lt: cursor }`. Controller usa `feedQuerySchema` existente (eliminado import `paginationSchema`). Mobile: `hooks/usePublicFeed.ts` + `queryKeys.publicFeed()`. Cutover limpio confirmado con grep — no había consumidor activo. Decisión de compatibilidad y orden de despliegue documentados en SESSION_LOG. Tests: 627 API (+4) · 407 mobile (+5) · 0 TS/lint.

**Fecha**: 2026-06-13 (auditoría S6c — A2) — Cierre CVE tar: override imposible sin `--force`. `@mapbox/node-pre-gyp@1.0.11` declara `tar@^6.1.11`; npm 11.12.1 no aplica overrides que crucen major-version boundaries (probadas 4 variantes — plana, anidada, con y sin lock file). `npm audit fix --force` descartado. **Riesgo aceptado**: tar solo se ejecuta en `npm install` (extracción binario precompilado de bcrypt), no en el runtime del servidor. Superficie real: atacante debe comprometer npm registry bajo HTTPS+SHA-512. **Alternativa futura**: `bcrypt@5→6` (usa `node-gyp-build`, elimina `@mapbox/node-pre-gyp` + `tar`) — diferida a auditoría post-lanzamiento. Sin cambios de código. Tests: 623 API · 402 mobile · 0 TS/lint.

**Fecha**: 2026-06-13 (auditoría S6b — A41) — Cuota Steam 90 % en manual sync. `apps/api/src/config/steamQuota.ts` centraliza `STEAM_DAILY_LIMIT`, `STEAM_BACKGROUND_SYNC_THRESHOLD` (0.8) y `STEAM_MANUAL_SYNC_THRESHOLD` (0.9). `background-sync.scheduler.ts` migrado a importar del módulo compartido. `triggerManualSync`: nuevo bloque de comprobación de cuota para `platform === 'STEAM'` antes de encolar — lee el contador Redis del día; si ≥ 90 %: libera cooldown + retorna `skippedByQuota: true` si hay otras plataformas, o lanza `STEAM_QUOTA_EXCEEDED` 429 si Steam es la única. Controller: HTTP 200 para `skippedByQuota`, 202 para sync real. Mobile `useSyncAll`: detecta ambos escenarios y expone `steamQuotaState: 'exceeded'|'skipped'|null`. `SyncStatusBar`: aviso no bloqueante (rojo exceeded / ámbar skipped). 5 tests nuevos (3 API + 2 mobile) + 1 fix mock en `SyncStatusBar.test.tsx`. Tests: 623 API (+3) · 402 mobile (+2) · 0 TS/lint.

**Fecha**: 2026-06-13 (auditoría S6a — A49) — UMP consent vs AdBanner. `consentResolved: boolean` (inicial `false`) añadido a `preferencesStore` sin persistencia AsyncStorage. `useGdprConsent` llama `setConsentResolved(true)` en `finally` de `requestConsent()` (ambas ramas: NOT_REQUIRED y REQUIRED) y en early return si el módulo nativo no está disponible. `AdBanner` gatea render con `if (!consentResolved) return null` de forma centralizada. 5 tests nuevos: 2 en `AdBanner.test.tsx` + 3 en `__tests__/hooks/useGdprConsent.test.ts`. Tests: 400 mobile (+5) · 620 API · 0 TS/lint.

**Fecha**: 2026-06-12 (incidente deploy INC-01 — solo documentación) — Migración `20260612000000_add_performance_indexes_s3` (índices A33-A36) bloqueó producción con P3018/P3009: `CREATE INDEX CONCURRENTLY` no puede ejecutarse dentro de la transacción que Prisma 5.x añade automáticamente a toda migración. Resolución: `migrate resolve --rolled-back` → 5 índices creados manualmente con `prisma db execute --file` (fuera de transacción) → `indisvalid=true` verificado en todos → cada migración marcada con `migrate resolve --applied` → deploy SUCCESS. Sin cambios de código; solo archivos de migración y documentación. Pendiente de seguridad: rotar contraseña Postgres en Railway (SEC-01, AUDIT.md). Convención CONCURRENTLY actualizada en este documento.

**Fecha**: 2026-06-11 (auditoría S5) — Mobile, seguridad y datos. A44 thumbnails Cloudinary (5 puntos), A45 polling dinámico useSyncStatus, A46 Sentry beforeSend (redacta token/Authorization y body /auth/*), A48 401 en refresh → clearSession + redirección a login (antes sesión inválida sin redirigir), A10 completo (0 console.log en producción mobile). A49 (UMP consent) → S6a pre-lanzamiento. Tests: 395 mobile (+8) · 620 API · 0 TS/lint.

**Fecha**: 2026-06-11 (sesión 72) — Diagnóstico y fix de bugs en producción vía build local con logs de Metro. Fix uploadFile: XMLHttpRequest en lugar de fetch para multipart en React Native (fetch no serializa {uri,name,type} correctamente). Fix ruta rewarded-ad: '/api/v1/points/rewarded-ad' → '/api/v1/users/me/points/rewarded-ad' (ruta incorrecta desde el inicio, causaba 404). Fix bannerMutation.onSuccess: actualiza store de sesión en tiempo real con nuevo banner (antes requería reiniciar app). Fix loginHandler: añadidos avatar, banner, streakDays, streakShields, countryCode, profileVisibility, role a la respuesta. Fix meHandler: ahora devuelve perfil completo via userService.getProfile() en lugar de solo {id,email,isPremium}. Causa raíz del banner/avatar perdido tras logout: la respuesta de login no incluía avatar/banner. Tests: 385 mobile + 611 API. 0 errores TS/lint.

**Fecha**: 2026-06-10 (sesión 71) — Segunda auditoría completa apps/mobile en dos prompts. Prompt 1 (crashes): ALTO-1 useRewardedAd listener CLOSED leak en showForReward → showForRewardUnsubRef + inFlightRef guard doble llamada. ALTO-2 isReady como useState reactivo. MEDIO-1 useWrappedInterstitial cooldown guardado antes de show() → movido dentro del callback + useRef para timeout. MEDIO-2 useCompletedGamesInterstitial IDs guardados antes de show() → flag cancelled + solo guardar si show() devolvió true. BAJO-1 ComingSoon edges prop opcional. Prompt 2 (calidad): CRÍTICO 5 claves i18n faltantes en PremiumBanner (active_lifetime, active_lifetime_desc, _aria×3). ALTO useRankings queryKeys locales migradas a lib/queryKeys.ts. ALTO useFeed flag unmounted en doConnect. ALTO reset-password guard token. ALTO profile.tsx AppState listener cooldown rewarded + guard data?.avatar + invalida queryKeys.me(). ALTO PremiumBanner expiresAt null guard. MEDIO useInterstitialAd show() retorna boolean. MEDIO useSyncProgress flag unmounted en grace timer. BAJO useSubscription cancelled flag. BAJO ComingSoon challenges edges. Tests: 378 mobile + 611 API. 0 errores TS/lint.

**Fecha**: 2026-06-09 (sesión 70c) — Auditoría completa apps/mobile: 2 prompts de análisis. Fixes aplicados: useRewardedAd (RewardedAdEventType.CLOSED→AdEventType.CLOSED + tipo corregido), friends.tsx SafeAreaView edges, socket leaks en useFeed + useSyncProgress (handlers con nombre + off() en cleanup), AsyncStorage sin await en useWrappedInterstitial + useCompletedGamesInterstitial, i18n duplicados (sync_button + settings_theme en es.json y en.json), guards param undefined en game/[id].tsx + profile/[username].tsx + user-game/[username]/[gameId].tsx + wrapped/[year].tsx, queryKeys locales en useFriends migradas a lib/queryKeys.ts, debounce en preferencesStore.persistCurrent, useMemo en useMyGames deduplicación, AbortController timeout ref en useMaintenanceCheck, staleTime 5min en useRankings. Tests: 378 mobile + 611 API. 0 errores TS/lint.

**Fecha**: 2026-06-09 (sesión 70b) — BUG-A: fix unlinkPlatform — `invalidateUserPublicCache(userId)` añadido tras desvincular para que la caché Redis pública no sirva juegos de la plataforma desvinculada (+ test). BUG-B: fix edge-to-edge en `app/user-game/[username]/[gameId].tsx` — `edges=['top','left','right']` porque la pantalla no tiene header de React Navigation (root layout `headerShown: false`). BUG-C: fix edge-to-edge en `profile.tsx` — `edges=['left','right']` en el SafeAreaView principal (sin edges por defecto incluía top duplicando el inset del header de Tabs). BUG-D: fix orden biblioteca usuario público — `getMyGames` ahora ordena por `lastActivityAt DESC` en lugar de alfabético (la biblioteca propia re-ordena en cliente; la pública mostraba orden incorrecto). Tests: 611 API + 368 mobile. 0 errores TS/lint.

**Fecha**: 2026-06-09 (sesión 70) — Fix worker Railway: Dockerfile propio en `apps/worker/Dockerfile` (build multi-stage, tsx runtime, WORKDIR /app). Config File Path `apps/worker/railway.json` configurado en Railway dashboard. preDeployCommand corregido a solo `npx prisma migrate deploy` (sin `cd apps/api` — el Dockerfile raíz ya tiene WORKDIR /app/apps/api). package-lock.json regenerado con @unlockhub/worker@0.0.1. API: 10 migrations found, API arrancada port 8080. Worker: todos los schedulers BullMQ activos, syncs procesándose.

**Fecha**: 2026-06-09 (sesión 69) — Fix platformAccount.update → upsert en 6 ocurrencias (race condition P2025 durante sync en `retroachievements.adapter.ts`, `sync.service.ts`, `xbox.adapter.ts`, `sync.worker.ts`). V3: nuevo `apps/worker/` con 5 workers + schedulers, cierre limpio SIGTERM/SIGINT. `apps/api/src/index.ts` limpiado de workers. Trade-off documentado: Socket.io desde worker requiere `@socket.io/redis-emitter` — fallback polling Redis activo. Worker desplegado en Railway como servicio `unlockhub-worker`. Shared Variables configuradas en Railway (14 variables compartidas entre API y worker). Tests: 610 API + 368 mobile. 0 errores TS/lint.

**Fecha**: 2026-06-07 (sesión 67) — Revisión completa del proyecto (backend + mobile + packages). Backlog actualizado: F20 ✅ (ad units Rankings/Friends + EAS secrets configurados), PL14 ✅ (edge-to-edge Android 15 validado en dispositivo físico), PL19 ⚙️ añadido (smoke tests finales antes de promover a Producción). CLAUDE.md corregido: descripción `background-sync.scheduler.ts` eliminaba referencia a "login en últimos 7 días" que no existe en código ni schema (no hay campo `lastLoginAt`). Sin bugs críticos encontrados — código limpio en los ~30 archivos revisados. Tests: 610 API + 368 mobile ✅. 0 errores TS/lint.

**Fecha**: 2026-06-07 (sesión 66) — Optimizaciones pre-producción. **PL16**: 3 índices PostgreSQL en `User` (`createdAt`, `isPremium`, `lastSyncAt`) + migración `20260607000000_add_user_performance_indexes`. **PL17**: caché Redis TTL 5 min en `getUserGames` y `getUserGameAchievements`; `invalidateUserPublicCache()` llamada desde sync.worker y updateProfile (cambio de profileVisibility). **PL18**: 11 archivos migrados a imports directos `@expo/vector-icons/Ionicons` — elimina glyph maps no usados. Tests: 610 API + 368 mobile ✅. 0 errores TS/lint.

**Fecha**: 2026-06-07 (sesión 65) — T13, T14, T27 resueltos en rama `feat/t13-t14-t27`. T13 (parallel RA) y T14 (desnormalización) diferidos con análisis documentado en BACKLOG. T27 (✅): `POST /api/v1/games/:id/fetch-achievements` con guard 24h; `fetchSteamAchievementDefinitions` y `fetchRaAchievementDefinitions` exportadas; nuevo `games.service.ts`; botón "Cargar logros" en `game/[id].tsx` con `useMutation` + invalidación caché; i18n ES/EN. API: 610/610 tests ✅. Mobile: 368/368 tests ✅. 0 errores TS/lint.

**Fecha**: 2026-06-07 (sesión 64) — F28, F10, T4 implementados en rama `feat/f28-f10-t4`. **F28**: versión de app al pie de ajustes en `profile.tsx` — `expo-constants` + i18n `profile.app_version`. **F10**: `GET /api/v1/users/:username/og` devuelve HTML con Open Graph meta tags; `getOgProfileData()` en `user.service.ts`; PRIVATE → 404; share button en `profile/[username].tsx` comparte `https://unlockhub.app/u/{username}`. **T4**: `getFriendsFeed` reemplaza offset por cursor (`id: { lt: cursor }`); respuesta `CursorPaginatedResponse<T>` en `@unlockhub/types`; `useFeed` migrado a `useInfiniteQuery` con `pageParam` como cursor + Socket.io prepend intacto. API: 597/597 tests ✅. Mobile: 364/364 tests ✅. 0 errores TS/lint.

**Fecha**: 2026-06-05 (sesión 63) — T54 refactor completado. BUILD_LOCAL.md duplicado eliminado (raíz obsoleto vs docs/ actualizado). API: `createUploadMiddleware(field)` factory en upload.middleware.ts (T45); `makeUploadHandler(serviceMethod)` en user.controller.ts (T44). Mobile: `lib/queryKeys.ts` con 30+ claves tipadas — actualizados 15 hooks + 12 screens (T46); `hooks/useDebounce.ts` que reemplaza el patrón timerRef duplicado en useSearch/useSearchAchievements (T47); `lib/adUnits.ts` `ADMOB_TEST_IDS` centraliza los 3 IDs de test AdMob (T48). Fix colateral: `profile.tsx` invalidaba `['my-stats']` (no-op) — corregido a `queryKeys.userStats()`. API: 593/593 tests ✅. Mobile: 364/364 tests ✅. 0 errores TS/lint.

**Fecha**: 2026-06-05 (sesión 62) — T57 modo claro implementado. `lib/colors.ts` con tokens `darkColors`/`lightColors`. `hooks/useTheme.ts` devuelve colores según tema activo. `preferencesStore.theme: 'dark'|'light'`. Selector activado en `profile.tsx` (🌙/☀️). 22 archivos actualizados — NativeWind para layout, inline styles para colores. i18n ES/EN. Tests: 364/364 ✅.

**Fecha**: 2026-06-04 (sesión 59) — PL13 script limpieza BD + merge develop→main + tag v1.0.0+ limpieza ejecutada en producción. Script `scripts/cleanup-test-users.ts` creado y ejecutado: 7 usuarios de prueba eliminados, TestUser99 y Sovelyss preservados, catálogo intacto (**2.878 juegos + 134.928 logros**). Script ampliado a múltiples `--preserve-username` (Prisma `notIn`). Merge develop → main `--no-ff`. Tag `v1.0.0` en GitHub. PL13 ✅, PL15 ✅.

**Fecha**: 2026-06-04 (sesión 58) — Build local APK debug validado con SDK 55 + RN 0.83.6. BUILD SUCCESSFUL — APK debug 204.9 MB. Proceso documentado en docs/BUILD_LOCAL.md. Quirks nuevos: react-native bundle → expo export:embed (CLI v20 rompe el comando anterior); --entry-file omitido en monorepo (se resuelve desde package.json "main"); Gradle 9.0.0 → 8.13 tras cada prebuild. @react-native-community/cli@20.1.3 instalado desde raíz del monorepo.

**Fecha**: 2026-06-04 (sesión 57) — Verificación pre-AAB v4 + corrección tests rotos. T17/T18 verificados: Railway Deploy Logs confirma "8 migrations found" — todas las migraciones incluyendo gdpr_soft_delete aplicadas en producción. 3 tests API corregidos que estaban rotos por cambios de sesiones anteriores: repositories.test.ts (findUserByUsername con deletedAt: null), user.service.test.ts (mock refreshToken.updateMany), xbox.adapter.test.ts (tokenJson sin cifrar). Quirks SDK 55 + RN 0.83.6 documentados: Gradle 9.0.0 incompatible con RN 0.83.6 → parchear a 8.13 tras cada prebuild local; compileSdkVersion actualizado a 36 por androidx.core:1.17.0. EAS Build no requiere estos parches. bundleRelease BUILD SUCCESSFUL — AAB local 68.7 MB. API: 566/566 tests ✅. Mobile: 352/352 tests ✅. 0 errores TS/lint.

**Fecha**: 2026-06-04 (sesión 56) — T49/T50/T51 + upgrade Expo SDK 51→55. **T49 (bug crítico background-sync)**: `background-sync.scheduler.ts` línea 35 — `gte: oneDayAgo` → `lte: oneDayAgo`. La condición anterior sincronizaba usuarios que YA habían sincronizado recientemente en lugar de los que llevan más de 24h sin hacerlo — exactamente el comportamiento inverso al deseado. **T50 (tests auth soft-delete)**: `auth.routes.test.ts` — test 1: `POST /refresh` → 401 cuando tokens revocados por `deleteAccount`; test 2: `GET /me` → 401 `ACCOUNT_DELETED` cuando middleware `authenticate` detecta `deletedAt`. Mock de `prisma.user.findUnique` añadido al fichero. **T51 (tests race condition rewarded ad)**: `points.service.test.ts` — corregidos mocks existentes para reflejar implementación `SET NX` real (antes mockeaban `redis.get` en lugar de `redis.set`); nuevo test `Promise.allSettled` con 2 llamadas simultáneas → exactamente 1 fulfilled con `{ pointsEarned: 10 }`, 1 rejected con `REWARDED_AD_COOLDOWN` 429. **Expo SDK 51→55**: `expo` ~51→^55, `react-native` 0.74.5→0.83.6, `react` 18.2.0→19.2.0, `react-native-reanimated` 3→4 + `react-native-worklets` 0.7.4, `react-native-google-mobile-ads` v13→v16.3.3 (workaround Kotlin ya no necesario), `@shopify/flash-list` v1→v2 (`estimatedItemSize` eliminado en 7 usos), `kotlinVersion` 1.9.23→2.1.20, `compileSdkVersion` 34→35. `expo doctor` 19/19 ✅. Tests: 352/352 ✅.

**Fecha**: 2026-06-04 (sesión 55) — F20: ampliar placements AdMob. `AdBanner` type ampliado a `'home'|'search'|'rankings'|'friends'`; vars de entorno `EXPO_PUBLIC_ADMOB_RANKINGS_BANNER_ID` + `EXPO_PUBLIC_ADMOB_FRIENDS_BANNER_ID` con fallback a test ID. `<AdBanner unitId="rankings" />` en `RankingsScreen` entre filtros y lista; banner footer de `RankingList` reemplazado. `<AdBanner unitId="friends" />` en `FriendsScreen` después del selector de tabs. Nuevo `hooks/useWrappedInterstitial.ts`: cooldown 24h por AsyncStorage (`admob:wrapped_interstitial:last_shown`), delay 1.5s — llamado en `wrapped/[year].tsx`. Nuevo `hooks/useCompletedGamesInterstitial.ts`: AsyncStorage `admob:completed_game_ids` por gameId (max 500), solo dispara para IDs nunca vistos al 100% — llamado en `index.tsx` con la lista completa de juegos. `.env.example` actualizado con los 6 IDs separados. 0 errores TS/lint. **Pendiente acción dev**: crear 2 nuevos ad units Banner en AdMob Console y configurar como EAS secrets.

**Fecha**: 2026-06-03 (sesión 54) — Fase 4 inicio: backlog actualizado + 4 ítems inmediatos completados. **T55 (edge-to-edge Android 15)**: todos los tabs cambiados a `edges={['left', 'right']}` en SafeAreaView — el header de React Navigation gestiona top y el tab bar gestiona bottom; sin el fix, `targetSdkVersion=35` contaba el safe area inset del status bar dos veces. **T53 (crash sync largo)**: 4 fixes — `syncProgressKey` en `finally` de `sync.worker.ts`; guard `MAX_PAGES=10` en `fetchUserTitles` de `psn.adapter.ts`; claves stale RA con TTL 7 días en `retroachievements.adapter.ts`; throttle 15s en handler socket de `useSyncProgress.ts`. **T56 (fixes seguridad sesión 53)**: verificados y correctamente aplicados — xbox doble cifrado, `searchUsers` deletedAt, `deleteAccount` revocación RefreshTokens. **T52 (caché Redis metadatos juego)**: nuevo `game-cache.ts` — clave `game:meta:{platform}:{externalId}` TTL 24h; adapters PSN/RA/Steam comprueban caché antes de cada `game.upsert`; syncs repetidos no generan escrituras a PostgreSQL para juegos ya conocidos. 0 errores TS/lint en API y mobile.

**Fecha**: 2026-06-03 (sesión 53) — Auditoría de seguridad de datos en BD. Vulnerabilidades encontradas y corregidas: **CRÍTICA**: `xbox.adapter.ts` doble cifrado AES-256-GCM en `exchangeXboxCodeForTokens` — `linkPlatform` volvía a cifrar un token ya cifrado, causando que todos los syncs Xbox fallaran con "Token Xbox corrupto". Fix: devolver `tokenJson` sin cifrar (responsabilidad del cifrado delegada a `linkPlatform`). **MEDIA-1**: `search.service.ts` — `searchUsers` no filtraba `deletedAt: null` — usuarios soft-deleted aparecían en búsquedas durante 30 días. Fix: añadido `deletedAt: null` al `where`. **MEDIA-2**: `user.service.ts` — `deleteAccount` no revocaba `RefreshToken`s — usuario podía obtener nuevos access tokens tras borrar su cuenta. Fix: `refreshToken.updateMany({ revokedAt: new Date() })` añadido a la transacción atómica. Informacionales documentados (sin corrección): `passwordHash` cargado en memoria sin `select` explícito, `findUserByUsername` sin filtro `deletedAt` interno, placeholder `ENCRYPTION_KEY` en `.env.example` es hex válido. Ficheros modificados: `xbox.adapter.ts`, `platform.controller.ts`, `search.service.ts`, `user.service.ts`. 0 errores TS/lint.

Historial completo en [docs/SESSION_LOG.md](docs/SESSION_LOG.md)