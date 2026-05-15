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
| B9 | Obtener `ADMOB_APP_ID` y los ad unit IDs de producción | AdMob → Apps → Unidades de anuncio | Gratis | Reemplazar IDs de test en la app |
| B10 | Configurar **User Messaging Platform (UMP) SDK** de Google | admob.google.com → Privacy & Messaging → Create Message → GDPR | Gratis | Consentimiento GDPR para AdMob en Europa — sin esto AdMob puede suspender la cuenta |
| B13 | Configurar `APP_SCHEME` como `unlockhub` en Railway | Railway dashboard → service → Variables → `APP_SCHEME=unlockhub` | Gratis | Deep links (reset-password, etc.) |
| B14 | Crear email de soporte `soporte@unlockhub.app` | Proveedor de dominio/email | ~1-5€/mes | Requerido por Google Play |
| B15 | Redactar y publicar **Privacy Policy** en URL pública | GitHub Pages (gratis) | Gratis | Requerido por Google Play, AdMob y GDPR |
| B16 | Redactar **Términos y Condiciones** en URL pública | GitHub Pages (gratis) | Gratis | Requerido por Google Play |
| B17 | ✅ **Migración Prisma en producción** | Automática en cada deploy — `npx prisma migrate deploy` configurado en `startCommand` de `railway.json` | Gratis | Aplicar todos los modelos nuevos en prod |

> **Estado de acciones completadas ✅**
> - B1-B2 (Sentry): ✅ DSNs configurados en Railway y EAS
> - B11-B12 (Cloudinary): ✅ Cuenta creada — `CLOUDINARY_URL` pendiente de configurar en Railway variables
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
| AdMob | Anuncios usuarios free | ⚙️ Pendiente (B8-B10) |
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
│   │   │   ├── privacy.tsx          # ✅ en app — pendiente URL pública (B15)
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
    ├── rotate-encryption-key.ts     # ✅ Ejecutar desde apps/api/ — ver sección Seguridad
    └── load-test/                   # ✅ Scripts k6 implementados
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

enum PointReason { CHALLENGE STREAK ACHIEVEMENT REDEEM }

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
- Flujo auth: NPSSO token → Authorization Code → Access Token + Refresh Token.
- `getUserTitles`, `getTitleTrophies`, `getUserTrophiesEarnedForTitle`
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
| `ADMOB_APP_ID` | AdMob | prod | ⚙️ Pendiente acción B8-B9 |
| `POSTHOG_API_KEY` | Analíticas | staging, prod | ⚙️ Pendiente acción N4 |
| `ADMIN_SECRET` | Acceso al dashboard admin (bearer) | prod | ⚙️ Generar con `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |

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
| `app/(auth)/register.tsx` | ✅ | Pendiente: validación de edad ≥16 en formulario mobile |
| `app/(auth)/forgot-password.tsx` | ✅ | Requiere RESEND_API_KEY (B3) para funcionar en prod |
| `app/reset-password.tsx` | ✅ | Deep link `unlockhub://reset-password?token=…` |
| `app/onboarding.tsx` | ✅ | Solo en primer login |
| `app/game/[id].tsx` | ✅ | Filtros, compartir, retar amigo, guías UGC |
| `app/profile/[username].tsx` | ✅ | Sección "vs tú" incluida |
| `app/link-platform/steam.tsx` | ✅ | Con ayuda contextual paso a paso |
| `app/link-platform/ra.tsx` | ✅ | Con ayuda contextual paso a paso |
| `app/link-platform/psn.tsx` | ✅ | Con ayuda contextual paso a paso |
| `app/link-platform/xbox.tsx` | 🚩 Gateado | Banner "Próximamente" hasta Fase 4 |
| `app/notifications.tsx` | ✅ | Centro de notificaciones in-app |
| `app/privacy.tsx` | ✅ | Pendiente: publicar en URL pública (B15) |
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
8. ⚙️ UMP SDK de AdMob (B10)
9. ✅ Privacy policy en app. ⚙️ Publicar en URL pública (B15-B16)
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
| P4 | UMP SDK AdMob | admob.google.com → Privacy & Messaging → GDPR → publicar |
| P5 | Privacy Policy + ToS en URL pública | GitHub Pages — Claude Code puede generar el HTML completo |
| P6 | Google Play Console | $25 + listing completo |
| P7 | Smoke tests producción | Registro + login + forgot-password + sync Steam/RA/PSN + rankings |

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

---

## Última revisión de código

