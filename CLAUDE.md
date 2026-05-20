# CLAUDE.md — UnlockHub

Documento de contexto persistente para Claude Code. Léelo completo al inicio de cada sesión antes de escribir cualquier código.

---

## ⚠️ ACCIONES REQUERIDAS POR EL DESARROLLADOR

Esta sección lista todo lo que **el desarrollador debe hacer manualmente** antes de que Claude Code pueda implementarlo. Claude Code no puede registrarse en servicios externos, pagar cuentas ni obtener credenciales — eso lo hace el desarrollador y luego proporciona las keys.

### 🔴 Bloqueantes — sin esto la app no puede lanzarse

| # | Acción | Dónde | Coste | Para qué se usa |
|---|---|---|---|---|
| B3 | Crear cuenta en **Resend** y verificar dominio de envío | resend.com | Gratis hasta 3k emails/mes | Emails de recuperación de contraseña |
| B4 | Obtener `RESEND_API_KEY` y definir `RESEND_FROM_EMAIL` | resend.com → API Keys | Gratis | Variable de entorno en Railway |
| B5 | Verificar que **Railway PostgreSQL** tiene backups activados | Railway dashboard → servicio PostgreSQL → Settings → Backups | Según plan | Recuperación ante pérdida de datos |
| B6 | Verificar persistencia de **Railway Redis** | Railway dashboard → servicio Redis → Settings | Según plan | Evitar pérdida de rankings en reinicios |
| B7 | Crear cuenta de **Google Play Developer** | play.google.com/console | $25 pago único | Publicar en Play Store |
| B8 | Crear cuenta de **AdMob** y vincularla a la app | admob.google.com | Gratis | Anuncios para usuarios free |
| ~~B9~~ | ✅ **Ad unit IDs configurados como EAS secrets** | `EXPO_PUBLIC_ADMOB_HOME_BANNER_ID`, `SEARCH_BANNER_ID`, `INTERSTITIAL_ID`, `REWARDED_ID` — todos configurados | Gratis | ✅ Completado — IDs de producción inyectados en builds EAS. |
| ~~B10~~ | ✅ **UMP SDK integrado** | `hooks/useGdprConsent.ts` + `_layout.tsx` — UMP SDK activo, muestra formulario si `status === REQUIRED` | Gratis | ✅ Código integrado. UMP message ya publicado en AdMob dashboard. |
| B13 | Configurar `APP_SCHEME` como `unlockhub` en Railway | Railway dashboard → service → Variables → `APP_SCHEME=unlockhub` | Gratis | Deep links (reset-password, etc.) |
| B14 | Crear email de soporte `soporte@unlockhub.app` | Proveedor de dominio/email | ~1-5€/mes | Requerido por Google Play |
| ~~B15~~ | ✅ **Privacy Policy publicada** | `docs/privacy-policy.html` → https://jmreja27.github.io/UnlockHub/privacy-policy.html | Gratis | ✅ Completado — GitHub Pages activo (repo público, branch `develop`, carpeta `/docs`). Datos del desarrollador rellenados. |
| ~~B16~~ | ✅ **Términos y Condiciones publicados** | `docs/terms-of-service.html` → https://jmreja27.github.io/UnlockHub/terms-of-service.html | Gratis | ✅ Completado — igual que B15. |
| B17 | ✅ **Migración Prisma en producción** | Automática en cada deploy — `npx prisma migrate deploy` configurado en `startCommand` de `railway.json` | Gratis | Aplicar todos los modelos nuevos en prod |

> **Estado de acciones completadas ✅**
> - B1-B2 (Sentry): ✅ DSNs configurados en Railway y EAS
> - B9 (Ad unit IDs): ✅ 4 EAS secrets configurados — `EXPO_PUBLIC_ADMOB_HOME_BANNER_ID`, `SEARCH_BANNER_ID`, `INTERSTITIAL_ID`, `REWARDED_ID`.
> - B10 (UMP SDK): ✅ `useGdprConsent.ts` activo, GDPR message publicado en AdMob dashboard. Plugin `react-native-google-mobile-ads` en `app.json`.
> - B11-B12 (Cloudinary): ✅ Cuenta creada — `CLOUDINARY_URL` pendiente de configurar en Railway variables
> - B15 (Privacy Policy): ✅ `docs/privacy-policy.html` — URL: https://jmreja27.github.io/UnlockHub/privacy-policy.html — GitHub Pages activo, repo público, datos del desarrollador rellenados. Auto-deploy en cada push a `develop` que toque `docs/`.
> - B16 (ToS): ✅ `docs/terms-of-service.html` — URL: https://jmreja27.github.io/UnlockHub/terms-of-service.html — igual que B15.
> - B17 (Migraciones Prisma): ✅ Automáticas en cada deploy — `startCommand` en `railway.json`
> - STEAM_API_KEY: ✅ Configurada en Railway
> - N1 (UptimeRobot): ⚙️ Actualizar URL del monitor a https://unlockhub-production.up.railway.app

