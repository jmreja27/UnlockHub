# CLAUDE.md — UnlockHub

Documento de contexto persistente para Claude Code. Léelo completo al inicio de cada sesión antes de escribir cualquier código.

---

## ¿Qué es UnlockHub?

Aplicación móvil (iOS + Android) para tracking unificado de logros de videojuegos. Integra **Steam**, **RetroAchievements**, **PlayStation Network (PSN)** y **Xbox**. La arquitectura de adaptadores permite añadir nuevas plataformas sin modificar código existente.

Modelo de negocio: app gratuita con anuncios (AdMob) + suscripción premium para eliminar anuncios. Rankings y funcionalidades sociales disponibles para todos los usuarios — sin ventajas de pago en competición.

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

### Backend — `apps/api`
| Tecnología | Uso |
|---|---|
| Node.js + Express + TypeScript | Core del servidor |
| Prisma | ORM con tipado automático y migraciones |
| Zod | Validación de schemas (compartido con frontend) |
| JWT + Refresh tokens | Autenticación stateless |
| Socket.io | Tiempo real: feed de actividad, notificaciones de ranking |
| BullMQ + Redis | Cola de tareas: sync de logros, rankings, notificaciones batch |
| Helmet.js | Headers de seguridad HTTP |
| express-rate-limit | Rate limiting en todos los endpoints |

### Infraestructura
| Servicio | Uso |
|---|---|
| PostgreSQL | Base de datos principal |
| Redis | Rankings en tiempo real (Sorted Sets) + caché de APIs externas |
| Cloudinary | Subida y CDN de avatares y banners |
| Railway | Deploy de Node + PostgreSQL + Redis |
| AdMob | Anuncios para usuarios free |
| GitHub Actions | CI/CD |

---

## Estructura del monorepo

```
unlockhub/
├── apps/
│   ├── mobile/                  # React Native + Expo
│   │   ├── app/                 # Rutas (Expo Router)
│   │   │   ├── (auth)/          # login, registro
│   │   │   ├── (tabs)/          # home, ranking, perfil, amigos
│   │   │   └── game/[id]/       # detalle de juego
│   │   ├── components/          # Componentes reutilizables
│   │   ├── hooks/               # Custom hooks
│   │   ├── stores/              # Zustand stores
│   │   ├── i18n/                # Traducciones ES / EN
│   │   └── __tests__/           # Tests de componentes
│   │
│   └── api/                     # Node.js + Express
│       ├── src/
│       │   ├── routes/          # Endpoints REST
│       │   ├── controllers/     # Lógica request/response
│       │   ├── services/        # Lógica de negocio
│       │   ├── repositories/    # Acceso a base de datos
│       │   ├── jobs/            # BullMQ workers
│       │   ├── sockets/         # Socket.io handlers
│       │   ├── middleware/      # Auth, rate limit, errores
│       │   └── platforms/       # Adaptadores de plataformas externas
│       │       ├── platform.interface.ts   # Contrato común
│       │       ├── steam.adapter.ts
│       │       ├── retroachievements.adapter.ts
│       │       ├── psn.adapter.ts
│       │       └── xbox.adapter.ts
│       └── prisma/
│           ├── schema.prisma
│           └── migrations/
│
└── packages/
    ├── types/                   # Tipos TypeScript compartidos
    └── validators/              # Esquemas Zod compartidos
```

---

## Modelo de base de datos (Prisma)

### Entidades principales

