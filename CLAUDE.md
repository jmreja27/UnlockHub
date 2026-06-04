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
> - N4 (PostHog): ✅ Cuenta creada, plan Free, `POSTHOG_API_KEY` configurado en Railway Variables — analytics activo en producción
> - N5 (Keystore Android): ✅ Guardado desde expo.dev → proyecto → Credentials

### 🟡 Necesarios antes del lanzamiento

| # | Acción | Dónde | Coste | Para qué se usa |
|---|---|---|---|---|
| ~~N2~~ | ✅ **Logtail (Better Stack) conectado a Railway** | Better Stack → fuente "UnlockHub API" (JavaScript/HTTP) → `LOGTAIL_SOURCE_TOKEN` configurado en Railway Variables | Gratis (7 días retención) | ✅ Completado — logs estructurados JSON de pino enviados a Better Stack |
| N3 | Escalar Railway a **mínimo 2 réplicas** en producción | Railway dashboard → service → Settings → Replicas → 2 | ~5€/mes adicional | Alta disponibilidad — redis-adapter ya configurado |
| ~~N4~~ | ✅ **PostHog — cuenta + Project API Key configurada** | posthog.com → Create Project → `POSTHOG_API_KEY` configurado en Railway Variables | Gratis hasta 1M eventos/mes | ✅ Completado — analytics activo en producción. Plan Free |
| ~~N5~~ | ✅ **Keystore Android guardado desde Expo credentials** | expo.dev → proyecto → Credentials | Gratis | ✅ Completado |

### 🟢 Cuando el volumen lo justifique

| # | Acción | Dónde | Coste | Cuándo |
|---|---|---|---|---|
| V1 | Migrar imágenes a **Cloudflare Images** | cloudflare.com | ~5€/mes | Con 5.000+ usuarios |
| V2 | Activar **read replica** en Neon | console.neon.tech | ~20€/mes adicional | Cuando queries de ranking superen 500ms |
| V3 | Separar workers BullMQ a proceso dedicado en Railway | `apps/worker` en el monorepo, nuevo service en Railway | ~5€/mes | Cuando sync afecte latencia de la API |
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
| Intl.NumberFormat / Intl.DateTimeFormat | Formateo localizado — usar siempre, nunca hardcodear formatos |
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
| Railway | Deploy API | ✅ Activo — https://unlockhub-production.up.railway.app |
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
│   └── api/
│       ├── src/
│       │   ├── routes/
│       │   ├── controllers/
│       │   ├── services/
│       │   ├── repositories/
│       │   ├── jobs/                # BullMQ workers
│       │   ├── sockets/             # Socket.io + redis-adapter ✅
│       │   ├── middleware/          # auth, rate-limit, roles, errores
│       │   ├── admin/               # Dashboard ✅ — protegido por ADMIN_SECRET bearer
│       │   └── platforms/
│       │       ├── platform.interface.ts
│       │       ├── steam.adapter.ts
│       │       ├── retroachievements.adapter.ts
│       │       ├── psn.adapter.ts
│       │       └── xbox.adapter.ts  # 🚩 gateado hasta Fase 4
│       └── prisma/
│           ├── schema.prisma
│           └── migrations/
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
  - Contador diario en Redis (`steam:api:calls:<date>`): alerta al 80%, pausar syncs al 90%.
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
- Sincroniza usuarios con `lastSyncAt > 24h` y actividad reciente (login en últimos 7 días).
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
- **Formateo localizado**: `Intl.NumberFormat` e `Intl.DateTimeFormat` siempre.

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
- **Actualizar el backlog** al final de cada sesión marcando ítems completados con ✅.

### Estrategia de branching

- `main` — producción. Solo merges desde `develop` tras smoke tests.
- `develop` — integración. Base para todas las features.
- `feat/nombre-feature` — una rama por feature, sale de `develop`.
- `fix/descripcion` — hotfixes, pueden salir de `main` si es urgente.
- Merge siempre con `--no-ff` y PR revisada. CI debe pasar antes del merge.

---

## Entornos

### Local — emulador Android

```bash
cd apps/api && npm run mock   # Mock server en :3000
```

Cuenta de prueba: `demo@unlockhub.test` / `Demo1234!`

**Quirks (Expo SDK 55 / React Native 0.83.6):**
- URL del host desde el emulador: `http://10.0.2.2:3000`, no `localhost`.
- `adb reverse` no es fiable — preferir siempre `10.0.2.2`.
- `usesCleartextTraffic` sigue requiriendo `expo-build-properties` en `app.json`:

