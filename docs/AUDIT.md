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
| A1 | Seguridad API | 🟠 | CVE `ws` GHSA-58qx-3vcg-4xpx — uninitialized memory disclosure. Versión vulnerable: `ws 8.0.0–8.20.0` vía `engine.io` + `socket.io-adapter`. Runtime activo. Fix: `npm audit fix`. | `engine.io`, `socket.io-adapter` (transitivas) | 🔲 | S1 |
| A2 | Seguridad API | 🟠 | CVE `tar` (5 CVEs HIGH: GHSA-34x7, GHSA-8qq5, GHSA-83g3, GHSA-qffp, GHSA-9ppj) — path traversal / arbitrary file write/read en node-tar ≤7.5.10. Solo se usa en `npm install` (no runtime), pero `npm audit` bloquea CI. Fix: upgrade transitivo vía `npm audit fix`. | `tar` (transitiva de herramientas) | 🔲 | S1 |
| A3 | Seguridad API | 🟡 | `webhooks.controller.ts:46` — comparación `token !== secret` no es constant-time. Un atacante con acceso de red y alta resolución temporal podría usar timing side-channel para inferir `REVENUECAT_WEBHOOK_SECRET`. Fix: `crypto.timingSafeEqual()`. | `apps/api/src/controllers/webhooks.controller.ts:46` | 🔲 | S1 |
| A4 | Seguridad API | 🟡 | `authenticate` middleware: el bloque `.catch()` (línea 56-63) silencia errores de BD y autoriza la request con los datos del JWT, saltándose la verificación de soft-delete GDPR. Durante un outage de PostgreSQL, cuentas eliminadas podrían seguir autenticándose. Trade-off deliberado documentado pero sin comentario en el código. | `apps/api/src/middleware/authenticate.ts:56` | 🔲 | S1 |
| A5 | Seguridad API | 🟡 | Upload de fichero (`createUploadMiddleware`): el MIME type se valida solo desde el header `Content-Type` enviado por el cliente (`file.mimetype`), no por inspección de magic bytes del fichero real. Un cliente malicioso puede subir un EXE o script renombrándolo como `.jpg`. Fix: usar `file-type` para inspeccionar los primeros bytes. | `apps/api/src/middleware/upload.middleware.ts:12-14` | 🔲 | S1 |
| A6 | Seguridad API | 🟡 | `getMyRankHandler`: `req.query['platform']` se usa directamente (`.toUpperCase()`) sin pasar por `platformSchema.parse()`. Cualquier string arbitrario llega al key Redis `ranking:platform:<value>`, pudiendo devolver datos vacíos o de claves inesperadas. Los demás handlers de ranking sí usan `platformSchema`. | `apps/api/src/controllers/ranking.controller.ts:33-35` | 🔲 | S1 |
| A7 | Calidad / ESLint | 🟡 | `no-floating-promises` y `no-misused-promises` no configurados en ESLint. Requieren `parserOptions.project` (tsconfig). Sin ellos, promesas implícitamente ignoradas en route handlers y schedulers no generan error de build. | `.eslintrc.js` | 🔲 | S1 |
| A8 | Dependencias | 🟡 | 23 vulnerabilidades moderate en el ecosistema socket.io / express: `qs` en `express`, `ws` en cadena engine.io. `npm audit fix` resuelve la mayoría sin breaking changes. | `package-lock.json` | 🔲 | S1 |
| A9 | Móvil / ESLint | 🔵 | `useWrapped.ts:15` — `security/detect-unsafe-regex` sobre `/^\d{4}(-\d{2})?$/`. Falso positivo: no hay cuantificadores anidados ni backtracking exponencial posible. Silenciar con `// eslint-disable-next-line`. | `apps/mobile/hooks/useWrapped.ts:15` | 🔲 | S6 |
| A10 | Limpieza | 🔵 | 7 `console.log/error` de debug dejados en código de producción mobile: `useRewardedAd.ts` (×4), `apps/mobile/app/(tabs)/profile.tsx` (×1 error), `apps/mobile/lib/api.ts` (×1 error). La regla `no-console` los marca como warnings pero no falla la build. | `apps/mobile/hooks/useRewardedAd.ts`, `apps/mobile/app/(tabs)/profile.tsx:228`, `apps/mobile/lib/api.ts:180` | 🔲 | S6 |
| A11 | Dependencias | 🔵 | `@unlockhub/validators` declarada en `apps/mobile/package.json` pero sin ningún import en código fuente mobile (0 ocurrencias). ✅ **Eliminada en esta sesión** (chore: dead dep). | `apps/mobile/package.json` | ✅ | S0 |
| A12 | Dependencias | 🔵 | `pino-pretty` marcada como unused por depcheck en `apps/api` pero sí se usa en `apps/api/src/lib/logger.ts` como transport de pino en modo desarrollo. Falso positivo — depcheck no analiza strings de config dinámicos. | `apps/api/src/lib/logger.ts` | 🔲 | S6 |
| A13 | Dependencias | 🔵 | `apps/worker` muestra en depcheck muchas dependencias como "unused" (ej. `@prisma/client`, `bullmq`, `socket.io`). Falso positivo: el worker no declara sus propias deps — las importa del workspace `apps/api` via paths relativos. El Dockerfile multi-stage las incluye correctamente. | `apps/worker/package.json` | 🔲 | S6 |

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
| `apps/api` | 611 | ✅ |
| `apps/mobile` | 387 | ✅ |

> Ambas suites finalizan con "Force exiting Jest" por timers/sockets abiertos — no afecta a los resultados. Pendiente investigar (A14, S6).

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

---

## Plan de sesiones

| Sesión | Foco | Hallazgos asignados |
|---|---|---|
| **S0** | Setup tooling + línea base (esta sesión) | A11 ✅ |
| **S1** | Seguridad backend | A1, A2, A3, A4, A5, A6, A7, A8 |
| **S2** | Sync / integraciones (PSN, Steam, RA, worker) | — (pendiente análisis profundo) |
| **S3** | Performance backend (Redis, PostgreSQL, queries) | — (pendiente análisis profundo) |
| **S4** | Mobile — memory leaks, fluidez, Socket.io | — (pendiente análisis profundo) |
| **S5** | Mobile — seguridad de datos, almacenamiento | — (pendiente análisis profundo) |
| **S6** | Limpieza general (console.log, dead code, docs) | A9, A10, A12, A13 |