```prisma
// Usuarios
model User {
  id           String    @id @default(cuid())
  username     String    @unique
  email        String    @unique
  passwordHash String
  avatar       String?
  banner       String?
  bio          String?
  level        Int       @default(1)
  xp           Int       @default(0)
  streakDays   Int       @default(0)
  countryCode  String?
  isPremium    Boolean   @default(false)
  premiumUntil DateTime?
  lastSyncAt   DateTime?
  createdAt    DateTime  @default(now())
}

// Cuentas de plataformas vinculadas
// EXTENSIBLE: añadir PSN/XBOX = añadir valor al enum
model PlatformAccount {
  id              String    @id @default(cuid())
  userId          String
  platform        Platform  // STEAM | RA | XBOX | PSN
  externalId      String
  username        String
  encryptedToken  String    // AES-256, nunca texto plano
  lastSyncedAt    DateTime?
  syncCooldownUntil DateTime?
}

enum Platform { STEAM RA XBOX PSN }

// Logros
model Achievement {
  id               String  @id @default(cuid())
  gameId           String
  platform         Platform
  externalId       String
  title            String
  description      String?
  iconUrl          String?
  rawValue         Float?  // Valor original de la plataforma
  normalizedPoints Int     // Valor unificado de UnlockHub
  rarity           Float?  // % de jugadores que lo tienen
  externalUrl      String? // Enlace a la página oficial
}

// Sistema de puntos (extensible: canje, torneos, etc.)
model UserPoint {
  id        String      @id @default(cuid())
  userId    String
  amount    Int
  reason    PointReason // CHALLENGE | STREAK | ACHIEVEMENT
  createdAt DateTime    @default(now())
}

enum PointReason { CHALLENGE STREAK ACHIEVEMENT }

// Suscripciones premium
model Subscription {
  id                 String           @id @default(cuid())
  userId             String
  plan               SubscriptionPlan // MONTHLY | ANNUAL
  provider           StoreProvider    // GOOGLE_PLAY | APP_STORE
  status             String
  startedAt          DateTime
  expiresAt          DateTime
  storeTransactionId String
}
```

### Rankings — Redis Sorted Sets

Los rankings **nunca** se calculan en PostgreSQL en tiempo real. Siempre desde Redis:

```
ZADD ranking:global <xp> <userId>
ZADD ranking:global:es <xp> <userId>        # Nacional
ZADD ranking:platform:steam <xp> <userId>   # Por plataforma
ZRANK ranking:global <userId>               # Posición instantánea O(log n)
```

Snapshot diario a PostgreSQL para histórico de posiciones.

---

## APIs externas

### Steam Web API
- `GetOwnedGames` — juegos del usuario
- `GetPlayerAchievements` — logros por juego
- `GetSchemaForGame` — metadatos de logros
- `GetGlobalAchievementPercentagesForApp` — rareza (base de normalizedPoints)
- Rate limit: 100.000 req/día. Cachear en Redis siempre.
- Requisito: perfil del usuario público en Steam.

### RetroAchievements API
- `getUserSummary`, `getUserCompletedGames`, `getGameInfoAndUserProgress`
- Sin garantías SLA — cachear última respuesta válida siempre.
- Requisito: username + API key del usuario.
- Sin endpoint de búsqueda por título — los juegos RA solo aparecen en search tras un sync real.

### PlayStation Network (PSN) API
- Librería: `psn-api` (npm) — wrapper tipado de la API no oficial de Sony.
- Flujo de autenticación: NPSSO token (cookie de sesión) → Authorization Code → Access Token + Refresh Token.
- `getUserTitles` — lista de juegos con trofeos del usuario.
- `getTitleTrophies` — metadatos de trofeos de un juego (Bronce/Plata/Oro/Platino).
- `getUserTrophiesEarnedForTitle` — trofeos obtenidos por el usuario en un juego concreto.
- Normalización: Bronce → 15 XP, Plata → 30 XP, Oro → 90 XP, Platino → 300 XP.
- Caché en Redis: metadatos de trofeos 24h, lista de juegos del usuario 1h.
- Requisito del usuario: NPSSO token (obtenible desde `my.playstation.com`).

### Xbox Live / Microsoft API
- OAuth2 con Microsoft Identity Platform → Xbox Live Token → XSTS Token.
- `GET /users/me/profile/settings` — perfil Xbox del usuario.
- `GET /users/xuid({xuid})/achievements` — lista de logros.
- Normalización de Gamerscore → XP con escala proporcional.
- Caché en Redis: logros 30 min.
- Requisito del usuario: Microsoft account con Xbox Live.

### Sincronización — Cooldowns por tier

| | Free | Premium |
|---|---|---|
| Sync automático | Cada 60 min | Cada 15 min |
| Sync manual | Cada 30 min | Cada 5 min |
| Syncs manuales/día | 5 | Ilimitados |

Control mediante `syncCooldownUntil` en Redis antes de lanzar cada job.
Si la API externa falla → mostrar última respuesta cacheada, nunca error en blanco.

---

## Seguridad — Pilar fundamental de la aplicación

La seguridad no es una característica opcional: es el requisito más importante de UnlockHub. Cualquier código generado debe cumplir estas reglas sin excepción. Si existe conflicto entre velocidad de desarrollo y seguridad, **siempre gana la seguridad**.