### 🟡 Necesarios antes del lanzamiento

| # | Acción | Dónde | Coste | Para qué se usa |
|---|---|---|---|---|
| N2 | Conectar **Logtail** a Railway | logtail.com → Create Source → Railway → configurar `LOGTAIL_SOURCE_TOKEN` en variables | Gratis (7 días retención) | Logs estructurados y persistentes — pino ya genera JSON |
| N3 | Escalar Railway a **mínimo 2 réplicas** en producción | Railway dashboard → service → Settings → Replicas → 2 | ~5€/mes adicional | Alta disponibilidad — redis-adapter ya configurado |
| N4 | Crear cuenta en **PostHog** y obtener Project API Key | posthog.com → Create Project → copia API Key | Gratis hasta 1M eventos/mes | Analíticas — `lib/analytics.ts` ya preparado, solo necesita la key |
| N5 | Guardar copia de seguridad del **keystore Android** de EAS | expo.dev → proyecto → Credentials → descargarlo | Gratis | Sin keystore no se pueden publicar actualizaciones |

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
| Resend | Email transaccional — requiere `RESEND_API_KEY` (acción B3) |
| pino | Logger estructurado en JSON — nunca console.log en producción |

### Infraestructura

| Servicio | Uso | Estado |
|---|---|---|
| PostgreSQL (Railway) | Base de datos principal | ✅ Activo — backups pendiente verificar (B5) — migración de datos Neon pendiente |
| Redis (Railway) | Rankings + caché + BullMQ | ✅ Activo — persistencia gestionada por Railway (B6) |
| Cloudinary | Avatares y banners | ✅ Cuenta creada — `CLOUDINARY_URL` pendiente en Railway variables |
| Railway | Deploy API | ✅ Activo — https://unlockhub-production.up.railway.app |
| AdMob | Anuncios usuarios free | ⚙️ Pendiente cuenta AdMob (B8) — IDs producción ✅ (B9) — código integrado (B10 ✅) |
| GitHub Actions | CI/CD | ✅ Configurado |
| Sentry | Crash reporting móvil + API | ✅ DSNs configurados — código integrado |
| UptimeRobot | Alertas de disponibilidad | ✅ Activo |
| Logtail | Logs estructurados persistentes | ⚙️ Pendiente (N2) — pino ya activo |
| PostHog | Analíticas de producto | ⚙️ Pendiente (N4) — analytics.ts ya preparado |

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
  premium: false,        // Activar cuando Google Play Billing esté integrado (B7)
  wrapped: true,         // ✅ ACTIVO
  pointsRedeem: true,    // ✅ ACTIVO
  advancedStats: true,   // ✅ ACTIVO
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
  encryptedToken    String    // AES-256, nunca texto plano
  lastSyncedAt      DateTime?
  syncCooldownUntil DateTime?
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
  id        String           @id @default(cuid())
  userId    String
  friendId  String
  status    FriendshipStatus
  createdAt DateTime         @default(now())
}

enum FriendshipStatus { PENDING ACCEPTED BLOCKED }

model ActivityEvent {
  id        String   @id @default(cuid())
  userId    String
  type      String
  payload   Json
  createdAt DateTime @default(now())
}

