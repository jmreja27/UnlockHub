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
| **S3** | Performance backend (Redis, PostgreSQL, queries) | — (pendiente análisis profundo) |
| **S4** | Mobile — memory leaks, fluidez, Socket.io | — (pendiente análisis profundo) |
| **S5** | Mobile — seguridad de datos, almacenamiento | — (pendiente análisis profundo) |
| **S6** | Limpieza general (console.log, dead code, docs) | A2, A9, A10, A12, A13, A27 |