### Gestión de secrets y credenciales — Regla absoluta

**Ningún secret, contraseña, clave de API, token o dato sensible puede aparecer jamás en el código fuente, en ningún fichero del repositorio ni en ningún mensaje de commit.**

Reglas concretas e innegociables:

- **Ficheros `.env`** con valores reales: solo existen en la máquina local del desarrollador y en el servidor de hosting. Nunca se suben a git. El `.gitignore` debe bloquearlos siempre: `.env`, `.env.local`, `.env.production`, `*.env`.
- **Ficheros `.env.example`**: solo contienen placeholders (`TU_CLAVE_AQUI`, `GENERAR_SECRETO`). Son los únicos ficheros de entorno que se suben al repositorio.
- **Secrets de producción**: se guardan exclusivamente en el proveedor de hosting (Fly.io → `fly secrets set`). Nunca en ficheros del repo, nunca en comentarios, nunca en logs.
- **Secrets de CI/CD** (EAS Build, GitHub Actions): se configuran en el dashboard del servicio (expo.dev, GitHub Secrets). Nunca se escriben en ficheros del repositorio.
- **Claves de API de terceros** (Steam, AdMob, Cloudinary, Sentry): ídem — solo en variables de entorno del servidor o del build, nunca hardcodeadas.
- **Verificación antes de cada commit**: comprobar que ningún fichero staged contiene secrets reales. Si Claude detecta un secret real en cualquier fichero que vaya a escribir, debe negarse y pedir al usuario que lo proporcione por variable de entorno.
- **Rotación inmediata**: si se detecta que un secret ha sido expuesto en el repositorio por error, considerarlo comprometido y rotarlo inmediatamente aunque el commit haya sido eliminado (git history puede haberse cloneado).

### Seguridad en el código

Estas reglas son innegociables en todo el código generado:

- **JWT**: access token (15 min) en `httpOnly cookie`. Nunca en `localStorage` ni `AsyncStorage`.
- **Refresh token**: 30 días, persistente en BD.
- **Tokens externos**: encriptados con AES-256 antes de guardar. Nunca en texto plano.
- **Contraseñas**: bcrypt con mínimo 12 rounds.
- **Rate limiting**: en TODOS los endpoints. Estricto en `/auth/*`.
- **Helmet.js**: configurado siempre en Express.
- **Validación con Zod**: en TODOS los inputs, frontend y backend. Nunca confiar en el cliente.
- **CSRF**: protección en todos los endpoints que mutan estado.
- **CORS**: estricto, solo orígenes explícitamente permitidos.
- **Variables de entorno**: nunca en código. `.env` validado con Zod al arrancar el servidor.
- **Logs de seguridad**: registrar intentos fallidos de login, cambios de contraseña y vinculaciones.
- **CI**: `npm audit --audit-level=high` en cada PR.
- **Sin secrets en logs**: nunca loguear contraseñas, tokens, claves de API ni datos personales.

---

## Accesibilidad — WCAG 2.1 AA

Todo componente de UI generado debe cumplir:

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
- **Modo offline**: mostrar datos cacheados con indicador visual. Nunca pantalla de error vacía.
- **Optimistic updates**: en acciones sociales (amigos, reacciones).
- **Confirmación**: antes de acciones destructivas o irreversibles.
- **Haptics**: `expo-haptics` en logros desbloqueados y subidas de nivel.
- **SafeAreaView**: en todas las pantallas. Soporte de notch y Dynamic Island.
- **Gestos nativos**: swipe para volver, pull-to-refresh donde corresponda.

---

## Rendimiento

### Frontend
- **FlashList** siempre en lugar de FlatList — sin excepciones.
- **expo-image** siempre en lugar de Image de React Native.
- `useMemo` y `useCallback` solo donde haya evidencia de re-renders innecesarios.
- TanStack Query con `staleTime` y `gcTime` configurados apropiadamente.
- Auditar bundle con `expo-bundle-analyzer` antes de cada release.