**Fecha**: 2026-05-15 — revisión completa pre-EAS Build + resolución de todos los pendientes en rama `develop`.

### Resumen ejecutivo

| Categoría | Estado |
|---|---|
| TypeScript strict (API) | ✅ 0 errores `tsc --noEmit` |
| TypeScript strict (mobile) | ✅ 0 errores `tsc --noEmit` |
| Lint errores (API) | ✅ 0 errores, 0 warnings (T9 resuelto — era 145 `import/order`) |
| Lint errores (mobile) | ✅ 0 errores, 0 warnings (era 90 warnings) |
| Tests backend | ✅ 376 tests pasando, 32 suites — cobertura 81% stmt / 82% branch |
| Tests mobile | ✅ 160 tests pasando, 13 suites — era 135 pasando / 25 fallando |
| API build | ✅ `tsc -p tsconfig.json` sin errores |
| npm audit API | ⚠️ 2 high: `bcrypt → @mapbox/node-pre-gyp → tar` (build-time, pre-existente) |
| npm audit mobile | ⚠️ 17 high: `node-tar` vía Expo build tooling (build-time) — pendiente T8 |
| Logger `pino` | ✅ 33 `console.log/warn/error` eliminados en sesión anterior |
| F8 avatar upload | ✅ Backend Cloudinary + mobile expo-image-picker implementados |

### Correcciones aplicadas en esta sesión

**T9 — 145 warnings `import/order` en API → 0**
- `eslint --fix` automático + override en `.eslintrc.js` para ficheros de test (patrón `jest.mock()` hoisted es legítimo)
- `app.ts`: `eslint-disable/enable` alrededor del import de Sentry (inicialización antes que el resto — intencional)

**T7 — FeedScreen.test.tsx reescrito**
- Ahora importa `LibraryScreen` y mockea `useMyGames`/`useSyncAll`/`useSessionStore` correctamente
- 9 tests: header, loading, error, empty state, games list, pull-to-refresh, sync button

**roles.middleware.ts — de 0% a 100% de cobertura**
- 5 tests para `requirePremium`: `isPremium=true`, `isPremium=false`, sin user, mensaje /premium/i, next no llamado dos veces

**Mobile lint — 90 warnings → 0**
- `_layout.tsx`: tipo `User` movido al grupo de imports externos
- `jest.setup.ts`: `eslint-disable-next-line consistent-type-imports` en 4 líneas con patrón `jest.requireActual<typeof import(...)>`
- `link-platform/xbox.tsx`: `eslint-disable-next-line react-hooks/exhaustive-deps` en useEffect de OAuth (omisión intencional para evitar bucle infinito)

**F8 — Avatar upload**
- Backend: `lib/cloudinary.ts`, `middleware/upload.middleware.ts` (multer, JPG/PNG/WebP, 5 MB max), `user.service.uploadAvatar` (Cloudinary + update BD), `user.controller.uploadAvatarHandler`, ruta `POST /me/avatar`
- Mobile: `expo-image-picker`, `useMutation` multipart, Pressable en avatar con overlay de carga, `setUser` en sessionStore on success
- Tests: 5 nuevos tests en `user.routes.test.ts` (401, 400 sin archivo, 400 tipo inválido, 200, error propagación)

**Tests mobile preexistentes fallando (25 → 0)**
- `ProfileScreen.test.tsx`: mocks añadidos para `useFeed`, `expo-image-picker`, `featureFlags` (badge premium gateado por `FEATURES.premium=false`)
- `ChallengesScreen.test.tsx`: `getByRole('header', { name })` para evitar ambigüedad con EmptyState; clave i18n correcta (`empty_body` no `no_challenge`)
- `RankingsScreen.test.tsx`: eliminado check de subtítulo inexistente; corregido mojibake em-dash (`â€"` → `—`) y `TÃº` → `Tú`

### Pendientes documentados

- **T8**: `node-tar` vulnerabilidades high — API: 2 (vía `bcrypt` build-time), mobile: 17 (vía Expo build tooling). Ninguna es runtime. Fix requiere `expo@55.0.24` (breaking change desde SDK 51) y actualizar `bcrypt` o `@mapbox/node-pre-gyp`. PR dedicado post-lanzamiento.
- **T7 (cerrado)**: `FeedScreen.test.tsx` ya reescrito correctamente — ver commits de esta sesión.
- **`roles.middleware.ts` (cerrado)**: cobertura ahora al 100%.
- **F8 (cerrado)**: avatar upload implementado — funcional en producción en cuanto `CLOUDINARY_URL` esté en Railway Variables (P2).