```json
"plugins": [["expo-build-properties", { "android": { "usesCleartextTraffic": true } }]]
```
- `kotlinVersion: "2.1.20"` en `expo-build-properties` — alinea con el compilador de RN 0.83.6. No usar "1.9.x" (downgrade que conflictúa con play-services-ads 25.x de AdMob v16+).
- `compileSdkVersion: 35` en `expo-build-properties` — seguro con SDK 55. En SDK 51 fallaba por `expo-modules-core`.
- `react-native-google-mobile-ads` en v16+ (antes gateado a v13.6.1 por Kotlin 2.2.0 metadata). Ahora compatible — RN 0.83.6 usa Kotlin 2.1.20.
- `react-native-reanimated` v4 requiere `react-native-worklets` como peer dep. Debe instalarse en `apps/mobile/` Y en el root del monorepo (para que el Babel plugin lo encuentre). Versión compatible: `worklets@0.7.x` para `reanimated@4.2.x`.
- Jest y `react-native-reanimated` v4: no usar `jest.requireActual('react-native-reanimated/mock')` — carga worklets nativo. Usar mock manual en `jest.setup.ts` (ya configurado). El moduleNameMapper redirige `react-native-worklets` a `__mocks__/react-native-worklets.js`.
- React 19: `jest.advanceTimersByTime()` que dispara actualizaciones de estado debe envolverse en `act()`.
- `@shopify/flash-list` v2: eliminado el prop `estimatedItemSize` — FlashList v2 lo calcula automáticamente.

### Producción — Railway

- **API**: https://unlockhub-production.up.railway.app
- **DB**: Railway PostgreSQL — `DATABASE_URL` (interna) + `DIRECT_URL` (proxy pública)
- **Redis**: Railway Redis — `REDIS_URL` (interna)
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
- **Tema**: Solo "Oscuro" activo — modo claro pendiente (todos los componentes usan `text-white` hardcoded)
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
| Guías UGC de logros (crear + ver) | ✅ Activo |
| Retar amigo en logro | ⚙️ Parcial |
| Compartir logro | ✅ Activo |

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
| Feed de actividad | ✅ Activo |
| Perfil público (sin email) | ✅ Activo |
| Comparación de perfiles ("vs tú") | ✅ Activo |

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
| Tema (solo oscuro activo) | ⚙️ Parcial |
| Estadísticas avanzadas premium | 🚩 Gateado |

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

## Roadmap

| Fase | Contenido | Estado |
|---|---|---|
| **Fase 1 — MVP** | Monorepo, auth, Steam + RA, logros, rankings, perfil, i18n, AdMob | ✅ Completa |
| **Fase 2 — Social** | Amigos, feed, retos, puntos, racha, push notifications, Wrapped, perfil público, búsqueda | ✅ Completa |
| **Fase 3 — Producción** | Railway, Sentry, GDPR, escudo de racha, notificaciones, Wrapped mensual, canje puntos, stats, guías UGC, dashboard admin, tests k6, Play Store, premium diferido a Fase 4 | 🔄 En progreso |
| **Fase 4 — Avanzado** | Torneos internos, App Store iOS, Xbox, OG profiles | 🔲 Futuro |

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

**Fecha**: 2026-06-04 (sesión 56) — T49/T50/T51 + upgrade Expo SDK 51→55. **T49 (bug crítico background-sync)**: `background-sync.scheduler.ts` línea 35 — `gte: oneDayAgo` → `lte: oneDayAgo`. La condición anterior sincronizaba usuarios que YA habían sincronizado recientemente en lugar de los que llevan más de 24h sin hacerlo — exactamente el comportamiento inverso al deseado. **T50 (tests auth soft-delete)**: `auth.routes.test.ts` — test 1: `POST /refresh` → 401 cuando tokens revocados por `deleteAccount`; test 2: `GET /me` → 401 `ACCOUNT_DELETED` cuando middleware `authenticate` detecta `deletedAt`. Mock de `prisma.user.findUnique` añadido al fichero. **T51 (tests race condition rewarded ad)**: `points.service.test.ts` — corregidos mocks existentes para reflejar implementación `SET NX` real (antes mockeaban `redis.get` en lugar de `redis.set`); nuevo test `Promise.allSettled` con 2 llamadas simultáneas → exactamente 1 fulfilled con `{ pointsEarned: 10 }`, 1 rejected con `REWARDED_AD_COOLDOWN` 429. **Expo SDK 51→55**: `expo` ~51→^55, `react-native` 0.74.5→0.83.6, `react` 18.2.0→19.2.0, `react-native-reanimated` 3→4 + `react-native-worklets` 0.7.4, `react-native-google-mobile-ads` v13→v16.3.3 (workaround Kotlin ya no necesario), `@shopify/flash-list` v1→v2 (`estimatedItemSize` eliminado en 7 usos), `kotlinVersion` 1.9.23→2.1.20, `compileSdkVersion` 34→35. `expo doctor` 19/19 ✅. Tests: 352/352 ✅.