### Backend
- Rankings desde Redis Sorted Sets, nunca desde queries a PostgreSQL en tiempo real.
- Índices en PostgreSQL en todas las FK y columnas frecuentes en `WHERE`/`ORDER BY`.
- **Paginación obligatoria** en todos los endpoints de listas. Nunca devolver colecciones sin límite.
- Compresión gzip/brotli con `compression` middleware en Express.
- Caché de respuestas de APIs externas en Redis.
- Jobs de sync en workers BullMQ, nunca bloqueando el hilo principal de Express.

---

## Testing

### Backend
- **Jest + ts-jest**: tests unitarios de services y repositories.
- **Supertest**: tests de integración de endpoints HTTP con BD de test separada.
- Cobertura mínima: **80%**. El CI bloquea el merge si no se alcanza.

### Frontend
- **Jest + @testing-library/react-native**: tests de componentes.
- **jest-axe**: tests de accesibilidad en componentes críticos.
- **Maestro**: tests E2E en iOS y Android.

### Pipeline CI (GitHub Actions) — en cada PR
1. Lint (ESLint + Prettier)
2. Type check (TypeScript strict)
3. Tests unitarios
4. Tests de integración
5. Cobertura mínima 80%
6. `npm audit --audit-level=high`

**Merge bloqueado si cualquier paso falla.**

### Pruebas en emulador Android — Mock server

Para probar en el emulador Android sin infraestructura real:

```bash
cd apps/api && npm run mock   # arranca mock-server.js en :3000
```

**Cuenta de prueba**: `demo@unlockhub.test` / `Demo1234!`

**Reglas críticas para que funcione:**
- El APK **debe** incluir el plugin `expo-build-properties` en `app.json > plugins` con `usesCleartextTraffic: true`. Poner esta flag directamente en `app.json > expo > android` **no funciona** en Expo SDK 51 durante EAS Build — el `AndroidManifest.xml` generado no la recoge. Verificado con `aapt dump xmltree`.
- Configuración correcta en `app.json`:
  ```json
  "plugins": [["expo-build-properties", { "android": { "usesCleartextTraffic": true } }]]
  ```
- La URL del emulador al host es `http://10.0.2.2:3000` (no `localhost`). Configurado en `eas.json` perfil `preview`.
- `adb reverse` no es fiable en todos los emuladores; preferir `10.0.2.2`.

**EAS Build — cuota 30/mes — REGLA ABSOLUTA**: No lanzar ninguna build sin que el usuario lo pida explícitamente. Ni siquiera si el código está listo. Verificar conectividad con `nc` + logs del servidor antes de compilar cuando el usuario sí lo pida.

---

## Estado de las pantallas — Fase 2 + PSN + Xbox completado

### Tabs principales

| Tab | Ruta | Contenido |
|---|---|---|
| Home | `app/(tabs)/index.tsx` | **Biblioteca de juegos** del usuario con buscador + filtros por plataforma (ALL/STEAM/RA/PSN/XBOX). Icono: `game-controller`. |
| Search | `app/(tabs)/search.tsx` | Búsqueda unificada juegos + usuarios. Híbrida: DB local + Steam Store API si < 10 resultados locales. |
| Rankings | `app/(tabs)/rankings.tsx` | Ranking con filtros Global / Nacional / Steam / RetroAchievements / PlayStation. Tap en jugador → perfil público. |
| Friends | `app/(tabs)/friends.tsx` | Lista de amigos + solicitudes pendientes. Tap en amigo → perfil público. |
| Challenges | `app/(tabs)/challenges.tsx` | Reto semanal activo con barra de progreso y ranking del reto. |
| Profile | `app/(tabs)/profile.tsx` | Perfil + stats + plataformas vinculadas (Steam/RA/PSN/Xbox) + actividad reciente (últimos 5 eventos del feed) + **Ajustes** (idioma ES/EN, tema Oscuro/Sistema) + logout. |

### Pantallas adicionales

| Ruta | Contenido |
|---|---|
| `app/(auth)/login.tsx` | Login |
| `app/(auth)/register.tsx` | Registro |
| `app/game/[id].tsx` | Detalle de juego con lista de logros |
| `app/profile/[username].tsx` | Perfil público de otro usuario |
| `app/link-platform/steam.tsx` | Vinculación de cuenta Steam (SteamID64 + API Key) |
| `app/link-platform/ra.tsx` | Vinculación de cuenta RetroAchievements (username + API Key) |
| `app/link-platform/psn.tsx` | Vinculación de cuenta PSN (NPSSO token) |
| `app/link-platform/xbox.tsx` | Vinculación de cuenta Xbox (OAuth2 Microsoft) |
| `app/privacy.tsx` | Política de privacidad + GDPR |
| `app/premium.tsx` | Planes premium (desactivados en v1 — solo AdMob) |
| `app/wrapped/[year].tsx` | Gaming Wrapped anual |

