# CLAUDE.md — UnlockHub

Documento de contexto persistente para Claude Code. Léelo completo al inicio de cada sesión antes de escribir cualquier código.

---

## ¿Qué es UnlockHub?

Aplicación móvil (iOS + Android) para tracking unificado de logros de videojuegos. En la v1 integra **Steam** y **RetroAchievements**. La arquitectura está diseñada para añadir PlayStation y Xbox en el futuro sin romper el código existente.

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
│       │       └── retroachievements.adapter.ts
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

### Sincronización — Cooldowns por tier

| | Free | Premium |
|---|---|---|
| Sync automático | Cada 60 min | Cada 15 min |
| Sync manual | Cada 30 min | Cada 5 min |
| Syncs manuales/día | 5 | Ilimitados |

Control mediante `syncCooldownUntil` en Redis antes de lanzar cada job.
Si la API externa falla → mostrar última respuesta cacheada, nunca error en blanco.

---

## Seguridad — Prioridad máxima

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

---

## Reglas generales de desarrollo

- **TypeScript strict** en todo el código. Sin `any`. Sin excepciones.
- **Comentarios en español**, código (variables, funciones, clases) en inglés.
- Cada función de servicio debe tener su test unitario correspondiente.
- El modelo de plataformas debe ser extensible sin modificar código existente.
- Errores HTTP con estructura consistente: `{ error: string, code: string, details?: unknown }`.
- Todas las respuestas de lista paginadas: `{ data: T[], total: number, page: number, limit: number }`.
- Los tipos compartidos van en `packages/types`, los schemas Zod en `packages/validators`.

---

## Plataformas — Patrón de extensibilidad

Cualquier nueva plataforma (PlayStation, Xbox) debe implementar esta interfaz:

```typescript
// apps/api/src/platforms/platform.interface.ts
export interface PlatformAdapter {
  platform: Platform;
  getUserAchievements(externalId: string): Promise<Achievement[]>;
  getGameInfo(externalId: string): Promise<Game>;
  syncUser(account: PlatformAccount): Promise<SyncResult>;
}
```

Añadir una plataforma nueva = crear su adapter implementando esta interfaz + añadir el valor al enum `Platform`. Sin tocar ningún otro código.

---

## Roadmap

| Fase | Contenido | Estado |
|---|---|---|
| **Fase 1 — MVP** | Setup monorepo, auth, vinculación Steam + RA, tracking de logros, rankings, perfil, multiidioma, premium, AdMob | 🔲 Pendiente |
| **Fase 2 — Social** | Amigos, feed de actividad, retos semanales, sistema de puntos, racha diaria, push notifications, Gaming Wrapped, perfil público | 🔲 Pendiente |
| **Fase 3 — Avanzado** | Torneos con recompensas, canje de puntos, integración PS/Xbox | 🔲 Futuro |

> **Aviso legal Fase 3**: Los torneos con recompensas reales pueden clasificarse como juegos de azar en España (Ley 13/2011). Consultar con abogado antes de implementar.

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