**Fecha**: 2026-06-04 (sesión 55) — F20: ampliar placements AdMob. `AdBanner` type ampliado a `'home'|'search'|'rankings'|'friends'`; vars de entorno `EXPO_PUBLIC_ADMOB_RANKINGS_BANNER_ID` + `EXPO_PUBLIC_ADMOB_FRIENDS_BANNER_ID` con fallback a test ID. `<AdBanner unitId="rankings" />` en `RankingsScreen` entre filtros y lista; banner footer de `RankingList` reemplazado. `<AdBanner unitId="friends" />` en `FriendsScreen` después del selector de tabs. Nuevo `hooks/useWrappedInterstitial.ts`: cooldown 24h por AsyncStorage (`admob:wrapped_interstitial:last_shown`), delay 1.5s — llamado en `wrapped/[year].tsx`. Nuevo `hooks/useCompletedGamesInterstitial.ts`: AsyncStorage `admob:completed_game_ids` por gameId (max 500), solo dispara para IDs nunca vistos al 100% — llamado en `index.tsx` con la lista completa de juegos. `.env.example` actualizado con los 6 IDs separados. 0 errores TS/lint. **Pendiente acción dev**: crear 2 nuevos ad units Banner en AdMob Console y configurar como EAS secrets.

**Fecha**: 2026-06-03 (sesión 54) — Fase 4 inicio: backlog actualizado + 4 ítems inmediatos completados. **T55 (edge-to-edge Android 15)**: todos los tabs cambiados a `edges={['left', 'right']}` en SafeAreaView — el header de React Navigation gestiona top y el tab bar gestiona bottom; sin el fix, `targetSdkVersion=35` contaba el safe area inset del status bar dos veces. **T53 (crash sync largo)**: 4 fixes — `syncProgressKey` en `finally` de `sync.worker.ts`; guard `MAX_PAGES=10` en `fetchUserTitles` de `psn.adapter.ts`; claves stale RA con TTL 7 días en `retroachievements.adapter.ts`; throttle 15s en handler socket de `useSyncProgress.ts`. **T56 (fixes seguridad sesión 53)**: verificados y correctamente aplicados — xbox doble cifrado, `searchUsers` deletedAt, `deleteAccount` revocación RefreshTokens. **T52 (caché Redis metadatos juego)**: nuevo `game-cache.ts` — clave `game:meta:{platform}:{externalId}` TTL 24h; adapters PSN/RA/Steam comprueban caché antes de cada `game.upsert`; syncs repetidos no generan escrituras a PostgreSQL para juegos ya conocidos. 0 errores TS/lint en API y mobile.

**Fecha**: 2026-06-03 (sesión 53) — Auditoría de seguridad de datos en BD. Vulnerabilidades encontradas y corregidas: **CRÍTICA**: `xbox.adapter.ts` doble cifrado AES-256-GCM en `exchangeXboxCodeForTokens` — `linkPlatform` volvía a cifrar un token ya cifrado, causando que todos los syncs Xbox fallaran con "Token Xbox corrupto". Fix: devolver `tokenJson` sin cifrar (responsabilidad del cifrado delegada a `linkPlatform`). **MEDIA-1**: `search.service.ts` — `searchUsers` no filtraba `deletedAt: null` — usuarios soft-deleted aparecían en búsquedas durante 30 días. Fix: añadido `deletedAt: null` al `where`. **MEDIA-2**: `user.service.ts` — `deleteAccount` no revocaba `RefreshToken`s — usuario podía obtener nuevos access tokens tras borrar su cuenta. Fix: `refreshToken.updateMany({ revokedAt: new Date() })` añadido a la transacción atómica. Informacionales documentados (sin corrección): `passwordHash` cargado en memoria sin `select` explícito, `findUserByUsername` sin filtro `deletedAt` interno, placeholder `ENCRYPTION_KEY` en `.env.example` es hex válido. Ficheros modificados: `xbox.adapter.ts`, `platform.controller.ts`, `search.service.ts`, `user.service.ts`. 0 errores TS/lint.

Historial completo en [docs/SESSION_LOG.md](docs/SESSION_LOG.md)