### Preferencias de usuario (persistentes)

- `stores/preferencesStore.ts` — Zustand + AsyncStorage
- **Idioma**: ES / EN — cambiable desde Profile → Ajustes
- **Tema**: Oscuro / Sistema (sigue OS) — cambiable desde Profile → Ajustes
- **Modo claro completo**: PENDIENTE — todos los componentes usan `text-white` hardcoded. Requiere añadir variantes `dark:` a cada componente.

### Staging environment — ✅ Montado

Entorno de preproducción operativo en Fly.io para probar en dispositivos reales:

- **API staging**: `https://unlockhub-api-staging.fly.dev` (app `unlockhub-api-staging` en Fly.io)
- **DB staging**: Neon branch staging
- **`eas.json` perfil `preview`** → apunta a la URL de staging
- Cuenta demo: `demo@unlockhub.test` / `Demo1234!`
- Los juegos y logros en staging vienen exclusivamente de syncs reales con APIs externas (seed solo crea el usuario demo)

---

## Reglas generales de desarrollo

- **EAS Build — REGLA ABSOLUTA**: Nunca lanzar ninguna build (`eas build`) sin que el usuario lo pida explícitamente en ese mismo mensaje. No importa si el código está listo, si los commits están hechos o si la sesión está terminando. Esperar siempre.
- **TypeScript strict** en todo el código. Sin `any`. Sin excepciones.
- **Comentarios en español**, código (variables, funciones, clases) en inglés.
- Cada función de servicio debe tener su test unitario correspondiente.
- El modelo de plataformas debe ser extensible sin modificar código existente.
- Errores HTTP con estructura consistente: `{ error: string, code: string, details?: unknown }`.
- Todas las respuestas de lista paginadas: `{ data: T[], total: number, page: number, limit: number }`.
- Los tipos compartidos van en `packages/types`, los schemas Zod en `packages/validators`.

---

## Plataformas — Patrón de extensibilidad

Los 4 adaptadores están implementados en `apps/api/src/platforms/`:

| Adapter | Fichero | Estado |
|---|---|---|
| Steam | `steam.adapter.ts` | ✅ Implementado |
| RetroAchievements | `retroachievements.adapter.ts` | ✅ Implementado |
| PlayStation Network | `psn.adapter.ts` | ✅ Implementado |
| Xbox | `xbox.adapter.ts` | ✅ Implementado |

Todos implementan la interfaz común:

```typescript
// apps/api/src/platforms/platform.interface.ts
export interface PlatformAdapter {
  platform: Platform;
  getUserAchievements(externalId: string): Promise<Achievement[]>;
  getGameInfo(externalId: string): Promise<Game>;
  syncUser(account: PlatformAccount): Promise<SyncResult>;
}
```

Las rutas de vinculación (`/api/v1/platforms/{steam|ra|psn|xbox}/link`) y las pantallas mobile (`app/link-platform/`) están implementadas para las 4 plataformas.

---

## Roadmap

| Fase | Contenido | Estado |
|---|---|---|
| **Fase 1 — MVP** | Setup monorepo, auth, vinculación Steam + RA, tracking de logros, rankings, perfil, multiidioma, premium, AdMob | ✅ Completa |
| **Fase 2 — Social** | Amigos, feed de actividad, retos semanales, sistema de puntos, racha diaria, push notifications, Gaming Wrapped, perfil público, búsqueda de juegos y usuarios, **vinculación PSN + Xbox (adaptadores, rutas API, pantallas mobile)** | ✅ Completa |
| **Fase 3 — Producción y monetización** | Google Play Billing real, despliegue Fly.io, AdMob producción, Privacy Policy/GDPR, EAS Build, Play Store listing, Sentry | 🔄 En progreso |
| **Fase 4 — Avanzado** | Torneos con recompensas, canje de puntos, App Store iOS | 🔲 Futuro |

> **Aviso legal Fase 4**: Los torneos con recompensas reales pueden clasificarse como juegos de azar en España (Ley 13/2011). Consultar con abogado antes de implementar.