model WeeklyChallenge {
  id           String    @id @default(cuid())
  title        String
  description  String
  targetValue  Int
  metric       String
  pointsReward Int
  startAt      DateTime
  endAt        DateTime
  platform     Platform?
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

enum SubscriptionPlan { MONTHLY ANNUAL POINTS_REDEEM }
enum StoreProvider { GOOGLE_PLAY APP_STORE INTERNAL }

// ✅ En schema — migración pendiente en producción (B17)
model Notification {
  id        String   @id @default(cuid())
  userId    String
  type      String   // FRIEND_REQUEST | ACHIEVEMENT_CHALLENGE | RANKING_UP | CHALLENGE_COMPLETED | STREAK_RISK
  title     String
  body      String
  read      Boolean  @default(false)
  createdAt DateTime @default(now())
}

// ✅ En schema — migración pendiente en producción (B17)
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

// ✅ En schema — migración pendiente en producción (B17)
model PasswordResetToken {
  id        String    @id @default(cuid())
  userId    String
  token     String    @unique
  expiresAt DateTime
  usedAt    DateTime?
  createdAt DateTime  @default(now())
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
- `getSystemPsnAuth()`: intercambia `PSN_SYSTEM_NPSSO` → Access Token, cacheado en Redis TTL 55 min (`psn:system:access_token`). Lanza `PSN_SYSTEM_NOT_CONFIGURED` (503) si la var no está, `PSN_SYSTEM_NPSSO_EXPIRED` (503) si el NPSSO ha expirado (~60 días).
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

El servidor valida todas al arrancar mediante schema Zod. Ver `.env.example` en el repo.

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
| `CLOUDINARY_URL` | Subida de avatares/banners | staging, prod | ⚙️ Pendiente en Railway variables — desbloquea F8 |
| `RESEND_API_KEY` | Emails transaccionales | staging, prod | ⚙️ Pendiente acción B3 |
| `RESEND_FROM_EMAIL` | Remitente de emails | staging, prod | ⚙️ Pendiente acción B3 |
| `APP_SCHEME` | Deep links (`unlockhub://`) | local, staging, prod | ⚙️ Pendiente acción B13 — Railway dashboard → Variables |
| `EXPO_PUBLIC_ADMOB_HOME_BANNER_ID` | Banner Home (EAS secret) | prod | ✅ Configurado como EAS secret (B9) |
| `EXPO_PUBLIC_ADMOB_SEARCH_BANNER_ID` | Banner Search (EAS secret) | prod | ✅ Configurado como EAS secret (B9) |
| `EXPO_PUBLIC_ADMOB_INTERSTITIAL_ID` | Interstitial (EAS secret) | prod | ✅ Configurado como EAS secret (B9) |
| `EXPO_PUBLIC_ADMOB_REWARDED_ID` | Rewarded (EAS secret) | prod | ✅ Configurado como EAS secret (B9) |
| `POSTHOG_API_KEY` | Analíticas | staging, prod | ⚙️ Pendiente acción N4 |
| `ADMIN_SECRET` | Acceso al dashboard admin (bearer) | prod | ⚙️ Generar con `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `PSN_SYSTEM_NPSSO` | Sync PSN de usuarios (credencial del sistema) | prod | ⚙️ Obtener en my.playstation.com → F12 → Application → Cookies → `npsso`. Caduca ~60 días. Configurar en Railway dashboard → Variables. **Nunca en código ni `.env` commiteado.** |

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

**Quirks críticos (Expo SDK 51):**
- URL del host desde el emulador: `http://10.0.2.2:3000`, no `localhost`.
- `adb reverse` no es fiable — preferir siempre `10.0.2.2`.
- `usesCleartextTraffic` debe ir en `app.json > plugins` mediante `expo-build-properties`:

```json
"plugins": [["expo-build-properties", { "android": { "usesCleartextTraffic": true } }]]
```

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

### Tabs principales — todas ✅

| Tab | Ruta |
|---|---|
| Home (Biblioteca) | `app/(tabs)/index.tsx` |
| Search | `app/(tabs)/search.tsx` |
| Rankings | `app/(tabs)/rankings.tsx` |
| Friends | `app/(tabs)/friends.tsx` |
| Challenges | `app/(tabs)/challenges.tsx` |
| Profile | `app/(tabs)/profile.tsx` |

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
| `app/link-platform/steam.tsx` | ✅ | Con ayuda contextual paso a paso |
| `app/link-platform/ra.tsx` | ✅ | Con ayuda contextual paso a paso |
| `app/link-platform/psn.tsx` | ✅ | Formulario de username — el backend usa `PSN_SYSTEM_NPSSO`; no se almacena token de usuario. Guía expandible para hacer perfil público. |
| `app/link-platform/xbox.tsx` | 🚩 Gateado | Banner "Próximamente" hasta Fase 4 |
| `app/notifications.tsx` | ✅ | Centro de notificaciones in-app |
| `app/privacy.tsx` | ✅ | URL pública activa: https://jmreja27.github.io/UnlockHub/privacy-policy.html |
| `app/premium.tsx` | 🚩 Gateado | `FEATURES.premium = false` — espera B7 |
| `app/wrapped/[year].tsx` | ✅ | Soporta period mensual ("2025-01") y anual ("2025") |

### Preferencias de usuario

- **Idioma**: ES / EN — cambiable desde Profile → Ajustes
- **Tema**: Solo "Oscuro" activo — modo claro pendiente (todos los componentes usan `text-white` hardcoded)
- **Onboarding**: `preferencesStore.onboardingCompleted`

---

## Decisiones tomadas — no revertir sin consultar

| Decisión | Motivo | Fase |
|---|---|---|
| Railway en lugar de Fly.io | Integración nativa PostgreSQL + Redis, sin hibernación, deploy más simple | Fase 3 |
| Railway PostgreSQL en lugar de Neon | Migración desde Neon — Railway integra BD+Redis+deploy en el mismo panel | Fase 3 |
| Xbox gateado hasta Fase 4 | OAuth2 Microsoft requiere verificación de empresa | Fase 3 |
| Modo claro eliminado temporalmente | Componentes con `text-white` hardcoded — activar a medias sería peor | Fase 3 |
| `expo-build-properties` para `usesCleartextTraffic` | Config directa en `app.json > android` no funciona en SDK 51 | Fase 3 |
| `psn-api` (npm) para PSN | No existe API oficial de Sony | Fase 3 |
| Saldo de puntos como suma del historial | Auditoría completa de puntos | Fase 2 |
| Compartir logro → `Share.share()` con URL | Imagen generada viola ToS de Steam/RA | Fase 3 |
| Canje de puntos → días premium (no cosméticos) | Cosméticos contradicen el modelo de avatares libres | Fase 3 |
| Sync lazy + scheduler nocturno | Cron masivo en horario pico agota rate limit de Steam | Fase 3 |
| Torneos solo internos en fase inicial | Evita problemas legales Ley 13/2011 | Fase 4 |
| Wrapped mensual + anual | Wrapped solo anual = 11 meses sin verlo para usuarios nuevos | Fase 3 |
| PostHog en lugar de Mixpanel | Open source, self-hosteable, mejor privacidad | Fase 3 |
| `wrapped/[year].tsx` no renombrado a `[period].tsx` | Expo Router no permite dos archivos de ruta dinámica en el mismo directorio — el param se llama `year` pero acepta strings como `"2025-01"` | Fase 3 |
| `requirePremium` solo comprueba `isPremium` del JWT | El payload JWT contiene `{sub, email, isPremium}` sin `role` — añadirlo requeriría rotar todas las sesiones | Fase 3 |
| Rutas `/admin/*` protegidas por `ADMIN_SECRET` bearer (no por role JWT) | `role` no está en el JWT payload — ver decisión anterior | Fase 3 |
| `rotate-encryption-key.ts` debe ejecutarse desde `apps/api/` | `@prisma/client` solo está en `apps/api/node_modules` | Fase 3 |
| `while(true)` con eslint-disable en cursor pagination | Patrón cursor batch necesita bucle infinito con break interno — regla `no-constant-condition` se desactiva línea por línea | Fase 3 |
| `useSessionStore as unknown as jest.Mock` en tests móvil | TypeScript no acepta la conversión directa porque los tipos no se solapan — doble aserción vía `unknown` es el patrón estándar | Fase 3 |
| `apps/mobile` lint script usa `../../.gitignore` | El script usaba `--ignore-path .gitignore` pero `apps/mobile/.gitignore` no existe; la raíz del monorepo tiene el `.gitignore` correcto | Fase 3 |
| `no-var-requires` en `require()` de tests Jest | Patrón legítimo para acceder a módulos mockeados tras `jest.mock()` — se suprime con eslint-disable-next-line | Fase 3 |
| Cloudinary auto-lee `CLOUDINARY_URL` de `process.env` | SDK de Cloudinary v2 no necesita configuración explícita si `CLOUDINARY_URL` está en el entorno — basta con `import { v2 as cloudinary }` | Fase 3 |
| Upgrade Expo SDK 51 → 55 diferido post-lanzamiento | 17 high vulnerabilidades en `node-tar` son build-time (no runtime); `expo@55.0.24` es breaking change; riesgo/beneficio favorable a diferirlo hasta después del primer deploy a Play Store | Fase 3 |
| `jest.mock('../../lib/featureFlags')` en tests que necesitan features gateadas | Algunos tests de pantallas prueban UI que `FEATURES.premium = false` oculta en producción — necesario mockear la flag en el test para ejercitar el código | Fase 3 |
| `import/order` override en `.eslintrc.js` para ficheros de test | El patrón `jest.mock()` hoisted (antes de imports) es intencional; la regla `import/order` genera falsos positivos — se desactiva solo en `**/__tests__/**` y `*.test.ts` | Fase 3 |
| Maestro flows usan `runFlow/when` condicional en lugar de login fijo | APK preview conecta a API producción (`eas.json` profile `preview` → `https://unlockhub-production.up.railway.app`); `demo@unlockhub.test` solo existe en mock — los flows deben adaptarse a sesión activa o sin sesión | Fase 3 |
| Regex `~.*(A\|B).*` con alternación evitada en flows Maestro | Maestro 2.5.1 no evalúa correctamente el operador `\|` dentro de grupos regex — sustituir siempre por texto exacto o regex simple sin alternación | Fase 3 |
| `testID="login-email/password"` añadido a login.tsx | `inputText: {label}` en Maestro encuentra el `Text` label component antes que el `TextInput` cuando ambos tienen el mismo texto accesible — `testID` como selector unívoco (activo en próximo build) | Fase 3 |
| `authenticateOptional` en lugar de `authenticate` en endpoints públicos con contexto de usuario | Endpoints de logros y búsqueda deben funcionar sin sesión (isUnlocked=false) — devolver 401 sin token sería incorrecto y rompería la UX de discovery | Fase 3 |
| `{ skipRefresh: true }` en `api.post()` de login y register | Sin esta opción, cuando `/auth/login` devuelve 401 (contraseña incorrecta), `apiRequest` intercepta el 401 e intenta llamar a `refreshAccessToken()`. Si no hay refresh token en SecureStore (sesión cerrada correctamente), lanza un `Error` plano que `humanizeAuthError` no clasifica como 401 → mensaje genérico en lugar de "Email o contraseña incorrectos" | Fase 3 |
| `Guide` interface usa `user` no `author` en `game/[id].tsx` | La API de guías devuelve `user: { id, username, avatar }` (relación Prisma `userId`) — el campo nunca fue `author`. La interfaz local en el cliente debe coincidir con la respuesta real del servidor para evitar crash al leer `guide.author.username` | Fase 3 |
| Search de logros excluye Xbox con `NOT: { platform: 'XBOX' }` en Prisma | Xbox gateado hasta Fase 4 — no exponer logros Xbox aunque estuvieran en BD | Fase 3 |
| `getGameAchievementsWithStatus` usa dos queries separadas (achievements + userAchievements) | Evita un JOIN complejo; Map<achievementId, unlockedAt> para lookup O(1) es más claro y suficientemente rápido a escala de logros por juego | Fase 3 |
| i18n key `search.achievement_in_game` en tests devuelve la clave sin interpolar | En entorno de test, i18next devuelve la clave (no el texto interpolado) — tests usan `getByText('search.achievement_in_game')` en lugar de buscar el nombre del juego | Fase 3 |
| Search de logros paginado con `page` param (no cursor) | La UX de búsqueda es exploratoria, no un feed continuo — paginación offset simple suficiente; `useInfiniteQuery` gestiona la acumulación de páginas en el cliente | Fase 3 |
| `getTitleTrophies` PSN puede devolver `trophies` undefined | Algunos títulos (DLC, juegos sin soporte de trofeos) devuelven respuesta vacía — el script `seed-games.ts` necesita guard `trophies?.length ?? 0` antes de iterar | Fase 3 |
| Token de acceso PSN expira ~60 min en seed con muchos títulos | El NPSSO se intercambia por un access token de corta duración; procesar 372 títulos secuencialmente lo agota — en futuras ejecuciones hay que refrescar el token entre usuarios | Fase 3 |
| Constraints únicos en `Game(platform, externalId)` y `Achievement(platform, gameId, externalId)` — la BD rechaza duplicados a nivel de constraint | El constraint anterior en Achievement era `(platform, externalId)`, incorrecto para Steam donde el `apiname` (ej. `"ACH_WIN"`) no es globalmente único — el mismo nombre puede repetirse en múltiples juegos. El nuevo constraint `(platform, gameId, externalId)` es la semántica correcta | Fase 3 |
| DLCs de PSN se tratan como juegos independientes en el seed | La API de Sony devuelve cada DLC/expansión como un `npCommunicationId` separado con su propio trophy set — es el estándar del sector y lo que la API impone; no vale la pena intentar agruparlos | Fase 3 |
| Token PSN se refresca cada 5 usuarios en `seed-games.ts` | El access token derivado del NPSSO expira en ~60 min; procesar 372 títulos por usuario agota el token. `refreshPsnAuth()` se llama cada 5 usuarios (índice % 5 === 0) para mantener el token fresco sin requerir un nuevo NPSSO | Fase 3 |
| `steam.adapter.ts` `syncUser()` omite juegos sin logros antes del upsert | Sin el guard `if (schema.length === 0) continue` antes del `game.upsert`, se insertaban filas de juegos vacías (0 logros) para todos los juegos del usuario sin `has_community_visible_stats`. Esto causó 30.066 juegos vacíos en la BD. El guard evita la inserción | Fase 3 |
| `Game.console` almacena la consola/plataforma de origen | PSN devuelve `trophyTitlePlatform` ("PS3"/"PS4"/"PS5"/"PSVITA", o compuesto "PS3,PS4" en cross-gen), RA devuelve `ConsoleName` por API y el seed usa el mapa `RA_CONSOLE_NAMES`; Steam y Xbox guardan `null` (plataforma única) | Fase 3 |
| `console` se muestra en GameCard (subtítulo) y game/[id].tsx (header) | Los usuarios con librerías mixtas de PSN necesitan ver si un juego es de PS3/PS4/PS5; RA muestra NES/SNES/etc. Steam y Xbox no muestran nada (null) | Fase 3 |
| Backfill RA via `API_GetGameList.php` (1 llamada/consola, no 1/juego) | Actualizar 1.001 juegos RA con 1.001 llamadas habría agotado el rate limit y tardado 17 min; con 8 consolas son 8 llamadas y ~5 seg. | Fase 3 |
| `backfill-psn-console.ts` usa solo `getUserTitles()`, no `getTitleTrophies()` | Objetivo era solo rellenar `Game.console` — no hace falta re-descargar logros (horas) cuando con los títulos (1 llamada paginada por usuario) se obtiene `trophyTitlePlatform` en segundos | Fase 3 |
| `Game.console` en PSN puede ser valor compuesto como `"PS3,PS4"` | Sony devuelve `trophyTitlePlatform` como string concatenado para juegos cross-gen (ej. "PS3,PS4", "PS3,PSVITA,PS4") — se almacena y muestra tal cual, sin normalizar | Fase 3 |
| `PsnStoredTokens` almacena Access Token + Refresh Token + `expiresAt` + `refreshTokenExpiresAt` cifrado en AES-256 en `PlatformAccount.encryptedToken` | Ambos tokens necesarios para renovar automáticamente sin pedir al usuario — el campo es un JSON cifrado, no un token simple | Fase 3 |
| `buildAuthWithRefresh()` en PSN adapter renueva el Access Token en cada sync | Si `expiresAt < now`: usa Refresh Token → guarda nuevo JSON cifrado en BD. Si `refreshTokenExpiresAt < now`: lanza `PSN_REFRESH_TOKEN_EXPIRED` | Fase 3 |
| `PSN_REFRESH_TOKEN_EXPIRED` en sync worker → `requiresReauth=true` + notificación in-app | En lugar de silenciar el error, se marca la cuenta y se notifica al usuario para que re-vincule su PSN | Fase 3 |
| `PlatformAccount.requiresReauth` reseteado a `false` en sync exitoso y al re-vincular | Un sync exitoso o una nueva vinculación limpia el flag — no necesita acción manual del dev | Fase 3 |
| Guard `trophies.length === 0` en PSN `syncUser()` antes del game upsert | Títulos sin trofeos (DLC sin soporte, demos) no deben insertarse — el `definedTrophies` puede ser 0 aunque el título aparezca en la lista | Fase 3 |
| Guard de achievements movido ANTES del game upsert en RA `syncUser()` | Antes: `prisma.game.upsert` en línea 336, check `if (!gameProgress.Achievements)` en línea 361 — juego sin logros se insertaba. Ahora: comprobación antes del upsert | Fase 3 |
| Guard `playerAchievements.length === 0` añadido en Steam `syncUser()` | `GetPlayerAchievements` puede devolver `success: false` (perfil privado, juego sin stats para el usuario) dejando el schema como referencia — sin este guard se insertaban juegos sin Achievement records. Causó 3.333 juegos vacíos en prod (eliminados 2026-05-22) | Fase 3 |
| Sync progresivo por lotes: STEAM=20, RA=15, PSN=10 juegos/batch | Adapters implementan `syncUserBatched(account, onBatch)` opcional — worker llama `onBatch` tras cada lote, emite `sync:progress` a Socket.io y actualiza Redis TTL 2h. Fallback a `syncUser()` si el adapter no implementa batching | Fase 3 |
| `syncUserExpress` al vincular plataforma: Steam sort by playtime_forever desc (top 20), PSN first 10 (ya ordenado por actividad), RA sort by NumAwarded desc (top 15) | La biblioteca aparece poblada antes de que responda el 201 — full sync se encola en background. Timeout 25s con `Promise.race` para no bloquear indefinidamente | Fase 3 |
| Socket.io namespace raíz `/` con JWT middleware en `sync.handler.ts` | El mismo namespace que `activity.handler.ts` — los usuarios se unen a `user:{userId}` rooms. `getIOSafe()` en el worker devuelve null en tests (getIO lanza si no está inicializado) | Fase 3 |
| Redis `sync:progress:{userId}:{platform}` TTL 2h como fallback de Socket.io | `getSyncStatus` lee esta clave para exponer `isRunning/processed/total/percentComplete/startedAt` — útil si el cliente pierde la conexión Socket.io durante el sync | Fase 3 |
| `useSyncProgress` hook en mobile: invalida `my-games` en cada batch | La lista se actualiza progresivamente conforme llegan los lotes — sin esperar al `sync:complete`. El toast de completado muestra `+N logros · +X XP` y se auto-descarta a los 4s | Fase 3 |
| `useSyncAll` es fire-and-forget: invalidación de `my-games` delegada a `useSyncProgress` | Antes: `queryClient.invalidateQueries` en `onSuccess` (solo invalidaba al terminar el request HTTP ~instant). Ahora: la invalidación ocurre en cada batch vía Socket.io — la UI se actualiza progresivamente | Fase 3 |
| GitHub Pages para docs legales en repo público | Cloudflare Pages rechazado (ran npm ci sobre el monorepo root). GitHub Pages free solo funciona en repos públicos — repo UnlockHub hecho público. Auto-deploy desde branch `develop`, carpeta `/docs`. URLs: https://jmreja27.github.io/UnlockHub/privacy-policy.html y /terms-of-service.html | Fase 3 |
| Texto legal ToS + Privacy Policy en pantalla de registro | `app/(auth)/register.tsx`: bloque con `Linking.openURL` a las URLs de GitHub Pages antes del botón de submit. Claves i18n `auth.register.legal_prefix/connector/terms_label/privacy_label` en ES/EN. | Fase 3 |
| `AdBanner` con prop `unitId: 'home' | 'search'` — IDs de ad unit separados por placement | Permite optimización futura de eCPM por placement sin cambiar la API del componente | Fase 3 |
| IDs de producción AdMob como EAS secrets (`EXPO_PUBLIC_ADMOB_*`) — no en `app.json` ni código | Repo público — hardcodear IDs de producción en el código fuente expondría las unidades de anuncio. Test IDs de Google integrados como fallback en el código | Fase 3 |
| `useRewardedAd` solo llama al backend si recibe `EARNED_REWARD` antes de `CLOSED` | Garantiza que el usuario no saltó el anuncio antes de reclamar puntos — el evento `EARNED_REWARD` solo se dispara cuando el anuncio se completa | Fase 3 |
| Cooldown rewarded ad en Redis (`rewarded-ad:{userId}`, TTL 3h) en lugar de BD | Evitar abuso es un caso de rate limiting — Redis es el lugar correcto; no necesita historial persistente | Fase 3 |
| PSN usa credenciales del sistema (`PSN_SYSTEM_NPSSO`) en lugar de tokens de usuario | Mismo modelo que PSNProfiles/TrueTrophies/Exophase. El usuario solo proporciona su username público; el backend autentica con su propio NPSSO. Elimina el flujo NPSSO del usuario, el cifrado AES de token y el refresco automático para PSN. | Fase 3 |
| `PlatformAccount.encryptedToken` queda `''` para cuentas PSN nuevas | El campo es `String @default("")` — no se almacena ningún token de usuario PSN. `buildAuthWithRefresh()` sigue activo para `seed-games.ts`. Sin migración necesaria: Steam y RA siguen usando el campo. | Fase 3 |
| `getSystemPsnAuth()` en Redis clave `psn:system:access_token` TTL 55 min | Los access tokens PSN expiran en 60 min; caché 55 min garantiza margen. Si el NPSSO expira (~60 días), la función lanza `PSN_SYSTEM_NPSSO_EXPIRED` (503) — el desarrollador debe renovar el NPSSO en Railway Variables. | Fase 3 |

---

## Roadmap

| Fase | Contenido | Estado |
|---|---|---|
| **Fase 1 — MVP** | Monorepo, auth, Steam + RA, logros, rankings, perfil, i18n, AdMob | ✅ Completa |
| **Fase 2 — Social** | Amigos, feed, retos, puntos, racha, push notifications, Wrapped, perfil público, búsqueda | ✅ Completa |
| **Fase 3 — Producción** | Railway, Sentry, GDPR, escudo de racha, notificaciones, Wrapped mensual, canje puntos, stats, guías UGC, dashboard admin, tests k6, Play Store | 🔄 En progreso |
| **Fase 4 — Avanzado** | Torneos internos, App Store iOS, Xbox, OG profiles | 🔲 Futuro |

> **Aviso legal Fase 4**: Torneos con recompensas económicas pueden clasificarse como juegos de azar en España (Ley 13/2011). Solo recompensas en puntos/días premium hasta consultar con abogado.

---

## Orden de desarrollo — Fase 3 (en progreso)

> ✅ = implementado | ⚙️ = acción manual del desarrollador

1. ✅ Redis AOF + Socket.io redis-adapter
2. ✅ Sentry — SDKs instalados y DSNs configurados
3. ✅ Pino — logger JSON activo. ⚙️ Conectar Logtail (N2)
4. ✅ UptimeRobot — monitor activo
5. ✅ Health check endpoint completo
6. ✅ Dashboard de administración
7. ✅ GDPR — borrado de cuenta. ⚙️ Migrar en prod (B17)
8. ✅ AdMob + UMP SDK integrado — `react-native-google-mobile-ads` instalado, plugin en `app.json` (test App ID), `AdBanner` actualizado (`unitId: 'home'|'search'`), `useInterstitialAd` + `useRewardedAd` hooks, endpoint `POST /api/v1/points/rewarded-ad` (10 pts, cooldown 3h Redis), `REWARDED_AD` en `PointReason`. ⚙️ Pendiente B8-B9: IDs de producción como EAS secrets.
9. ✅ Privacy policy en app. ✅ Privacy Policy + ToS publicados en GitHub Pages. ✅ Datos del desarrollador rellenados. ✅ Texto legal con enlaces en pantalla de registro.
10. ✅ Escudo de racha
11. ✅ Centro de notificaciones in-app
12. ⚙️ Variables pendientes en Railway dashboard → Variables: `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `APP_SCHEME`, `CLOUDINARY_URL`, `ADMIN_SECRET`, `POSTHOG_API_KEY`
13. ⚙️ Google Play Billing — activar cuando Play Console esté listo (B7)
14. ✅ Analíticas — analytics.ts preparado. ⚙️ POSTHOG_API_KEY (N4)
15. ✅ Ayuda contextual en vinculación de plataformas
16. ✅ Wrapped mensual + anual
17. ✅ Canje de puntos por premium
18. ✅ Estadísticas avanzadas premium
19. ✅ Guías UGC
20. ✅ Tests de carga k6
21. ⚙️ EAS Build producción (N5) — NO lanzar sin pedirlo explícitamente
22. ⚙️ Smoke tests de producción
23. ⚙️ Play Store submit (B7)

---

## Backlog priorizado

> Actualizar al final de cada sesión marcando ítems completados con ✅.

### 🔴 Bloqueantes — requieren acción del desarrollador

| # | Tarea | Detalle |
|---|---|---|
| P1 | ✅ Migración Prisma en prod | Automática en cada deploy — `npx prisma migrate deploy` en `startCommand` de `railway.json` |
| P2 | Variables pendientes en Railway | Railway dashboard → service → Variables → añadir: `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `APP_SCHEME=unlockhub`, `CLOUDINARY_URL`, `ADMIN_SECRET`, `POSTHOG_API_KEY` |
| P3 | Resend — cuenta + dominio + API key | resend.com → Add Domain → verificar DNS → API Keys → Create |
| ~~P4~~ | ✅ UMP SDK AdMob | Código integrado — `useGdprConsent.ts` activo, GDPR message ya publicado en AdMob. |
| ~~P4b~~ | ✅ EAS secrets AdMob configurados | Los 4 IDs de producción están en EAS secrets — `HOME_BANNER_ID`, `SEARCH_BANNER_ID`, `INTERSTITIAL_ID`, `REWARDED_ID`. |
| P5 | ✅ Privacy Policy + ToS en URL pública | `docs/privacy-policy.html` + `docs/terms-of-service.html` — GitHub Pages activo, URLs en vivo, datos del desarrollador rellenados. |
| P6 | Google Play Console | $25 + listing completo |
| P7 | ✅ Smoke tests producción — APK #2 completo | APK `27d0e02d` (build 2026-05-27). BUG-3/4/5 confirmados ✅. Todas las pantallas sin crash. Pendiente: vinculación plataformas reales (requiere credenciales del dev), sync progresivo E2E, Forgot Password (requiere RESEND_API_KEY). |

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
| T8 | Subir Expo a v55 para vulnerabilidades node-tar | 🔲 17 high mobile (build-time vía Expo) + 2 high API (bcrypt build-time) — ninguna runtime; PR dedicado post-lanzamiento |
| T9 | Resolver 145 warnings import/order en API | ✅ Resuelto — `eslint --fix` + override en `.eslintrc.js` para ficheros de test |
| T10 | Flows Maestro E2E | ✅ 5 flows en `apps/mobile/.maestro/` — todos pasando contra emulador Android con APK preview |
| T11 | Search de logros + endpoint logros de juego | ✅ Backend `GET /api/v1/games/:id/achievements` + `GET /api/v1/search?type=achievements` — JWT opcional, Xbox excluido, paginado 20/pág |
| T12 | Job "seed de logros populares" | ✅ Completo — BD post-limpieza: 1.406 juegos (78 Steam + 1.001 RA + 327 PSN) + 72.264 logros. Bugs PSN corregidos: guard `trophies ?? []` + refresco token cada 5 usuarios. Campo `console` backfilled: RA (1.001 juegos) + PSN (584 juegos). |

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
| F8 | Avatar upload | ✅ Backend Cloudinary + mobile expo-image-picker — activo en prod cuando `CLOUDINARY_URL` esté en Railway (P2) |
| F9 | Dashboard admin | ✅ |
| F10 | OG profiles | 🔲 Fase 4 |
| F11 | Búsqueda de logros con filtro de plataforma | ✅ Search tab: chip Achievements + sub-filtro Steam/RA/PSN, infinite scroll, estado locked/unlocked |

---

## Última revisión de código

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

#### BD Railway post-seed Adramm (2026-05-29)
- Seed parcial: Adramm procesó 345/948 títulos antes de que el NPSSO expirara.
- **Totales observados**: 2.180 juegos (99 Steam + 1.001 RA + 1.080 PSN) + 105.925 logros.
- **19 juegos vacíos** detectados (PSN, del seed parcial donde el token expiró a mitad de un batch). Pendiente limpieza: `railway run npx tsx apps/api/check-counts.ts` → confirmar, luego `deleteMany({ where: { achievements: { none: {} } } })`.
- kikecorrales10 falló con "Expired access token" — necesita nuevo NPSSO del desarrollador para re-seed.

#### Acciones pendientes para el desarrollador
1. **`railway login`** — sesión expirada en local.
2. Limpiar 19 juegos PSN vacíos: `cd apps/api && railway run npx tsx -e "if(process.env.DIRECT_URL)process.env.DATABASE_URL=process.env.DIRECT_URL;const{PrismaClient}=require('@prisma/client');const p=new PrismaClient();p.game.deleteMany({where:{achievements:{none:{}}}}).then(r=>console.log('Eliminados:',r.count)).finally(()=>p.$disconnect())"`.
3. **`PSN_SYSTEM_NPSSO`** — configurar en Railway dashboard → Variables con el NPSSO obtenido en my.playstation.com → F12 → Application → Cookies → `npsso`. **Sin esto, el sync PSN de usuarios no funcionará en producción.**
4. Re-seed kikecorrales10: `cd apps/api && railway run -e PSN_NPSSO=<nuevo-npsso> -- npx tsx ../../scripts/seed-games.ts --only-psn --usernames="kikecorrales10"`.
5. Backfill `console` en nuevos juegos PSN de Adramm: `cd apps/api && railway run -e PSN_NPSSO=<nuevo-npsso> -- npx tsx ../../scripts/backfill-psn-console.ts --usernames="Adramm"`.
6. Eliminar `apps/api/check-counts.ts` una vez completada la verificación.

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