---

## Orden recomendado de desarrollo (Fase 1)

1. Setup del monorepo + TypeScript strict
2. Schema de Prisma + migraciones iniciales
3. Auth (registro, login, refresh token)
4. Platform adapter de Steam
5. Platform adapter de RetroAchievements
6. Sync de logros con BullMQ (cooldowns por tier)
7. Sistema de rankings en Redis
8. Perfil de usuario (avatar, banner, nivel, XP)
9. Pantallas principales de la app móvil
10. Suscripción premium + AdMob
11. i18n ES/EN en toda la app
12. Tests y CI al 80% de cobertura

---

## Orden recomendado de desarrollo (Fase 2)

> Base: partir de `develop` con la Fase 1 completa. Cada paso sale de `develop` en su propio `feat/*` y mergea de vuelta con `--no-ff`.

1. **Schema Prisma — tablas sociales**
   - Nuevas tablas: `Friendship` (userId, friendId, status: PENDING/ACCEPTED), `ActivityEvent` (userId, type, payload, createdAt), `WeeklyChallenge` (title, description, targetValue, metric, startAt, endAt), `UserChallenge` (userId, challengeId, progress, completedAt)
   - Migración y regeneración de tipos Prisma
   - Añadir tipos `Friendship`, `ActivityEvent`, `Challenge` a `packages/types`

2. **Sistema de amigos — API**
   - `friendship.service.ts`: sendRequest, acceptRequest, rejectRequest, unfriend, getFriends, getPendingRequests
   - `friendship.repository.ts`: queries Prisma con paginación
   - Rutas `/friends/*` con autenticación y rate limiting
   - Validators Zod en `packages/validators`

3. **Sistema de amigos — pantalla móvil**
   - Tab "Amigos" en `app/(tabs)/friends.tsx`: lista de amigos, solicitudes pendientes, buscador por username
   - Hook `useFriends.ts` con TanStack Query + optimistic updates en accept/reject
   - Strings i18n ES/EN para todo el módulo
   - *(paralelo con paso 4)*

4. **Racha diaria (streakDays)**
   - Job BullMQ `streak.worker.ts`: se lanza a medianoche UTC, incrementa `streakDays` si el usuario tuvo actividad en las últimas 24h, resetea a 0 si no
   - `streak.scheduler.ts`: job repetible con cron `0 0 * * *`
   - Integración con `addXp` en `user.service.ts`: +50 XP por racha mantenida, haptic + notificación local al alcanzar rachas de 7/30/100 días
   - *(paralelo con paso 3)*

5. **Sistema de puntos (UserPoint) — historial y consulta**
   - `points.service.ts`: awardPoints (registra en `UserPoint`), getPointsHistory (paginado), getPointsTotal
   - Ruta `/users/me/points`
   - Hook `usePoints.ts` + pantalla de historial de puntos en el perfil
   - Llamar a `awardPoints` desde los eventos existentes (logros, rachas, retos completados)

6. **Feed de actividad — backend**
   - `activity.service.ts`: createEvent (escribe en `ActivityEvent`), getFriendsFeed (paginado, solo amigos aceptados), getPublicFeed
   - Socket.io namespace `/activity`: evento `new_activity` emitido a las rooms de amigos al crear un evento
   - `sockets/activity.handler.ts`: join room al conectar, broadcast al crear evento
   - Llamar a `createEvent` desde sync worker (logros nuevos), friendship service (nuevos amigos) y challenge service (retos completados)

7. **Feed de actividad — pantalla móvil**
   - Pantalla `app/(tabs)/home.tsx` (reemplaza o amplía la pantalla Home actual)
   - Hook `useFeed.ts`: TanStack Query con polling o WebSocket según conectividad
   - Componente `ActivityCard.tsx`: avatar, texto de evento, timestamp relativo, haptic en likes
   - Pull-to-refresh, skeleton screen, modo offline con datos cacheados

8. **Retos semanales**
   - `challenge.service.ts`: createWeeklyChallenge, evaluateUserProgress, completeChallenge (llama a awardPoints + createEvent)
   - `challenge.scheduler.ts`: job BullMQ cron `0 0 * * 1` (cada lunes) que crea el reto de la semana y evalúa el anterior
   - Pantalla `app/(tabs)/challenges.tsx` con reto activo, barra de progreso y ranking del reto
   - Hook `useChallenges.ts`

9. **Push notifications**
   - Configurar `expo-notifications` en la app: permisos, token de dispositivo
   - `notification.service.ts` (API): saveDeviceToken, sendPush (usando Expo Push API), sendBulk para notificaciones batch via BullMQ
   - Eventos que disparan push: nuevo amigo, logro desbloqueado, racha en riesgo (23h sin actividad), reto completado, posición en ranking mejorada (top 10)
   - Preferencias de notificación por usuario (qué tipos activar/desactivar)

10. **Perfil público**
    - Pantalla `app/profile/[username].tsx`: avatar, nivel, XP, rachas, logros recientes, amigos en común
    - Ruta `/users/:username/public` ya existe — consumirla con hook `usePublicProfile.ts`
    - Botón "Enviar solicitud de amistad" integrado con `useFriends`
    - Accesible desde rankings (tap en un jugador) y desde el feed de actividad

11. **Gaming Wrapped**
    - `wrapped.service.ts`: aggregation anual — juego más jugado, logro más raro desbloqueado, mejor racha, total de XP ganado, comparación con el año anterior
    - Pantalla `app/wrapped/[year].tsx`: animaciones con `reanimated`, compartible como imagen (expo-view-shot)
    - Disponible a partir del 1 de diciembre, datos del año en curso
    - *(puede desarrollarse en paralelo con pasos 9-10)*

12. **Búsqueda de juegos y usuarios** ✅ Implementado
    - `GET /api/v1/search?q=&type=all|games|users` — búsqueda unificada con rate limit (60 req/min)
    - `GET /api/v1/search/games/:id` — detalle de juego con lista completa de logros
    - `search.service.ts`: búsqueda insensible a mayúsculas en `Game.title` y `User.username`
    - Tab "Buscar" en `app/(tabs)/search.tsx`: barra de búsqueda + filtros Todo/Juegos/Personas
    - `components/GameCard.tsx`: badge de plataforma con color diferenciado (Steam/RA/Xbox/PSN)
    - `components/UserCard.tsx`: avatar, username, nivel y XP
    - `app/game/[id].tsx`: lista de logros con imagen, descripción, XP y rareza
    - `hooks/useSearch.ts`: TanStack Query + debounce 400ms, mínimo 2 caracteres
    - Strings i18n ES/EN completos

13. **Tests y CI al 80% de cobertura para Fase 2**
    - Tests unitarios para todos los nuevos services: friendship, activity, challenge, points, notification, wrapped, **search**
    - Tests de integración supertest para todas las nuevas rutas
    - Tests de componentes móvil con @testing-library/react-native para ActivityCard, ChallengeCard, FriendItem, **GameCard, UserCard**
    - Actualizar `collectCoverageFrom` en `jest.config.js` si se añaden nuevas exclusiones

---

## Orden recomendado de desarrollo (Fase 3 — Producción y monetización)

> Objetivo: publicar en Google Play Store y generar ingresos reales. Prerequisito: Fase 2 completa en `develop`.

1. **Infraestructura de producción (Railway)**
   - Provisionar PostgreSQL 16 + Redis 7 en Railway
   - Desplegar la API Node.js con variables de entorno de producción
   - Dominio propio + SSL/HTTPS (Railway lo gestiona automáticamente)
   - Configurar `REDIS_URL`, `DATABASE_URL`, `JWT_SECRET`, `ENCRYPTION_KEY` como secrets de Railway
   - Health check endpoint `/health` para Railway

2. **Legal — Privacy Policy, ToS y GDPR**
   - Redactar y publicar Privacy Policy (requerida por Google Play, AdMob y GDPR)
   - Redactar Términos y Condiciones
   - Banner de consentimiento en la app para tracking de AdMob (ATT en iOS, consentimiento en Android)
   - Sin Privacy Policy publicada, AdMob no aprueba la cuenta y Google Play rechaza la app

3. **AdMob — cuenta y configuración de producción**
   - Crear cuenta AdMob y vincularla a la app
   - Reemplazar los ad unit IDs de test por los de producción en `components/AdBanner.tsx`
   - Configurar mediation si se quiere maximizar ingresos
   - La aprobación de AdMob puede tardar varios días — iniciar este paso en paralelo con el paso 2

4. **Google Play Billing — integración real de pagos**
   - Instalar SDK: `expo-in-app-purchases` o `react-native-iap`
   - Crear los productos en Google Play Console (suscripción mensual y anual)
   - Implementar flujo de compra en la app: `requestSubscription`, `getSubscriptions`, restore purchases
   - Endpoint backend `/subscriptions/verify-google` que valida el receipt con la Google Play Developer API
   - Webhook `/subscriptions/google-webhook` para manejar renovaciones automáticas, cancelaciones y expirations (usando Google Play Real-time Developer Notifications via Pub/Sub)
   - Actualizar `subscription.service.ts` para procesar los eventos del webhook

5. **EAS Build — compilación y firma de la app**
   - Instalar y configurar EAS CLI (`npm install -g eas-cli`)
   - Crear `eas.json` con perfiles `development`, `preview` y `production`
   - Generar keystore de Android (EAS lo gestiona — guardar copia de seguridad del keystore, sin él no se puede actualizar la app)
   - Build de producción: `eas build --platform android --profile production`
   - Genera el AAB (Android App Bundle) requerido por Play Store

6. **Google Play Console — listing y subida**
   - Crear cuenta Google Play Developer ($25 única vez)
   - Crear la app en Play Console y rellenar el listing: título, descripción corta/larga, capturas de pantalla, icono 512x512, feature graphic
   - Cuestionario de clasificación por edades (PEGI/IARC)
   - Sección "Data Safety": declarar qué datos se recogen (email, datos de juego, identificadores de dispositivo para AdMob)
   - Subir el AAB a la pista de producción: `eas submit --platform android`
   - Primera revisión de Google tarda entre 1 y 7 días

7. **Monitoring y crash reporting (Sentry)**
   - Instalar `@sentry/react-native` en la app móvil y `@sentry/node` en la API
   - Configurar source maps para que los stack traces sean legibles
   - Alertas para errores críticos (tasa de crashes > X%, errores 5xx en la API)
   - Dashboard de rendimiento: latencia de endpoints, tiempo de carga de pantallas

8. **Variables de entorno y secrets de producción**
   - Auditar todos los `.env.example` y asegurarse de que ningún secret está en el repositorio
   - Configurar los secrets de producción en Railway y en GitHub Actions (para EAS Build en CI)
   - Rotar todos los secrets de desarrollo antes del lanzamiento

9. **Smoke tests de producción**
   - Registro, login y logout en el entorno de producción real
   - Sync de Steam, RetroAchievements, PSN y Xbox con cuentas reales
   - Flujo de compra de premium end-to-end (con tarjeta real o cuenta de test de Google Play)
   - Verificar que AdMob muestra anuncios reales (no de test) en usuarios free
   - Verificar que los rankings se actualizan en Redis

---

## Orden recomendado de desarrollo (Fase 4 — Avanzado)

> Expansión post-lanzamiento. Partir de `develop` con Fase 3 estable en producción.
> PSN y Xbox ya están implementados — esta fase es pura expansión de funcionalidad premium.

1. **Sistema de torneos**
   - Modelo `Tournament` en Prisma: nombre, fechas, métrica (logros desbloqueados, XP ganado), premio
   - `tournament.service.ts`: crear torneo, inscribir usuario, evaluar clasificación, distribuir premios
   - Pantalla de torneos con cuenta atrás, clasificación en tiempo real (Socket.io), historial
   - > ⚠️ **Aviso legal**: los torneos con recompensas económicas pueden clasificarse como juegos de azar en España (Ley 13/2011). Consultar con abogado antes de implementar.

2. **Canje de puntos (UserPoint)**
   - Catálogo de recompensas canjeables: skins de perfil, marcos de avatar, insignias exclusivas
   - `rewards.service.ts`: getRewardsCatalog, redeemReward (descuenta UserPoint + otorga recompensa)
   - Pantalla de tienda de recompensas en el perfil
   - Las recompensas son cosméticas — no afectan a rankings (modelo de negocio ético)

3. **App Store iOS**
   - Apple Developer Program ($99/año)
   - Build iOS con EAS: `eas build --platform ios --profile production`
   - Configurar StoreKit 2 para in-app purchases en iOS (flujo diferente a Google Play Billing)
   - Subir a App Store Connect y pasar revisión de Apple (más estricta que Google Play)
