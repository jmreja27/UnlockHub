# Historial de sesiones — UnlockHub

> Movido desde CLAUDE.md. La entrada más reciente va primero.

**Fecha**: 2026-06-29 (continuación — deploy opción E en producción + bug jobId ':' resuelto + T112–T115) — Solo documentación — 0 código. **Deploy del refactor T101 ejecutado en producción con orden A/B/C correcto**: **(A)** ✅ API + worker desplegados con código nuevo. **(B)** ✅ arranque limpio confirmado — worker NO imprime `"Auto-syncs restaurados"` (prueba de que el código nuevo tomó). **(C)** ✅ `cleanup-auto-sync-jobs.ts` ejecutado — 6 keys `auto-sync:*` eliminadas de Redis; `getRepeatableJobs()` total = 0. **🔴 Bug jobId ':' encontrado y resuelto durante el deploy (T112, ✅ resuelto fix-forward)**: BullMQ rechaza jobIds custom con `:` (separador interno de claves Redis) — `sync-bg:{userId}` lanzaba `"Custom Id cannot contain :"` en el primer encolado real, rompiendo `triggerManualSync`, `triggerAppOpenSync` y el cron. Causa de fondo: los tests mockean BullMQ y no validan el formato del jobId — **3.ª instancia del patrón "código muerto con tests verdes"** (batch sin consumer en T101, y ahora jobId inválido). Fix: `sync-bg:{userId}` → `sync-bg-{userId}` (guion) en los 4 sitios runtime + 20 tests; 673 tests verde; deduplicación intacta. **Sync manual verificado** post-fix: arrancó y procesó 375 juegos PSN sin errores. **Hallazgos registrados en backlog**: T113 🟡 (sync biblioteca grande tarda ~50 min — escala lineal; riesgo saturación concurrencia del worker a volumen); T114 🟡 (sync selectivo/incremental — sesión de diseño dedicada antes de implementar; es el siguiente paso natural tras T101); T115 🟡 (bug botón reset contraseña en el email no funciona — a diagnosticar deep link vs validación de token). **T108/T109/T111 confirmados cerrados** — no reabiertos. **Gate D parcialmente pendiente**: (2) sync manual ✅; (3) cron 03:00 UTC — pendiente esta noche; (1) app-open (`useAutoSync`) — pendiente hasta PL26 (~2 días). OP09 actualizado de 🔴 PENDIENTE a ✅ A/B/C completados + D parcial.

**Fecha**: 2026-06-29 (refactor auto-sync opción E — T101 cerrado de raíz, T109/T111 obsoletos) — Solo documentación y commits. **Refactor opción E implementado**: eliminados TODOS los repeat jobs de auto-sync (`sync.scheduler.ts` borrado, `restoreAutoSyncs` / `scheduleAutoSync` / `cancelAutoSync` eliminados de 5 call sites). El sync automático pasa a dos mecanismos: (1) cron diario `03:00 UTC` — `background-sync.scheduler.ts` ahora arranca `new Worker('background-sync', ...)` que consume la cola `SyncBatchJobData`; (2) express-sync al abrir la app — `POST /sync/app-open` con cooldown server-side por tier (`SET NX` en Redis `sync:appopen:{userId}`, free 60 min / premium 15 min). Las tres fuentes (cron, app-open, manual) convergen en jobId `sync-bg:{userId}` → deduplicación nativa BullMQ → nunca dos jobs del mismo usuario compitiendo por el lock. `triggerManualSync` refactorizado para converger en `sync-bg:{userId}` (antes `manual-sync:{userId}:{platform}` sin dedup). Mobile: hook `useAutoSync` (cold start + AppState foreground). Script `scripts/cleanup-auto-sync-jobs.ts` listo para limpiar los 6 repeatables `auto-sync:*` del worker viejo — ejecutar solo DESPUÉS del deploy (ver OP09). A41 (cuota Steam) revivida. Tests: 673 API + 487 mobile, verde. 3 commits: `cb5f255` (API), `1d7972d` (mobile), `8f67a9e` (script). **T101**: ✅ cerrado de raíz — el mecanismo problemático fue eliminado, no domado. **T109**: ✅ obsoleto — `scheduleAutoSync` eliminado. **T111**: ✅ obsoleto — `cancelAutoSync` eliminado. **T108**: causa estructural eliminada (ya no hay repeat jobs que puedan quedar huérfanos). **OP09 añadido** con orden de deploy obligatorio A/B/C + gate D. **PENDIENTE**: deploy con orden OP09.

**Fecha**: 2026-06-29 (T108 resuelto — repeat jobs huérfanos + hallazgo batch branch T101 muerto + nuevo T111) — Solo documentación — sin cambios de tests en esta sesión. **T108 RESUELTO**: **Parte B (código, commiteado)** — `unlinkPlatform` y `deleteAccount` cancelan el repeat job de auto-sync con `cancelAutoSync(...).catch(() => undefined)` best-effort en los 2 únicos puntos de borrado de `PlatformAccount` del código (confirmado con grep). Fix preventivo: el huérfano no puede crearse porque el repeat job se cancela antes de eliminar la cuenta. Tests: 665 API. **Parte A (operativo)** — 3 repeat jobs huérfanos del usuario `cmpxvovbm4pov13pta55e5p3j` (PSN/RA/STEAM, cuenta con 0 PlatformAccounts en BD) eliminados manualmente de Redis con `removeRepeatableByKey`. Verificado: quedan 6 repeatables, todos de cuentas vivas. Pendiente confirmar en próximo cron (03:00 UTC) que desaparecen los 9 fallos/ciclo previos. **Hallazgo crítico T101 — batch branch NUNCA ha corrido**: la revisión del cron de hoy reveló que `SyncBatchJobData` está muerto sin consumer — falta `new Worker('background-sync', ...)` en el worker. El job `sync-bg:{userId}` se encola correctamente a las 03:00 UTC pero nadie lo procesa. Los syncs de fondo actuales siguen siendo los repeat jobs de `restoreAutoSyncs` (single-platform, mecanismo anterior). **No es un fix trivial**: batch y repeat jobs competirían por el mismo lock Redis `sync:user-lock:{userId}` — no pueden coexistir. Requiere decisión de arquitectura (mantener repeat jobs vs migrar a batch) en próxima sesión. T101 actualizado en backlog con este hallazgo y marcado ⚠️. **Nuevo T111 (🔵)**: `.catch(() => undefined)` en `cancelAutoSync` se traga errores de Redis sin rastro — cambiar a `.catch(logger.warn)` para dejar pista de huérfanos que no se pudieron cancelar. 1 línea, pura observabilidad.

**Fecha**: 2026-06-28 (cierre de sesión — T106 + T107 implementados, deploy Fase A+B verificado, deuda T108-T110 mapeada) — Sesión de cierre y push. **Deploy verificado en producción**: Fase A (batch T101 — commits `19d8f0a`–`7249e4a` + `32b1019`) y Fase B (T102+T103+T104 — commit `f97b302`) desplegados juntos en Railway; ambos servicios (API + worker) arrancaron sanos. Fase B verificada en prod con sync PSN real: TTL=900 observado (TTL=889 vía `TTL sync:progress:*` → no 7200), logs "Sync iniciado platform: PSN" emitidos, clave borrada al completar (871→-2, del ejecutado en `finally`). Problema 2 ("sincronizando eterno") resuelto y verificado. **T106 implementado** (`psn.adapter.ts` + `psn.adapter.test.ts`): `withPsnTimeout()` helper privado con `Promise.race` + `setTimeout(15_000)` aplicado a las 9 llamadas a `psn-api` (la librería no expone `AbortSignal`). Nota de producción: los catch existentes (`PSN_USER_NOT_FOUND`, `PSN_PROFILE_PRIVATE`) envuelven el error de timeout — comportamiento conservador. **⚠️ T106 PENDIENTE DE VERIFICAR EN PRODUCCIÓN** — toca el camino de sync PSN real; verificar en Railway logs que el timeout de 15s no corta syncs de bibliotecas PSN legítimamente lentas (>10min = posible pero no observado). No marcar como verificado hasta confirmar. **T107 implementado** (`index.tsx` + `FeedScreen.test.tsx`): guard de página vacía en `fetchAllRemainingPages` — `break` si `data.length === 0` aunque `hasNextPage === true`, evitando bucle infinito en race condition sync concurrente + paginación. 1 test nuevo. **Deuda mapeada**: T108 (repeat jobs huérfanos de plataformas desvinculadas 🟡), T109 (scheduleAutoSync genera reencolados que el batch no cubre 🟡), T110 (ruido logs Redis persistencia RDB cada 60s 🔵). Patrón transversal identificado: bucles sin techo explícito — T101 corregido, T107 mitigado, T108/T109 pendientes. Limpiezas manuales de Redis aplicadas como paliativo durante la sesión. **T101 batch**: pendiente verificación nocturna (cron 03:00 UTC). Revisar mañana en Railway logs: job name `sync-bg:{userId}`, plataformas en serie, 0 líneas "Sync reencolado". Tests finales: **663 API (+1 T106) · 487 mobile (+1 T107) · 0 TS/lint**.

**Fecha**: 2026-06-28 (T102+T103+T104 — TTL sync:progress, finally del garantizado, logs inicio/fin) — Continuación de la sesión de debugging de hoy. Fase A (pre-check batch T101): verificados los 8 commits del batch en develop — batch branch ✅ (un lock, plataformas en serie, cero reencolado incondicional), single-platform failsafe ✅, `scripts/force-batch-sync.ts` ✅. Instrucciones de verificación manual preparadas para el usuario (6 checks con `railway shell`). Fase B (cluster de progreso): implementados T102+T103+T104 en commit único `f97b302`. **T104**: `redis.del(syncProgressKey)` consolidado en bloque `finally` dentro de `syncPlatform()` — los dos `del` dispersos (en catch del adapter + en success path) reemplazados por un único `finally` que cubre todos los caminos: éxito, error del adapter y errores en código post-adapter (prisma upsert/update que antes dejaban la clave sin limpiar). **T102**: TTL bajado de 7200 s a 900 s — constante `SYNC_PROGRESS_TTL_SECONDS = 900` en `sync.worker.ts`; el TTL se renueva en cada `onBatch` (todos los adapters tienen `syncUserBatched`), así que 15 min es tiempo de "watchdog" si el worker muere, no el máximo del sync. Peor caso verificado: PSN/Steam <10 min por plataforma → 15 min con margen. **T103**: `logger.info` con `{userId, platform}` al inicio de `syncPlatform` y con `{userId, platform, gamesUpdated, achievementsSynced}` al final (solo en éxito). **T105**: cerrado por dependencia — T102+T104 eliminan su impacto. +9 tests nuevos: T102 (TTL=900 en setex; ausencia de TTL=7200), T103 (iniciado/completado/no-completado en error), T104 (del en error path, post-adapter error path, success path). Total API: **662/662 tests · 0 TS/lint**. Mobile sin cambios: 462. Pendiente: deploy a producción + verificación manual del batch con `force-batch-sync.ts`.

**Fecha**: 2026-06-28 (debugging post-T101 — deuda TTL sync:progress identificada, ningún deploy ni cambio de código) — Sesión de inspección de producción tras el fix de T101. Objetivo inicial: verificar que el branch batch de T101 (SyncBatchJobData + jobId determinista `sync-bg:{userId}`) funcionaba correctamente con el cron `03:00 UTC`. El cron aún no había corrido desde el deploy, por lo que el batch no pudo verificarse. Durante la investigación se observó que la clave Redis `sync:progress:{userId}` "reaparecía" inmediatamente después de borrarla manualmente — inicialmente interpretado como posible clave huérfana o bug residual. **Conclusión tras análisis**: era un sync de PSN real en curso; el worker es el escritor exclusivo de esa clave (la reescribe en cada `onBatch` de `syncUserBatched`, TTL 7200 s); la API solo lee (`redis.get`). La "reaparición" era el siguiente batch del sync activo reescribiendo la clave, no un bug. El worker no emite logs entre inicio y fin de job (solo `on:completed` / `on:failed`) — esto hizo imposible distinguir "sync vivo procesando" de "sync colgado" sin inspeccionar Redis manualmente y costó ~1 h de diagnóstico. **Deuda real identificada y registrada**: (1) TTL 7200 s excesivo — si el worker muere sin ejecutar `redis.del`, la clave bloquea el sync manual del usuario 2 h; mitigación: bajar a ~600–900 s (T102 🟡). (2) Falta de logs durante el sync — añadir `logger.info` al inicio/fin de cada plataforma en `syncPlatform()` (T103 🟡). (3) Confirmar que `redis.del` está en `finally` que cubre todos los caminos de salida (T104 🔵). (4) `attempts: 3` de BullMQ resetea el TTL en cada reintento automático (T105 🔵 menor; sin efecto cuando T102+T104 estén resueltos). Socket.io no emite desde worker: ya registrado en T59 (deuda anterior). **Estado de T101**: branch single-platform + failsafe ✅ verificado en producción; branch batch (SyncBatchJobData) ⚙️ pendiente — cron 03:00 no ha corrido. `scripts/force-batch-sync.ts` listo. Limpiezas manuales de Redis aplicadas (paliativas). Ningún cambio de código, ningún deploy. Tests sin cambios: 651 API · 462 mobile · 0 TS/lint.

**Fecha**: 2026-06-27 (cierre T101 — causa raíz de reencolado en bucle de syncs concurrentes identificada) — Solo documentación — sin cambios de código ni tests. Detectado en producción durante la sesión de hoy con un tester con PSN+RA vinculadas: mientras la 1.ª plataforma sincronizaba, la 2.ª entraba en bucle de reencolado incondicional (sin jobId determinista, sin techo, sin condición de parada) contra el lock Redis `sync:user-lock:{userId}`. Cada reencolado emitía `"Sync completado"` engañoso (el adapter PSN/RA no se invoca; el retorno exitoso es del reencolado, no de un sync real). Impacto: polución de cola BullMQ + ruido de logs + retraso del sync secundario. Sin consumo de cuota externa (adapter no se invoca durante el reencolado). Cortado con restart del worker; no resucitó — era cadena en vuelo, no job persistido problemático. T101 actualizado en BACKLOG con causa raíz completa y tres opciones de fix (preferida: jobId determinista `background-sync:{userId}:{platform}`). Fix pendiente para próximo ciclo de backend.

**Fecha**: 2026-06-27 (cierre S9 — hardening SAST punto 2 verificado en producción, 0 hallazgos de seguridad abiertos) — Solo documentación — sin cambios de código ni tests en esta sesión. **T99 (CWE-310 crypto) y T100 (js-yaml EOL) descartados como falsos positivos** (ya registrados como A62/A63 en AUDIT.md sesión anterior): el scanner usó heurísticas léxicas sobre nombres de variable para T99; la verificación manual confirmó AES-256-GCM canónico con IV `randomBytes(12)` único por operación y auth tag GCM validado en decrypt. Para T100: js-yaml 3.x es transitiva exclusiva de devDependencies (`ts-jest → @jest/transform → babel-plugin-istanbul → @istanbuljs/load-nyc-config`) y no entra en el runtime del servidor (excluida por `npm ci --omit=dev`). **T98 (Dockerfile non-root, CWE-250) implementado y VERIFICADO EN PRODUCCIÓN**: `apps/api/Dockerfile` y `apps/worker/Dockerfile` corren el proceso como usuario `node` (uid 1000). Patrón: instalación/compilación (bcrypt@6 nativo, apk add/del) como root → `chown -R node:node /app` tras el último COPY → `USER node` antes del CMD. Fix adicional worker (commit `e31fc95`): `ENV XDG_CACHE_HOME=/app/.cache` — tsx intentaba escribir su caché de transpilación en el directorio por defecto (propiedad de root) y fallaba en runtime bajo non-root sin este ajuste. Verificación en Railway (env production, 2026-06-27): API arrancó sin errores de módulo nativo + login real exitoso → bcrypt@6 carga y ejecuta hash/compare bajo uid 1000 ✅. Worker arrancó limpio (5 schedulers: sync, streak, challenge, gdpr-cleanup, seed-catalog; auto-syncs restaurados count: 6); sync manual PSN ejecutado y completado ("Sync completado") → tsx transpila/escribe en `/app/.cache` bajo non-root sin fallo de permisos ✅. **Estado de seguridad global: 0 hallazgos de seguridad abiertos.** Las 8 HIGH del escaneo externo (SAST/SCA/secretos) están todas resueltas (A52-A55) o descartadas como FPs (A56, A60, A61, A62, A63); T98 cerrado (A57 ✅). Las deudas A27, A38 y A40 están formalizadas como 🔲 Fase 4 por decisión documentada — no son hallazgos abiertos sin acción. **Nuevo ítem T101 añadido al backlog (optimización, no seguridad)**: deduplicación de syncs concurrentes por usuario. Observación en producción (2026-06-27): sync manual PSN del mismo userId se reencoló y completó 3 veces en ~4s — la guarda de concurrencia reencola en lugar de descartar, generando trabajo repetido (llamadas a API de plataforma, escrituras BD, consumo de cuota multiplicados). A revisar con el código de SyncWorker delante: ¿reencolado intencional o debería ser idempotente? Impacto bajo con 4 testers; relevante a volumen. Sin urgencia. Tests sin cambios: 633 API · 486 mobile · 0 TS/lint.

**Fecha**: 2026-06-27 (cierre S8 + smoke test PL19 + promoción a Producción Google Play) — **S8 verificado en producción**: API arrancó en Railway con bcrypt@6 (env: production, login real confirmado). Worker cierra limpio vía SIGTERM — 5 schedulers registrados (sync, streak, challenge, gdpr-cleanup, seed-catalog) y activos; auto-syncs restaurados (count: 6). A2 cerrado genuinamente: `npm ls tar` y `npm ls @mapbox/node-pre-gyp` → vacíos en api y worker; bcrypt@6.0.0 instalado en ambos workspaces. Tests: **633 API · 486 mobile · 0 TS/lint**. **Smoke test PL19 (3/3 ✅)**: (1) sync en tiempo real — capa socket.io/worker tocada por S8 (bcrypt@6 en auth path, ws upgrade); sync completado sin errores, eventos `sync:progress` y `sync:complete` recibidos por el cliente; (2) navegación `useSafeBack` — pantallas de vinculación de plataformas y deep links; ningún `router.back()` crudo disparado; (3) banner + comparación de logros edge-to-edge — sin doble inset del status bar en Android 15. **PL19 (versionCode 9) promovido a Producción en Google Play** — segunda solicitud aprobada por Google; versionCode 9 promovido desde prueba cerrada a track de Producción. **OP07 (EAS Update / OTA) diagnosticado y agendado**: `expo-updates` no instalado, bloque `updates` ausente en `app.json`, perfil `production` sin `channel` en `eas.json` — OTA AUSENTE en el build actual. Los tres cambios requieren rebuild nativo (versionCode 10). Diferido ~4 días por falta de cuota EAS. Pasos exactos documentados en OP07 del BACKLOG.

**Fecha**: 2026-06-27 (lote S8 — dependencias SAST/SCA: form-data, bcrypt, multer, ws — 8 HIGH → 0 HIGH) — Segundo lote del escaneo externo (SAST + SCA + secretos). El primer lote (sesión anterior, mismo día) confirmó los FPs: `auth.service.ts:58` (hash bcrypt anti-timing, no credencial), `mock-server.js:18` CSRF (servidor mock dev-only sin Dockerfile/railway.json de producción), `ci.yml:80-82` y `.env.example` (placeholders/valores de test — `JWT_*` y `ENCRYPTION_KEY` de ceros son valores de test del runner, no credenciales de producción). Este lote ejecutó las acciones accionables y verificó los FPs restantes. **Deltas de versión**: `bcrypt@5.1.1→6.0.0` + `@types/bcrypt@5→6` en `apps/api` y `apps/worker` (A53) — bcrypt@6 usa `node-gyp-build` en lugar de `@mapbox/node-pre-gyp`, eliminando la cadena completa de tar vulnerabilidades (cierra A2); `npm ls tar` y `npm ls @mapbox/node-pre-gyp` → vacíos. `form-data@4.0.5→4.0.6` (A52, CVE-2026-12143/GHSA-fjwh-7mfq-fhwh — CR/LF injection): instalada como dep directa en `apps/api` porque los overrides npm en root no actualizaron el lock file existente (comportamiento documentado: el lock file gana al override para packages ya resueltos — mismo fenómeno que tar en A2). `multer@2.1.1→2.2.0` (A54, GHSA-72gw-mp4g-v24j + GHSA-3p4h-7m6x-2hcm DoS): el scanner marcó multer@2.1.1 como "parcheado" (FP del scanner para las CVEs antiguas), pero `npm audit` reveló 2 nuevas CVEs que sí afectan a 2.1.1 — upgrade directo a 2.2.0, no-breaking. `engine.io@6.6.8→6.6.9` + `socket.io-adapter@2.5.7→2.5.8` + `engine.io-client@6.6.5→6.6.6` (A55, GHSA-96hv-2xvq-fx4p DoS Memory exhaustion ws 8.0.0-8.20.1): las versiones patch de estos tres packages declaran `ws@~8.21.0`; instaladas como deps directas en `apps/api` y `apps/mobile` (mismo motivo: overrides npm no actualizaron el lock). `ws@^8.21.0` también añadido explícitamente en ambos workspaces para garantizar hoisting. Verificado: `npm ls ws --all` → todas las instancias en 8.21.0. **FP confirmados**: ws GHSA-58qx-3vcg-4xpx (A56) — el scanner marcó ws@8.20.1 como vulnerable, pero 8.20.1 ES la versión del fix (A1 ya lo resolvió en S1); fallo de rango inclusivo del scanner. Multer <2.0.2 (advisories antiguos) — FP del scanner para esas CVEs específicas, aunque se encontraron 2 nuevas CVEs (A54) que sí eran reales. **npm audit delta**: 46 vulns (8 HIGH, 36 moderate, 2 low) → 38 vulns (0 HIGH, 36 moderate, 2 low). -8 HIGH eliminados. Los 36 moderate residuales son uuid (fix requiere expo@46 — breaking), js-yaml@3 (EOL, transitiva de herramientas build), @opentelemetry, @babel — todos sin fix no-breaking; documentados en A59 y T100. **Root package.json overrides**: `form-data@^4.0.6`, `engine.io@^6.6.9`, `socket.io-adapter@^2.5.8`, `engine.io-client@^6.6.6` como safety nets para instalaciones desde cero. **Backlog nuevo**: T98 (Dockerfile USER no-root, CWE-250), T99 (revisión crypto.ts IV/algoritmo, CWE-310), T100 (js-yaml 3→4 EOL, SCA). AUDIT.md: entradas A52-A59 añadidas; A2 actualizado indicando cierre por A53. Tests: **633 API (baseline +1 respecto a S7 por sesiones intermedias) · 486 mobile (baseline +79 por sesiones Lote 2-5) · 0 TS/lint · 0 errores typecheck**.

**Fecha**: 2026-06-27 (incidente sync RA — credenciales mal configuradas en Shared Variables, commit `f27d40c`) — **Síntoma**: tras la separación del worker en servicio Railway independiente (V3, sesión 69), los jobs de sync de RetroAchievements empezaron a fallar en producción con ráfagas de errores en logs — múltiples jobs marcados como `failed` con `err: "Error al obtener los juegos del usuario desde RetroAchievements"` para distintos usuarios, mientras Steam y PSN seguían funcionando con normalidad. **Hipótesis inicial**: el patrón de ráfagas (fallos en masa simultáneos, no aislados por usuario) apuntaba a rate limit de la API de RA — la API pública de RetroAchievements no tiene garantías SLA y sus límites de peticiones son opacos. Razonamiento técnico coherente dado el patrón observable; pero sin el HTTP status propagado en los logs, era imposible distinguir si el 4xx era 429 (rate limit), 401 (credencial inválida) o 503 (API caída). **Causa real**: `RA_SYSTEM_USER` y `RA_SYSTEM_KEY` tenían valores incorrectos — habían quedado mal al migrar las variables de servicio individuales al sistema de Shared Variables de Railway (14 variables compartidas entre `unlockhub-api` y `unlockhub-worker` — sesión 69). El error era silencioso: RA devolvía 401 en cada llamada, que el adapter traducía a `AppError('RA_API_ERROR', 502)` sin exponer el HTTP status en el log — solo aparecía `Sync fallido err="Error al obtener los juegos..."`. **Fix (operativo, sin código)**: corregir los valores de `RA_SYSTEM_USER` y `RA_SYSTEM_KEY` en Railway dashboard → Shared Variables; sync de prueba manual confirmó la resolución — jobs de RA completados con éxito. **Mejora permanente de código (commit `f27d40c`)**: en lugar de aplicar mitigaciones de rate limit a ciegas, se implementó primero la observabilidad que faltaba. (1) `retroachievements.adapter.ts`: `fetchRaUniqueGames` captura `error.response?.status` de errores axios y lo escribe en `AppError.details` como `httpStatus`. (2) `sync.worker.ts`: el handler `worker.on('failed')` incluye ahora `err instanceof AppError ? err.details : undefined` en el objeto de log pino. Con estos cambios, futuros fallos de RA muestran `{ httpStatus: 401 }` / `{ httpStatus: 429 }` / `{ httpStatus: 503 }` directamente en Railway logs — el diagnóstico que tomó minutos tomaría segundos. **Lección**: el análisis técnico razonó correctamente (ráfagas → rate limit es la causa más frecuente de fallos en masa), pero la causa real era contextual — un error humano al configurar variables, no un problema de código ni de cuota. El logging insuficiente impedía distinguir las hipótesis. Patrón correcto: añadir observabilidad primero (logging del httpStatus), actuar después — evita aplicar mitigaciones de rate limit (throttling, cooldowns, reducción de concurrencia) a un problema que era de credencial. Ver BACKLOG T97 (health check de credenciales al arranque del worker) y OP08 (procedimiento de verificación post-cambio de credencial). Tests: **486 mobile · 632 API · 0 TS/lint** (sin cambios en tests — solo logging).

**Fecha**: 2026-06-27 (Lote 5 — cierre de auditoría: cosméticos + 2 Intl gateados + grep limpio total) — Último lote de la auditoría post-prueba cerrada. Cinco fixes de bajo riesgo e independientes entre sí. **BUG-007** (`PremiumBanner.tsx` — gateado): `formatExpiryDate` usaba `new Date(isoDate).toLocaleDateString('es-ES', {...})` — Intl latente que explotaría al activar el flag de premium en Fase 4. Reemplazado por `formatFullDate(isoDate)` (DD/MM/AAAA sin Intl). Import `formatFullDate` añadido desde `lib/formatTimeAgo`. **BUG-008** (`challenges.tsx` — gateado): `formatDate(iso, locale)` usaba `new Date(iso).toLocaleDateString(locale === 'es' ? 'es-ES' : 'en-US', {...})` — mismo problema, mismo fix. Firma simplificada a `formatDate(iso)`, `i18n` eliminado del destructuring de `useTranslation` (ya innecesario), call site actualizado. **BUG-022** — RESUELTO en Lote 2b. `premium.tsx` ya usa `safeBack` en línea 95 (`useSafeBack()`) y en el botón de cierre (línea 161). Verificado, sin cambios. **BUG-024** (`RankingItem.tsx`): `accessibilityLabel` (`"Tú: posición..."` / `"Posición {{rank}}:..."`) y `accessibilityHint` (`"Pulsa para ver el perfil..."`) hardcodeados en español — VoiceOver en inglés los anunciaba en español. Añadido `useTranslation` al componente; strings migradas a 3 nuevas claves en `rankings.*`: `item_label`, `item_label_self`, `item_hint` en ES y EN. `formatNumber(entry.xp, i18n.language)` en la interpolación para consistencia de separadores. 2 tests en `RankingItem.test.tsx` actualizados: los que comprobaban `.toContain('Tú')` y `.toContain('test_user')` ahora verifican la clave i18n correcta (`.toContain('rankings.item_label_self')` / `.toContain('rankings.item_label')`), alineados con la behavior del mock de `react-i18next`. **BUG-025** (`UserCard.tsx:34`): `source={{ uri: getCloudinaryThumb(user.avatar, 96, 96) }}` — aunque `user.avatar` es truthy, `getCloudinaryThumb` puede devolver `null` (Cloudinary URL vacía o inválida). Añadido `?? undefined` — patrón idéntico al ya usado en `RankingItem.tsx:62`. **BUG-026** (`profile/[username].tsx:87`): `analytics.profileShared()` sin `void` — floating promise no intencionada. Única llamada sin `void` en todo el proyecto (resto ya lo tienen). Corregido. **Grep Intl final**: `grep -rn "toLocaleString|toLocaleDateString|toLocaleTimeString|new Intl\." apps/mobile/app apps/mobile/components apps/mobile/hooks apps/mobile/lib` → **0 líneas** (excluyendo comentarios y el propio `lib/formatTimeAgo.ts`). La clase Intl queda 100% erradicada en todo `apps/mobile` — incluyendo código detrás de feature flags. Tests: **486 mobile (0 cambios netos) · 632 API · 0 TS/lint**. 100% mobile, sin tocar backend.

**Fecha**: 2026-06-27 (Lote 4 — BUG-016 `privacyMutation` rollback, cierre clase "mutación silenciosa") — Lote delicado por implicaciones de privacidad: si la API falla al cambiar la visibilidad del perfil, el usuario podía creer que su perfil era privado cuando en realidad no lo era (o viceversa). **Diagnóstico previo al cambio**: `privacyMutation` no tenía `onMutate` ni `onError`. Sin update optimista → el store de Zustand no se actualizaba hasta `onSuccess`; si la API fallaba, la UI simplemente revertía al estado anterior de forma silenciosa, sin feedback al usuario. Fuente de verdad: `user.profileVisibility` en `useSessionStore`. Race condition bloqueada en el `onPress` con guard `!privacyMutation.isPending`. **Fix aplicado** en `apps/mobile/app/(tabs)/profile.tsx`: (1) `onMutate`: captura snapshot `previousVisibility = current?.profileVisibility ?? 'PUBLIC'`, aplica update optimista (`setUser({...current, profileVisibility: visibility})`) y retorna el snapshot. (2) `onSuccess`: mantiene la confirmación desde la respuesta del servidor (safety net para discrepancias) + haptic. (3) `onError`: hace rollback exacto (`setUser({...current, profileVisibility: context.previousVisibility})`) y muestra `Alert.alert(t('profile.privacy_error_title'), t('profile.privacy_error_message', { visibility: prevLabel }))` donde `prevLabel` es la etiqueta i18n de la visibilidad anterior — el usuario sabe en qué estado quedó realmente su perfil. (4) `onSettled`: `invalidateQueries(queryKeys.me())` para garantizar resincronización con el backend en cualquier rama. **Efecto colateral en test F29**: el test `F29` existente no configuraba `useSessionStore.getState()`. Con el nuevo `onMutate`, `getState()` se llama ANTES de `api.patch`, por lo que sin el setup la mutación se aborta y `api.patch` no se llama → F29 fallaría. Actualizado F29 para incluir `(useSessionStore as { getState: jest.Mock }).getState = jest.fn().mockReturnValue({ user: baseUser, setUser: setUserMock })`, mismo patrón que `bannerMutation` ya usaba. **i18n**: 2 nuevas claves en ES y EN — `profile.privacy_error_title` / `profile.privacy_error_message` (con interpolación `{{visibility}}`). **3 tests nuevos** (`describe('BUG-016')` en `ProfileScreen.test.tsx`): (a) rollback — `setUserMock` es llamado al menos 2 veces; el último call restaura `profileVisibility: 'PUBLIC'`; (b) Alert — `alertSpy.mock.calls.find(c => c[0] === 'profile.privacy_error_title')` definido y segundo arg `'profile.privacy_error_message'`; (c) invalidación — `invalidateSpy` incluye `'me'` en las keys tras el fallo. **CLAUDE.md verificado**: la convención del Lote 3 (`onMutate snapshot + onError rollback + onSettled invalidate`) ya cubre este caso de forma general y mandatoria — no se añade texto redundante sobre privacidad. La regla general ya hace el rollback no-opcional para toda mutación con update optimista. Tests: **486 mobile (+3) · 632 API · 0 TS/lint**. 100% mobile, sin tocar backend.

**Fecha**: 2026-06-26 (auditoría Lote 3 — onError en 7 mutaciones silenciosas, BUG-015/017–021/023) — Tercer lote de la auditoría post-prueba cerrada: generalización del patrón de feedback de error del rewarded ad a todas las mutaciones que fallaban en silencio. Cada mutación recibe un mensaje específico a su acción (no un Alert genérico copiado). **BUG-015** (`profile.tsx` — `unlinkMutation.onError`): `Alert.alert(t('profile.unlink_error_title'), t('profile.unlink_error_message'))` + `invalidateQueries(platforms)` para resincronizar el estado real del backend. **BUG-017** (`profile.tsx` — `deleteAccountMutation.onError`): título inequívoco `profile.delete_account_error_title` ("Tu cuenta NO se ha eliminado") para que el usuario no dude del estado de su cuenta — el `onSuccess` ya llama `logout()` para el flujo normal; el `onError` no hace nada adicional excepto informar. **BUG-018** (`game/[id].tsx` — `upvoteMutation.onError`): Alert + `invalidateQueries(achievementGuides)` para resincronizar el recuento de votos. **BUG-019** (`game/[id].tsx` — `reportMutation.onError`): Alert sin invalidate (el report no tiene update optimista). **BUG-020** (`useFriendshipActions.ts` — `reject`): mutation tenía solo `onSuccess: invalidate` — migrada al patrón completo (`onMutate` snapshot + `onError` rollback + `onSettled` invalidate), alineada con el resto de mutations del hook. **BUG-021** (`useFriendshipActions.ts` — `sendRequest.onError`): ya tenía rollback (`queryClient.setQueryData`), se añade `Alert.alert` para informar al usuario del fallo. Imports añadidos al hook: `Alert` desde react-native, `useTranslation` desde react-i18next, `const { t } = useTranslation()` dentro del hook (válido — hooks pueden usar otros hooks). **BUG-023** (`notifications.tsx` — `markReadMutation.onError` / `markAllMutation.onError`): tap-to-read (`markReadMutation`) → solo invalidate silencioso (acción menor, sin update optimista, Alert sería intrusivo); "Marcar todo como leído" (`markAllMutation`) → Alert con mensaje de error (acción explícita del usuario que espera confirmación visual). **i18n**: 8 nuevas claves en ES y EN — `profile.unlink_error_title`, `profile.unlink_error_message`, `profile.delete_account_error_title`, `game.guides_upvote_error`, `game.guides_report_error`, `friends.error_send_request`, `notifications.mark_all_error`. **Tests nuevos**: `ProfileScreen.test.tsx` — BUG-015 (Alert de error tras fallo de unlink con auto-confirm del diálogo) + BUG-017 (Alert con título "cuenta NO eliminada" tras fallo del delete account). `useFriendshipActions.test.ts` — BUG-020 (reject: update optimista a `none` + rollback a `pending_received` en fallo) + BUG-021 (sendRequest: Alert.alert llamado en onError vía `jest.spyOn`). **Nota en tests**: el test BUG-021 inicialmente apuntaba a `accept.onError` por error de edición (el Edit tool encontró un bloque `onError` similar antes del de `sendRequest`); detectado y corregido en la misma sesión — coste de 1 iteración de diagnóstico. **CLAUDE.md**: convención `useMutation onError` añadida bajo "Reglas generales de desarrollo". Tests: **483 mobile (+21) · 632 API · 0 TS/lint**.

**Fecha**: 2026-06-26 (auditoría Lote 2b — erradicación completa `router.back()` crudo, 7 usos legacy) — Cierre definitivo de la clase de bug "navegación sin guard". El Lote 2 anterior cubrió las 6 pantallas de riesgo alto (deep link / push notification); este lote migra los 7 usos legacy que quedaban fuera de alcance por ser de bajo riesgo en sus flujos normales. **`(auth)/forgot-password.tsx`**: `onPress={() => router.back()}` → `onPress={safeBack}`; `useSafeBack` importado; `router` conservado (sigue siendo necesario para `router.replace('/(auth)/login')` en el estado de éxito). **`(auth)/register.tsx`**: `onPress={() => router.back()}` → `onPress={safeBack}`; `router` eliminado del import de `expo-router` (único uso era el `back()` migrado). **`premium.tsx`** (3 usos): botón de cierre en header + 2 callbacks `Alert.alert onPress` (tras compra y tras canje de puntos) — todos `() => router.back()` → `safeBack`; `router` eliminado del import; `useSafeBack` añadido antes del guard `if (!FEATURES.premium)` para que el hook se llame siempre (hook a nivel de componente, no después de early return). **`privacy.tsx`**: back button en cabecera → `safeBack`; `router` eliminado. **`components/ComingSoon.tsx`**: botón "Volver" → `safeBack`; `router` eliminado. `useSafeBack` funciona correctamente en componentes (no solo pantallas) — usa `router` del contexto de Expo Router disponible en todo el árbol. Fallback `/(tabs)` apropiado para todos los usos de `ComingSoon` (premium gateado, challenges gateado). **`PremiumScreen.test.tsx`**: mock local de `expo-router` actualizado con `canGoBack: jest.fn().mockReturnValue(true)` y `replace: jest.fn()` — patrón consistente con los 3 mocks locales actualizados en Lote 2. **Grep de verificación**: `grep -rn "router\.back()" apps/mobile/app apps/mobile/components apps/mobile/hooks` → **0 resultados** (excepto `useSafeBack.ts`). Clase de bug cerrada — la regla es ahora binaria y verificable en un comando. **CLAUDE.md**: convención actualizada de "guard obligatorio con usos legacy pendientes" a **"prohibición absoluta — 0 `router.back()` crudos en el proyecto, verificable con grep"**. Tests: **478 mobile (0 cambios netos, 478 pasan) · 632 API · 0 TS/lint**.

**Fecha**: 2026-06-26 (auditoría Lote 2 — guard `canGoBack` en 6 pantallas, hook `useSafeBack`) — Segundo lote de la auditoría post-regresión BUG-02 (vinculación de plataformas). La regresión de BUG-02 demostró que `router.back()` sin guard saca al usuario de la app cuando no hay historial en el stack (entrada por deep link, push notification, `router.replace` desde onboarding). El Lote 1 (sesión anterior) añadió el guard en steam/ra/psn con una función local `navigate()` triplicada. Este lote: (1) extrae el patrón a un hook compartido `hooks/useSafeBack.ts` que devuelve `safeBack()` con el guard `canGoBack()` → `back()` / `replace('/(tabs)')`; (2) refactoriza steam/ra/psn para usar el hook en lugar de la función local duplicada; (3) aplica el guard a los 6 screens con `router.back()` sin guard: **BUG-009** `game/[id].tsx` (accesible por deep link), **BUG-010** `profile/[username].tsx` (deep link a perfil público), **BUG-011** `wrapped/[year].tsx` (2 puntos — rama año inválido + header, accesible desde notificación de Wrapped), **BUG-012** `user-game/[username]/[gameId].tsx`, **BUG-013** `link-platform/xbox.tsx` (2 puntos — Alert OK de éxito + botón Volver, accesible desde onboarding con `router.replace`), **BUG-014** `notifications.tsx` (accesible desde push notification). 8 puntos corregidos en 6 archivos. `user-game/[username]/[gameId].tsx` y `notifications.tsx` eliminan el import `useRouter` que solo servía para llamar `.back()`. Tests: hook `useSafeBack.test.ts` (2), guard tests añadidos a `GameDetailScreen` (+2), `PublicProfileScreen` (+2, `fireEvent` añadido al import), `UserGameScreen` (+2), nuevos `WrappedScreen.test.tsx` (4), `NotificationsScreen.test.tsx` (2, mockea `useInfiniteQuery` para evitar estado `isLoading=true` que oculta el header), `LinkXboxScreen.test.tsx` (2). `canGoBack: jest.fn().mockReturnValue(true)` añadido al mock global de `expo-router` en `jest.setup.ts` y a los 3 mocks locales de screens existentes (GameDetail, PublicProfile, UserGame). CLAUDE.md actualizado: convención explícita que obliga a guard + hook `useSafeBack` en todo `router.back()`, comando grep de detección de reincidencia. Tests: **478 mobile (+16) · 632 API · 0 TS/lint**.

**Fecha**: 2026-06-26 (auditoría Lote 1 — eliminación Intl/toLocaleString restantes, BUG-001–006) — Barrido proactivo de 6 crashs potenciales en Hermes que el barrido anterior (2026-06-25) no capturó porque se centró en `Intl.*` pero omitió `Number.prototype.toLocaleString()` y `Date.prototype.toLocaleDateString()`. **BUG-001** (`RankingItem.tsx`): 3× `entry.xp.toLocaleString()` → `formatNumber(entry.xp)` (2 en accessibilityLabel + 1 texto visible). **BUG-002** (`rankings.tsx`): 3× `(myRanking.xp ?? 0).toLocaleString()` → `formatNumber(..., i18n.language)` (2 en accessibilityLabel + 1 texto); `i18n` añadido al destructuring de `RankingsScreen`. **BUG-003** (`wrapped/[year].tsx`): 3× `totalXpGained.toLocaleString()` — 1 en `buildShareText` (nueva firma con param `lang`, pasado como `i18n.language`) + 2 en StatCard `value`/`sub`. **BUG-004** (`profile/[username].tsx`): 2× `compareData.xpDiff.toLocaleString()` → `formatNumber(..., i18n.language)`; lógica de signo conservada (`+${...}` para positivo, `formatNumber` maneja el guion para negativos). **BUG-005** (`profile.tsx`): `new Date(account.lastSyncedAt).toLocaleDateString()` → `formatFullDate(account.lastSyncedAt)`. Nueva función `formatFullDate(dateStr, _lang?)` añadida a `lib/formatTimeAgo.ts`: divide el ISO string por `'T'` antes de `-` para evitar dependencia de zona horaria del dispositivo; `padStart(2,'0')` en día y mes; devuelve `DD/MM/AAAA` con año. 6 tests: ISO datetime, fecha plana, dígito simple, fin/inicio de año, invariante de año. **BUG-006** (`UserCard.tsx`): 1× `user.xp.toLocaleString()` → `formatNumber(user.xp, i18n.language)`. **Efecto colateral en tests**: `RankingsScreen.test.tsx` usaba `toLocaleString()` en assertions — devolvía resultados inconsistentes en Node.js (dot para 367155, sin separador para 1200) respecto al componente que ahora usa `formatNumber(..., 'en')` (comma). 5 assertions migradas a `formatNumber(value, 'en')` alineadas con el mock i18n. **Convención reforzada** en CLAUDE.md: cubre explícitamente `toLocaleString()`, `toLocaleDateString()`, `toLocaleTimeString()`; añade comando grep de verificación. Tests: **462 mobile (+6) · 632 API · 0 TS/lint**. 100% mobile, sin tocar backend.

**Fecha**: 2026-06-25 (segunda ronda prueba cerrada — BUG-01 a MEJ-02 + assets de marca + hallazgo rareza PSN) — Sesión de corrección de feedback de testers e incorporación de assets de producción. **BUG-01 (crash notificaciones — Intl.RelativeTimeFormat)**: Sentry capturó `TypeError: undefined is not a function` en `Intl.RelativeTimeFormat` en dispositivos Android reales durante la segunda ronda de prueba cerrada. Causa raíz: soporte de Intl no garantizado en todos los builds de Hermes — el comportamiento real depende de la versión exacta de Hermes compilada y del dispositivo. Fix: creada `lib/formatTimeAgo.ts` con las funciones `formatTimeAgo`, `formatDayMonth` y `formatNumber` sin ninguna dependencia de Intl; barrido de los 5 usos de APIs Intl en mobile (`Intl.RelativeTimeFormat`, `Intl.NumberFormat`, `Intl.DateTimeFormat`, `toLocaleString`) y reemplazados por las utilidades propias. Convención añadida a CLAUDE.md y a esta misma sesión se añadió `formatBirthDate` (ver MEJ-01). **BUG-02 (vinculación plataformas — navegación rota + PSN sin feedback de éxito)**: Las tres pantallas de vinculación (`steam.tsx`, `ra.tsx`, `psn.tsx`) usaban `router.replace('/onboarding')` como destino de éxito sin distinción de flujo. Cuando el usuario llegaba desde el perfil (no desde el onboarding), el historial del stack quedaba vacío: el botón "Volver" no respondía y el back físico Android sacaba de la app. Además, PSN no mostraba ningún Alert de confirmación al completar la vinculación correctamente (Steam y RA sí lo hacían), por lo que el tester interpretaba el silencio como un fallo. Fix: guard `canGoBack()` añadido en las tres pantallas — si hay historial en el stack, `router.back()`; si no (flujo desde onboarding), `router.replace('/(tabs)')`. PSN: añadido Alert de confirmación de éxito alineado con el patrón de Steam/RA; feedback visible de errores de vinculación. La vinculación PSN sí funcionaba en todos los casos — el NPSSO del sistema fue verificado como vigente. Archivos: `apps/mobile/app/link-platform/psn.tsx`, `steam.tsx`, `ra.tsx`. **MEJ-01 (date picker nativo + placeholder email neutro)**: Campo de fecha de nacimiento en registro reemplazado por `Pressable` → `@react-native-community/datetimepicker@8.6.0` (nueva dependencia, versión exacta sin caret). Android: diálogo nativo de calendario con `maximumDate` fijado al corte de 16 años (validación de edad mínima intacta). iOS: spinner inline con botón "Confirmar". Nueva función `formatBirthDate(date: Date)` añadida a `lib/formatTimeAgo.ts` — devuelve `DD/MM/AAAA` sin ninguna dependencia de Intl; `formatForApi()` local en `register.tsx` convierte a `YYYY-MM-DD` para la API. Placeholder de email actualizado en los tres campos de email de la app: `"tu@email.com"` → `"nombre@ejemplo.com"` (ES) / `"name@example.com"` (EN) en login, registro y recuperación de contraseña. `jest.setup.ts` con mock de `@react-native-community/datetimepicker`; 2 tests actualizados en `RegisterScreen.test.tsx`. **BUG-03 (rewarded ad — botón sin feedback de estado de carga)**: El botón "Ver anuncio" estaba levemente atenuado cuando el anuncio cargaba (`isReady = false`) pero seguía siendo pulsable, mostrando un Alert de "anuncio no disponible" inesperado. Fix: `disabled` extendido de `isOnCooldown || isWatchingAd` a `isOnCooldown || isWatchingAd || !isAdReady`; `accessibilityState.disabled` actualizado en consecuencia; texto del botón cambia a `points_watch_ad_loading` ("Cargando anuncio...") cuando `!isAdReady` (sin cooldown); opacidad 0.6 cuando deshabilitado por cualquier causa. Nuevas claves i18n `points_watch_ad_loading` en ES y EN. 2 tests actualizados en `ProfileScreen.test.tsx`. Archivos: `apps/mobile/app/(tabs)/profile.tsx`, `es.json`, `en.json`. **MEJ-02 (layout comparación — nombre amigo truncado + nombres de logros no centrados)**: En la pantalla de comparación de logros (`user-game/[username]/[gameId].tsx`), la columna del nombre del amigo en la cabecera tenía ancho fijo `w-9` (36px) → usernames de más de 4-5 caracteres se cortaban visiblemente. Fix: `className="w-9 items-center"` → `style={{ minWidth: 36, maxWidth: 100, alignItems: 'center' }}` con `ellipsizeMode="tail"` controlado. Además, los nombres de logros en `CompareRow` estaban alineados a la izquierda entre dos checks — añadido `text-center` en las columnas de título y XP. Archivo: `apps/mobile/app/user-game/[username]/[gameId].tsx`. **Assets de marca (commit ec44b01)**: Icono de app y splash screen reemplazados — de assets placeholder/preview a los assets finales de la marca UnlockHub. Incluye verificación de dimensiones, peso y ausencia de canal alfa (requerimiento de Play Store en iconos PNG). **Hallazgo rareza PSN**: Al analizar F45/F46 se verificó que `trophyEarnedRate` (string, ej. `"2.9"` = 2,9 % de jugadores) y `trophyRare` (bucket Sony: 0=Ultra Rara, 1=Muy Rara, 2=Rara, 3=Común) están disponibles en las respuestas de `getTitleTrophies()` y `getUserTrophiesEarnedForTitle()` de psn-api — las mismas llamadas que el sync de PSN ya ejecuta. Corrige la premisa inicial de F46 (PSN SÍ expone rareza real, no solo el tipo de trofeo). Desbloquea distribución de rareza en F45 y la comparativa de rareza cross-plataforma en XP. Nota: la API PSN v2 (PS5) puede requerir contexto de usuario que haya jugado el título para devolver `trophyEarnedRate` — verificar al implementar F46. Documentado en BACKLOG.md F46 y en sección PSN de CLAUDE.md. Tests: **412 mobile · 632 API · 0 TS/lint** (tests actualizados, no añadidos netos — las correcciones reemplazaron tests existentes de RegisterScreen y ProfileScreen).

**Fecha**: 2026-06-21 (fix XP Wrapped + listing Play Store + solicitud producción a Google) — **Fix BUG XP Wrapped (código — solo backend, T96)**: el campo "XP ganados" del Wrapped mostraba 0 porque `totalXpGained` se calculaba sumando `UserPoint.amount` filtrado por `createdAt` (fecha del sync — siempre registrada en 2026 aunque los logros fueran de 2025). Opción B aplicada: XP anual = suma de `normalizedPoints` de los `UserAchievement` del período (filtrados por `unlockedAt`, la fecha real del desbloqueo) + XP de racha (`UserPoint` con `reason: 'STREAK'` filtrados por `createdAt`, correcto por construcción — la racha se concede el día que ocurre). Fix en `apps/api/src/services/wrapped.service.ts`: `loadUserAchievements` filtra por `unlockedAt: { gte: start, lte: end }` con `select` explícito de `normalizedPoints`; `achievementXp = sum(ua.achievement.normalizedPoints)`; `streakXpResult = _sum(UserPoint.amount, reason: STREAK, createdAt: { gte, lte })`; `totalXpGained = achievementXp + streakXpResult`. `prevStats.totalXpGained` se corrige solo porque llama a la misma función con el período anterior. Verificado en device: Wrapped 2025 muestra 42.200 XP (antes: 0). Rama `fix/wrapped-xp-zero` → merge a `develop` (commit `04e8a9c`). Deploy automático por Railway. **Listing Play Store (estado, sin código)**: ficha girada hacia lo social — nombre "UnlockHub: Logros y Trofeos"; descripción breve y completa con rankings, comparación con amigos y Wrapped liderando (en lugar de tracking, que ya ofrecen Exophase/TrueAchievements). Icono y gráfico de funciones subidos. 5 capturas seleccionadas y ordenadas: (1) comparación con amigo, (2) Wrapped 2025, (3) rankings, (4) comparación de logros, (5) biblioteca. Descartadas: modal "Retar amigo" (renderizado a medias) y perfil con banner de portada casero. Consentimiento de Seithek obtenido para mostrar su gamertag en capturas públicas. TestUser99 no eliminado de capturas — renombrar username no es posible actualmente (ver F44 en BACKLOG). **Solicitud de producción (estado)**: enviada a Google (2026-06-21) tras 14 días de prueba cerrada con 12 testers. Formulario respondido con la verdad: reclutamiento personal, bug `friend_challenged` detectado y corregido durante la prueba, audiencia = cazadores de logros, estimación de descargas = 0–10.000. Pendiente: aprobación de Google. **Decisiones de producto**: puntos canjeables comunicados en el lanzamiento con "próximamente" (sistema de cosméticos F30–F37 sigue en Fase 3/4 — no comprometer fecha sin datos de conversión). Nota XP Wrapped: el cálculo de XP anual NO usa el aggregate genérico de UserPoint; deriva de `normalizedPoints` de logros (por `unlockedAt`) + STREAK (por `createdAt`). Tests: **412 mobile · 632 API · 0 TS/lint** (esta sesión solo docs).

**Fecha**: 2026-06-17 (diagnóstico PostHog EU + AdMob plugin fix + smoke test preview + bugfix challenge friend_challenged) — Sesión de diagnóstico, smoke testing y bugfix de producción. **Diagnóstico PostHog — causa raíz y fix**: la cuenta PostHog creada era US (us.posthog.com); `posthog-react-native` con `host` omitido apunta por defecto a `eu.i.posthog.com`. Resultado: todas las llamadas desde el cliente fallaban silenciosamente sin errores visibles. Solución: nuevo proyecto EU en PostHog (proyecto 203333) + EAS secret `EXPO_PUBLIC_POSTHOG_API_KEY` actualizado con la key EU. `analytics.ts` configurado con `host: 'https://eu.i.posthog.com'` explícito. Cuenta US original queda obsoleta — deuda menor de limpieza (OP06 pendiente). **Mejora de flush**: `flushAt: 10` + `flushInterval: 5000` en la inicialización de `PostHog` en `analytics.ts` — más agresivos que los defaults (20/10000 ms). El SDK ya hace flush automático en cambio de `AppState` (active/background); no se añadió listener manual para evitar duplicación. `analytics.flush()` añadido como método público en el wrapper y llamado en el handler de cierre de `_layout.tsx`. **AdMob plugin fix**: plugin `react-native-google-mobile-ads` movido de la sección `expo.android.googleMobileAdsAppId` (campo ignorado en SDK 55) a `expo.plugins[react-native-google-mobile-ads, { androidAppId, iosAppId }]` — `APPLICATION_ID` ahora se inyecta correctamente en el `AndroidManifest.xml`. Sin este fix los banners y rewarded ads fallaban en builds de release sin error visible. Ambas mejoras incluidas en commit anterior 09e17b7 (`fix(mobile): PostHog flush config + AdMob plugin en expo.plugins`). **Smoke test build preview — resultados reales**: (1) PostHog EU ✅ — verificado en panel `us.i.posthog.com/project/203333`: eventos `app_open` e `identify` con userId real (`cmpc71...`) capturados; (2) A49 UMP/CMP ✅ — formulario de consentimiento aparece antes de cualquier banner en device real, `consentResolved` fluye correctamente; (3) AdMob banners ✅ — banners Home y Search cargan en preview, fix de `APPLICATION_ID` en manifest confirmado; (4) Sync Steam A51 — verificación en device imposible (sin cuenta Steam con >100 juegos); cubierto por tests automáticos; se confirmará en producción vía logs pino `{ userId, total, syncing, skipped }`. **Bugfix `friend_challenged` — bug crítico de producción**: el cliente enviaba `{ friendId }` en el body de `POST /api/v1/achievements/:id/challenge`; el backend (`challenge.controller.ts`) esperaba `{ friendUserId }` en el schema Zod → 400 en todas las llamadas → feature 100% rota en producción desde el inicio. Opción A elegida: fix de 3 líneas en el cliente (`game/[id].tsx`) — campo renombrado a `friendUserId` en `mutationFn` y en el argumento del call site; backend intacto (contrato correcto, no tocar). `analytics.friendChallenged(vars.achievementId)` añadido en `onSuccess` — cierra parcialmente T95 (el método `friendChallenged` ya existía en `analytics.ts` desde commit 09e17b7). Test de regresión en `GameDetailScreen.test.tsx`: verifica que `api.post` recibe `{ friendUserId }` (no `{ friendId }`) al completar el flujo de selección de amigo en el modal. **Barrido de contratos cliente↔backend**: 16 endpoints de mayor tráfico revisados (autenticación, sync, biblioteca, rankings, amigos, perfil, notificaciones, rewarded ad) — `friend_challenged` era el único desajuste real. El endpoint `POST /api/v1/friends` acepta tanto `username` como `receiverId` vía `z.union` — deliberado, no un bug. **Tests finales**: **412 mobile (+1 regresión) · 632 API · 0 TS/lint**.

**Fecha**: 2026-06-13 (analítica de retención pre-lanzamiento) — Instrumentación PostHog mínima para medir retención y activación desde el primer día. **`lib/analytics.ts`**: extendido con `identify(userId, properties)`, `reset()`, `appOpen()` y `syncCompleted(platform)` — el módulo almacena ahora un `PosthogClient` con los tres métodos (`capture`, `identify`, `reset`); el stub no-op cubre los tres; modo silencioso intacto si `EXPO_PUBLIC_POSTHOG_API_KEY` no está definida. **`hooks/useAuth.ts`**: `analytics.identify(user.id, { isPremium, level })` llamado en `loginMutation.onSuccess` y `registerMutation.onSuccess`; `analytics.reset()` llamado en ambas ramas de `logoutMutation` (`onSuccess` y `onError`) — ninguna sesión puede quedar identificada tras logout incluso si la llamada al servidor falla. **`app/_layout.tsx`** (`SessionRestorer`): `analytics.appOpen()` en el `useEffect` antes de `restore()` — se emite una vez por cold start independientemente de si hay sesión; `analytics.identify(user.id, ...)` inmediatamente después de `setSession` si la sesión se restaura con éxito. **Eventos ya tipados conectados** (una línea cada uno): `analytics.onboardingCompleted()` en `onboarding.tsx:finish()`; `analytics.platformLinked('STEAM'|'RA'|'PSN')` en el `onSuccess` de las tres pantallas de vinculación; `analytics.wrappedShared(period)` en `wrapped/[year].tsx:handleShare()` antes de `Share.share()`. **`hooks/useSyncProgress.ts`**: `analytics.syncCompleted(event.platform)` en `onSyncComplete` (evento Socket.io de finalización de sync). **`.env.example`**: `EXPO_PUBLIC_POSTHOG_API_KEY=phc_XXXX...` añadido con instrucción de configurar como EAS secret — la key ya está activa en Railway (N4 ✅) pero no estaba documentada como secret EAS para builds de producción. **Estado EAS secret**: no determinable desde el repo — verificar en expo.dev → proyecto → Secrets que `EXPO_PUBLIC_POSTHOG_API_KEY` esté configurada antes de la próxima build. **Eventos NO instrumentados** (aplazados a T95): `achievement_viewed`, `premium_*`, `points_redeemed`, `friend_challenged`, `guide_written`, `rewarded_ad`, `search`, `profile_shared`. **Tests**: nuevo `__tests__/hooks/useAuth.test.ts` con 4 tests: `identify` llamado con `(userId, { isPremium, level })` tras login; `identify` llamado tras register; `reset` llamado tras logout exitoso; `reset` llamado incluso cuando logout falla en el servidor. Tests: **411 mobile (+4) · 632 API · 0 TS/lint**.

**Fecha**: 2026-06-13 (auditoría S7 — A51 tope de juegos Steam por sync) — Control de costes pre-lanzamiento: sin tope, un usuario con 3 000+ juegos podía consumir >9 000 llamadas a la Steam API (100 000/día) en un solo sync. **`apps/api/src/config/steamQuota.ts`**: añadida constante `STEAM_MAX_GAMES_PER_SYNC = 100` junto a los umbrales 80/90 % (A41) — toda la política de cuota Steam en un único módulo. **`apps/api/src/platforms/steam.adapter.ts`**: (1) `rtime_last_played?: number` añadido a `SteamOwnedGame` — campo devuelto por `GetOwnedGames` con `include_appinfo=true`; (2) nuevo método privado `sortEligibleByActivity(games)` — ordena por `rtime_last_played` desc (señal primaria: último timestamp de juego) + `playtime_forever` desc como desempate cuando el timestamp es igual; (3) `syncUser` y `syncUserBatched` aplican `sortEligibleByActivity(eligible).slice(0, STEAM_MAX_GAMES_PER_SYNC)` antes de llamar a `processGames`; log pino INFO `{userId, total, syncing, skipped}` cuando hay omisiones; el `total` de `onBatch` se ajusta al número real de juegos procesados para que el progreso del cliente llegue a 100 % al terminar el intento. **Coherencia del contador** (A24): `incrementSteamApiCounter` solo se llama dentro de `cachedFetch` en los fetchers de los juegos efectivamente procesados — los omitidos no generan llamadas a la API ni incrementos de contador. **`syncUserExpress`** no modificado: ya tiene su propio tope de 20 juegos y ordenación por `playtime_forever`. **Decisión de reporting**: `gamesSkipped` no se propaga al evento `sync:complete` de Socket.io ni al mobile (requeriría cambios en `SyncCompleteEvent` en packages/types, el worker y al menos un hook mobile — coste alto); se loggea vía pino y se anota la decisión en AUDIT.md. Deuda de reanudación con cursor: T90 (Fase 4). **3 tests nuevos** en `steam.adapter.test.ts`: `≤100 juegos → todos procesados (game.upsert × 80)`; `>100 juegos → exactamente los 100 más recientes por rtime_last_played (appids 1-100 procesados, 101-150 omitidos)`; `contador Redis solo refleja juegos procesados (301 incr para 100 juegos, no 451 para 150)`. Tests: **632 API (+3) · 407 mobile · 0 TS/lint**.

**Fecha**: 2026-06-13 (auditoría S6b — cierre limpieza) — Cierre de la sesión S6b (limpieza post-lanzamiento). **A22** 🔵 — `triggerExpressSync`: cuando el lock Redis no estaba disponible, el express sync se descartaba silenciosamente. Fix: cuando el lock falla, se llama `queueInitialSync(userId, platform)` como fallback antes de retornar — el trabajo nunca se pierde. Cuando el lock está disponible el comportamiento no cambia (queueInitialSync sigue siendo responsabilidad del controller, sin doble encolado). 2 tests nuevos en `sync.worker.test.ts`. **A39** 🔵 — `loadUserAchievements` en `wrapped.service.ts`: migrado de `include: { achievement: { include: { game: true } } }` a `select` explícito con los campos realmente usados (5 de achievement: `title`, `iconUrl`, `rarity`, `normalizedPoints`, `platform`; 4 de game: `id`, `title`, `iconUrl`, `platform`). Elimina carga de 6+ campos no usados de `Achievement` y equivalentes de `Game`. Tipo `UserAchievementFull` actualizado con `Prisma.UserAchievementGetPayload<{ select: {...} }>`. 24 tests wrapped existentes siguen en verde. **A9** 🔵 — `// eslint-disable-next-line security/detect-unsafe-regex` con justificación en `useWrapped.ts:15` (regex `/^\d{4}(-\d{2})?$/` — sin cuantificadores anidados, sin riesgo de backtracking). **A12** 🔵 — `apps/api/.depcheckrc` creado con `ignores: [pino-pretty]` (referencia dinámica en logger.ts — falso positivo de depcheck). **A13** 🔵 — `apps/worker/.depcheckrc` creado con ignores de 6 deps workspace (falso positivo: depcheck no resuelve imports de workspace internos). **Barrido de higiene**: madge 0 ciclos (375 archivos) ✅; i18n ES=EN 627 claves 0 diff ✅; queryKeys 0 literales en código de producción ✅; `usePublicFeed` es hook huérfano (sin pantalla consumidora — feature anticipatoria, no se elimina). **A38/A40** formalizados como 🔲 Fase 4 en AUDIT.md. **Reconciliación de sesiones**: S6a (A49, A41, A2) + S6b (A9, A12, A13, A22, A37, A39, barrido) — eliminadas etiquetas S6c/S6d que habían surgido ad-hoc. **Tests finales**: **629 API (+2) · 407 mobile · 0 TS/lint**.

**Fecha**: 2026-06-13 (auditoría S6d — A37 getPublicFeed cursor-based) — Migración de `getPublicFeed` de offset pagination a cursor-based, replicando el patrón ya existente en `getFriendsFeed`. **Causa raíz del hallazgo**: `prisma.activityEvent.count()` sin filtro WHERE + `skip` creciente — con millones de filas el `count(*)` full-scan degrada a O(n) y el skip fuerza un index scan costoso. **Backend**: `getPublicFeed(page, limit)` → `getPublicFeed(limit, cursor?)` — firma idéntica a `getFriendsFeed`; devuelve `CursorPaginatedResponse<ActivityEvent>` (`{ data, nextCursor }`); filtro `id: { lt: cursor }` en el `where`; eliminados `count()`, `skip` y el import `PaginatedResponse`. Controller: `getPublicFeedHandler` pasa a usar `feedQuerySchema` (ya existía en el mismo fichero para `getFriendsFeedHandler`) en lugar de `paginationSchema` — eliminado el import `paginationSchema` de `@unlockhub/validators`. Route `/api/v1/activity/public` sin cambios. **Mobile**: nuevo `hooks/usePublicFeed.ts` con `useInfiniteQuery<CursorPaginatedResponse<ActivityEvent>>`, `getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined`, `staleTime: 60_000`, URL cursor en query string. `queryKeys.publicFeed()` añadida a `lib/queryKeys.ts`. **Decisión de compatibilidad — cutover limpio**: grep confirmó que `GET /api/v1/activity/public` no tenía consumidor activo en mobile (ningún archivo en `apps/mobile` referenciaba el endpoint), por lo que no existe riesgo de skew entre APK en producción y la nueva API. Si en el futuro se lanzara un APK que consuma el endpoint viejo antes de que Railway despliegue esta versión, el endpoint ya estaría actualizado (Railway autodeploy de develop) — orden de despliegue API→mobile en cualquier caso. Se descartó tolerar el param `page` porque no hay APKs activos que lo usen. **Tests API**: 4 nuevos en `activity.service.test.ts` (nextCursor correcto con página llena; nextCursor null en última página; cursor pasado como filtro `id lt`; sin filtro cuando no hay cursor; y el test de "no llama a count()" usa el hecho de que `prisma.activityEvent.count` no existe en el mock — si se llamara lanzaría error). 1 test existente en `phase2.controllers.test.ts` actualizado (firma `(1, 20)` → `(20, undefined)` + query `{ page, limit }` → `{ limit }`). **Tests mobile**: 5 nuevos en `__tests__/hooks/usePublicFeed.test.ts` (`primera página y expone eventos`; `acumula páginas con act(fetchNextPage)`; `se detiene cuando nextCursor null`; `pasa cursor en URL de segunda página`; `expone isError en fallo`). El `act()` en `fetchNextPage` es requerido por React 19 (patrón ya establecido en `useSyncAll.test.ts`). Tests: **627 API (+4) · 407 mobile (+5) · 0 TS/lint**.

**Fecha**: 2026-06-13 (auditoría S6c — A2 cierre CVE tar) — Investigación exhaustiva para cerrar el hallazgo A2 (5 CVEs HIGH en `tar`, transitiva de `@mapbox/node-pre-gyp@1.0.11` vía `bcrypt@5.1.1`). **Análisis de la cadena**: `tar@6.2.1` instalado por `@mapbox/node-pre-gyp@1.0.11` que declara `"tar": "^6.1.11"`. Todos los CVEs del rango `<=7.5.10` quedan cubiertos por tar 7.5.11+. **Intentos de override (4 variantes, todas fallidas en npm 11.12.1)**: (1) override plano `"tar": "^7.5.11"` en root `package.json` — ignorado; (2) override anidado `@mapbox/node-pre-gyp > tar` — ignorado; (3) eliminación del `package-lock.json` + `npm install` desde cero — npm regeneró el lock con tar@6.2.1; (4) eliminación física de `node_modules/tar`, `node_modules/@mapbox` y `node_modules/bcrypt` + `npm install` — npm descargó e instaló tar@6.2.1 de nuevo. **Conclusión técnica**: npm no aplica overrides que impliquen un salto de major version (6.x→7.x) cuando el paquete dependiente (`@mapbox/node-pre-gyp`) tiene un rango incompatible (`^6.1.11`). El mecanismo de overrides es efectivo para correcciones dentro del mismo major, no para upgrades disruptivos de terceros. `npm audit fix --force` fue descartado explícitamente. **Riesgo aceptado documentado**: tar solo se ejecuta durante `npm install` (extracción del binario precompilado de bcrypt) — NO se importa ni se ejecuta en el runtime del servidor Express. Superficie de ataque real: atacante con capacidad de comprometer el registro npm bajo HTTPS+SHA-512. **Alternativa futura**: `bcrypt@5.1.1 → 6.0.0` (usa `node-gyp-build`, elimina `@mapbox/node-pre-gyp` y `tar` por completo, API `hash/compare` sin cambios) — diferida a auditoría de dependencias post-lanzamiento. Todos los ficheros revertidos a estado git original (package.json, package-lock.json, node_modules). Tests: **623 API · 402 mobile · 0 errores TS/lint** (sin cambios de código en esta sesión).

**Fecha**: 2026-06-13 (auditoría S6b — A41 cuota Steam 90 % en manual sync) — Implementación del umbral de cuota Steam al 90 % en el path de sync manual, que CLAUDE.md documentaba pero no existía en código. **Nuevo fichero** `apps/api/src/config/steamQuota.ts` centraliza las 3 constantes (`STEAM_DAILY_LIMIT`, `STEAM_BACKGROUND_SYNC_THRESHOLD=0.8`, `STEAM_MANUAL_SYNC_THRESHOLD=0.9`) para evitar duplicación; `background-sync.scheduler.ts` migrado a importarlas. **`triggerManualSync`**: antes de encolar, si `platform === 'STEAM'`, lee el contador Redis del día; si ≥ 90 % y el usuario tiene otras plataformas vinculadas → libera el cooldown Redis + devuelve `{ skippedByQuota: true }` (HTTP 200 — no es un error, el usuario recibirá sus otras plataformas sincronizadas); si Steam es la única plataforma → libera cooldown + lanza `AppError('STEAM_QUOTA_EXCEEDED', 429)`. El cooldown se libera en ambos casos para no penalizar al usuario por una limitación del sistema. **Controller**: 200 para `skippedByQuota`, 202 para sync real encolado. **Mobile**: `useSyncAll` detecta los dos escenarios — `STEAM_QUOTA_EXCEEDED` (rejected con `ApiRequestError`) y `skippedByQuota: true` (fulfilled) — y expone `steamQuotaState: 'exceeded'|'skipped'|null`. **`SyncStatusBar`**: aviso no bloqueante con `testID="sync-steam-quota-warning"`, rojo para exceeded, ámbar para skipped; se muestra después del aviso de sync largo y solo cuando no hay sync activo. i18n ES/EN. **Docs**: `docs/BACKLOG.md` — T89 (A41 ✅) + T90 nueva deuda de escalabilidad (paginación cursor en sync Steam por usuario, Fase 4). **Tests**: 3 nuevos en `sync.service.test.ts` (< 90 % normal, ≥ 90 % multi-plataforma, ≥ 90 % solo Steam) + 2 nuevos en `useSyncAll.test.ts` (exceeded, skipped) + 1 fix `SyncStatusBar.test.tsx` (mock `useSyncAll` faltaba `steamQuotaState: null`). Tests: **623 API (+3) · 402 mobile (+2) · 0 TS/lint**.

**Fecha**: 2026-06-13 (auditoría S6a — A49 UMP consent vs AdBanner) — Fix GDPR/Play Store: `useGdprConsent` y `SessionRestorer` corren en paralelo al arrancar; si la sesión se restaura primero, `AdBanner` podía renderizarse antes de que el flujo de consentimiento UMP terminara. Implementación: (1) `consentResolved: boolean` (inicial `false`) + `setConsentResolved` añadidos a `preferencesStore` — el campo no se persiste en AsyncStorage porque el flujo UMP debe correr en cada arranque. (2) `useGdprConsent` ahora importa `usePreferencesStore` y llama `setConsentResolved(true)` en bloque `finally` de `requestConsent()` (cubre las dos ramas: formulario mostrado y `status !== REQUIRED`) y también en el early return cuando el módulo nativo `react-native-google-mobile-ads` no está disponible. (3) `AdBanner` añade `const consentResolved = usePreferencesStore((s) => s.consentResolved)` y hace `if (!consentResolved) return null` antes de renderizar cualquier anuncio — el gate es centralizado en el componente, sin tocar los 4 placements (home, search, rankings, friends). 5 tests nuevos: 2 en `AdBanner.test.tsx` (renderiza null cuando `consentResolved=false`; renderiza cuando `consentResolved=true`) + 3 en nuevo `__tests__/hooks/useGdprConsent.test.ts` (NOT_REQUIRED → `setConsentResolved(true)` sin showForm; REQUIRED → showForm llamado y luego `setConsentResolved(true)`; error en requestInfoUpdate → `setConsentResolved(true)` igualmente). Tests: **400 mobile** (+5) · 620 API · 0 errores TS/lint.

**Fecha**: 2026-06-12 (cierre bucle INC-01 — neutralización _s3) — El archivo `20260612000000_add_performance_indexes_s3/migration.sql` seguía en el repo con el SQL `CREATE INDEX CONCURRENTLY` original. Cada push a develop disparaba un autodeploy que volvía a intentar esa migración, generando una nueva fila con `rolled_back_at NULL` en `_prisma_migrations` y bloqueando la BD con P3009. Resolución: (1) `migration.sql` vaciado — reemplazado por comentario explicativo (los 5 índices ya están en producción, aplicados en Fase 1 de INC-01). (2) `migrate resolve --rolled-back 20260612000000_add_performance_indexes_s3` para cerrar la segunda fila pendiente. (3) `migrate status` → "Database schema is up to date!" · 16 migraciones · 0 fallidas. (4) Commit `67bd252` + push → autodeploy → `migrate deploy` ejecutó `_s3` como no-op → `All migrations have been successfully applied.` → `API arrancada`. UnlockHub SUCCESS · worker SUCCESS · sin P3009 · sin error de auth. Credencial Postgres ya rotada (SEC-01 ✅ CERRADO). INC-01 cerrado definitivamente en AUDIT.md.

**Fecha**: 2026-06-12 (incidente deploy INC-01 — P3018/P3009) — Migración `20260612000000_add_performance_indexes_s3` (índices A33-A36, auditoría S3) falló en producción al entrar en `prisma migrate deploy`: Prisma 5.22 envuelve toda migración en `BEGIN…COMMIT`; `CREATE INDEX CONCURRENTLY` lanzó código 25001 "cannot run inside a transaction block". La BD quedó en estado P3009 (migración fallida bloquea las nuevas) durante 3 deployments consecutivos — API bloqueada, worker no afectado. Resolución paso a paso: (1) `migrate resolve --rolled-back` de la migración fallida. (2) 5 nuevas migraciones individuales creadas en repo (`20260612000001`–`20260612000005`), una por índice, como documentación fiel. (3) Índices aplicados manualmente fuera de transacción con `prisma db execute --file`, en orden de menor a mayor tabla — verificando `indisvalid=true` en `pg_indexes` tras cada uno; ningún índice inválido. Índices resultantes: `User_profileVisibility_deletedAt_idx`, `Friendship_senderId_status_idx`, `Friendship_receiverId_status_idx`, `ActivityEvent_userId_type_createdAt_idx`, `UserAchievement_userId_unlockedAt_idx`. (4) Cada migración marcada con `migrate resolve --applied`. (5) `migrate status`: "Database schema is up to date!" — 0 pendientes, 0 fallidas. (6) Push + redeploy → UnlockHub SUCCESS. **Pendiente de seguridad**: DATABASE_URL de producción expuesta durante el incidente — contraseña Postgres debe rotarse (ver SEC-01 en AUDIT.md). Ver INC-01 en AUDIT.md para detalle completo. Convención añadida a CLAUDE.md.

**Fecha**: 2026-06-11 (auditoría S5) — Mobile, seguridad y datos. **A44** 🔵 — thumbnails Cloudinary: `lib/cloudinary.ts` — `getCloudinaryThumb(url, w, h)` inyecta `w_N,h_N,c_fill,q_auto,f_auto` en `/upload/`; aplicado en 5 puntos (`UserCard` 96×96, `RankingItem` 80×80, `ActivityCard` 88×88, `profile.tsx` avatar 192×192 + banner 800×240, `profile/[username].tsx` avatar 160×160 + banner 800×240); URLs no-Cloudinary devueltas intactas; 6 tests unitarios en `__tests__/lib/cloudinary.test.ts`. **A45** 🔵 — `useSyncStatus`: `refetchInterval` siempre activo en 60 s → `refetchInterval: (q) => q.state.data?.isRunning ? 2_000 : false`; apaga el polling cuando no hay sync activo, activa a 2 s cuando sí hay; 2 tests verifican la función. **A46** 🟡 — `Sentry.init` sin `beforeSend`: cualquier error con `Authorization` header o body de login/refresh se enviaba a Sentry sin filtrar; `beforeSend` añadido en `_layout.tsx`: elimina `Authorization`/`authorization` de headers y redacta body en rutas `/auth/*`; verificación pendiente: confirmar cobertura de `event.request.url`, query strings y breadcrumbs. **A48** 🟡 — 401 en `refreshAccessToken()` no limpiaba sesión: el usuario quedaba `isAuthenticated: true` sin tokens válidos, todas las queries fallaban en bucle sin redirigir al login; `refreshAccessToken()` detecta `response.status === 401` → `deleteRefreshToken()` + `clearSession()` → el guard de tabs layout gestiona la redirección automáticamente. **A10** 🔵 completado — `console.error` eliminados en `api.ts:onerror` y `profile.tsx:bannerMutation.onError`; 0 `console.log/error` en `apps/mobile` en producción. **A49** 🟡 — UMP consent vs AdBanner al arrancar: diferido a S6a PRE-LANZAMIENTO (cerrar antes de promover a Producción). **A47** y **A50**: informacionales verificados — SecureStore/AsyncStorage correctamente segregados; deep links con auth check correcto. Tests: 395 mobile (+8) · 620 API · 0 TS/lint.

**Fecha**: 2026-06-11 (auditoría S4) — Mobile, leaks y fluidez. A42 socket/timers duplicados en SyncStatusBar eliminados (single source of truth de progreso en LibraryScreen; dejaba de duplicar llamadas a /sync/status en syncs largos), A43 selectores Zustand en 5 hooks (sin re-render por XP), A10 4 console.logs fuera del critical path del rewarded ad (adelantado de S6; 3 restantes en profile.tsx/api.ts diferidos a S6). A44/A45 reasignados a S5. Tests: 387 mobile · 620 API · 0 TS/lint.

**Fecha**: 2026-06-12 (auditoría S3) — Rendimiento backend y capa de datos. **A28** 🟡 — `upsertUserScore` llamaba `getPlatformXp` una vez por plataforma (hasta 4 queries); reemplazado por `getPlatformXpMap` que carga todos los logros del usuario en una sola query y agrupa en memoria (4 queries → 1 en el hot-path de ranking: tras sync, tras addXp, al cambiar visibilidad). **A29** 🔵 — `getUserGameAchievements` sin `select` cargaba todos los campos incluidos `rawValue`/`createdAt`/`updatedAt` no usados en la respuesta (~150 KB extra para juegos con 1.000 logros antes de cachear); ahora `select` explícito con los 9 campos requeridos. **A30** 🔵 — `USER_GAMES_KEYS_SET` sin TTL acumulaba claves muertas indefinidamente; añadido `redis.expire(set, TTL×4)` tras cada `sadd` (sliding-window 20 min). **A31** 🔵 — `deleteAccount` limpiaba Redis rankings pero no la caché pública de juegos (`user-games:*`); `invalidateUserPublicCache(userId)` añadido en paralelo con `removeUserFromRankings` (limpieza GDPR completa). **A32** 🔵 — `getProfile`/`getPublicProfile` usaban `include` sin `select` en `User` cargando `passwordHash`/`birthDate`/`role`/`deletedAt` (6 campos sensibles no usados por los mappers); migrado a `select` explícito con los 15/11 campos requeridos respectivamente (cierre de fuga PII). **A33–A36** 🔲 — 4 migraciones de índices compuestos preparadas en `20260612000000_add_performance_indexes_s3` y listas para aplicar: `UserAchievement(userId, unlockedAt)` (queries wrapped), `ActivityEvent(userId, type, createdAt)` (wrapped streak), `Friendship(senderId/receiverId, status)` (hot-path feed), `User(profileVisibility, deletedAt)` (background-sync scheduler). No aplicadas en producción — requieren `CREATE INDEX CONCURRENTLY` fuera de transacción en ventana de bajo tráfico. **A37–A40** 🔵 — diferidos a S6: paginación cursor en `getPublicFeed`, select explícito en `wrapped.service.ts`, paginación `sendAll` en notification, payload sin paginar en `getUserGameAchievements`. **A41** 🔵 — hallazgo identificado: discrepancia CLAUDE.md (80 %+90 %) vs código (solo 80 %) en umbrales Steam — registrado para S6. Tests: 620 API · 387 mobile ✅ · 0 errores TS/lint.

**Fecha**: 2026-06-12 (auditoría S2) — Sync e integraciones externas. **Verificaciones S1**: A4 confirmado — token corrupto/expirado siempre → 401 vía `verifyAccessToken` (líneas 34-39); el `.catch()` de línea 56 solo actúa en errores de BD (bypass deliberado de soft-delete documentado). A21 confirmado — cooldown Redis SET NX es la primera operación en `triggerManualSync` (línea 59), antes de cualquier query a BD. **Nuevos hallazgos y fixes**: A23 🟡 — 4 métodos internos de `SteamAdapter` + 2 de `fetchSteamAchievementDefinitions` carecían de `timeout` en sus llamadas axios → `timeout: 10_000` añadido en 6 puntos. A24 🟡 — el contador `steam:api:calls:<date>` se leía en scheduler y admin para aplicar el umbral del 80%, pero nunca se incrementaba en ningún adapter (deadcode bug — protección documentada como "✅ Activo" estaba inactiva) → `incrementSteamApiCounter()` con `redis.incr` + TTL 48h añadido en cada fetcher real; mocks de tests actualizados en 2 ficheros. A25 🔵 — todas las llamadas axios internas de `XboxAdapter` sin timeout + loop de paginación sin `MAX_PAGES` → `timeout: 15_000`/`10_000` + `XBOX_MAX_PAGES=20` añadidos. A26 🔵 — `earnedRes.trophies` y `titleTrophiesRes.trophies` en `fetchMergedTrophies` sin guard `?? []` → defensas añadidas. A27 🔵 — llamadas a `psn-api` sin control de timeout → diferido a S6 (requiere wrapping de librería externa). Barrido adicional: cifrado AES-256-GCM correcto (IV único por cifrado ✅, key de env validada ✅, no-logging de tokens ✅), doble cifrado T56 verificado como resuelto ✅, BullMQ correctamente configurado (attempts:3, exponential backoff, lockDuration:300s, stalledInterval:30s ✅), lock Redis del worker liberado en `finally` ✅, todos los writes de sync son idempotentes (upsert) ✅. Tests: 620 API · 387 mobile ✅. 0 errores TS/lint.

**Fecha**: 2026-06-11 (auditoría S1) — Seguridad backend. Resueltos: A1 CVE `ws` (engine.io 6.6.7→6.6.8, ws 8.20.1), A3 webhook timing-safe (`crypto.timingSafeEqual` sobre SHA-256), A5 magic-bytes en upload avatar/banner (`validateFileMagicBytes`, firmas manuales JPEG/PNG/WebP), A6 validación `platformSchema` en getMyRank, A7 ESLint `no-floating-promises` (+ fix bug de orden de shutdown: `io.close()` ahora awaited antes de cerrar Redis/Prisma), A8 bump express/qs/brace-expansion. Defensa GDPR `deletedAt: null` en 6 services (A14-A19): subscription, ranking, points, wrapped, stats, user. A20 descartado — mitigado por authRateLimiter (10 req/15 min); latencia constante añadiría fricción sin reducir riesgo real. A4 y A21 marcados para verificación adicional. A2 (tar build-time) diferido a S6. Tests: 620 API (+9) · 387 mobile · 0 TS/lint.

**Fecha**: 2026-06-11 (sesión 74 — Auditoría S0) — Setup de tooling de auditoría + línea base. Instalado `eslint-plugin-security`; añadidas reglas `detect-unsafe-regex`, `detect-possible-timing-attacks`, `detect-child-process` al `.eslintrc.js` raíz. Security plugin detectó 2 warnings nuevos: A3 (`webhooks.controller.ts:46` — timing attack en comparación de webhook secret, 🟡 MEDIO → T76) y A9 (falso positivo regex en `useWrapped.ts:15` → T81). Depcheck: `@unlockhub/validators` confirmada como dead dep en apps/mobile (0 imports) → eliminada de `package.json`. Auditoría npm: 2 HIGH (ws GHSA-58qx runtime via socket.io + tar path traversal build-time), 23 moderate. Madge: **0 ciclos de import** en 368 ficheros. Typecheck: 0 errores en api, mobile y worker. Tests: **611 API · 387 mobile** ✅. console.log producción: 7 (mobile únicamente). Inline queryKeys: 0. TODO/FIXME: 0 reales. Hallazgos totales: 13 (A1–A13). Por severidad: 🟠×2 · 🟡×6 · 🔵×5. Documento `docs/AUDIT.md` creado. T75–T82 añadidos al backlog. Commit local — pendiente push.

**Fecha**: 2026-06-11 (sesión 73) — Fix banner no se actualizaba en tiempo real tras subida (T74). Causa raíz: `bannerMutation.onSuccess` no actualizaba el store Zustand (fuente de verdad del render) ni invalidaba `queryKeys.me()`, a diferencia de `avatarMutation`. Fix: `uploadFile<{ banner: string }>` + `setUser({ ...current, banner: data.banner })` + `invalidateQueries(queryKeys.me())` en `onSuccess`. Eliminados 3 `console.log` debug de `[BANNER]`. Tests: 387 mobile · 611 API. 0 errores TS/lint.

**Fecha**: 2026-06-09 (sesión 69) — Fix platformAccount.update → upsert (race condition P2025) + V3 worker BullMQ separado. **Fix P2025**: `platformAccount.update` en 6 ocurrencias (`retroachievements.adapter.ts`, `sync.service.ts`, `xbox.adapter.ts`, `sync.worker.ts`) reemplazado por `platformAccount.upsert` — durante syncs concurrentes del mismo usuario la BD podía recibir un `update` sobre un registro que otro job acababa de borrar/recrear, causando error P2025 "Record to update not found". **V3 worker**: nuevo `apps/worker/` con proceso Railway independiente que arranca sync, streak, challenge, gdpr-cleanup y seed-catalog workers + schedulers; cierre limpio `SIGTERM`/`SIGINT`; `apps/api/src/index.ts` limpiado de workers. Trade-off: `getIOSafe()` desde el worker devuelve null — eventos Socket.io (`sync:progress`, `sync:complete`) no se emiten desde el worker; el cliente usa fallback polling Redis vía `GET /api/v1/sync/status`. Para restaurar eventos en tiempo real desde el worker: añadir `@socket.io/redis-emitter`. Railway: servicio `unlockhub-worker` creado con `startCommand: npm run start --workspace=apps/worker`; 14 Shared Variables configuradas a nivel de proyecto compartidas entre API y worker. Tests: 610 API + 368 mobile. 0 errores TS/lint.

**Fecha**: 2026-06-05 (sesión 68) — T16 backfill RA XP ejecutado en producción. 48.865 logros RA procesados — 29.419 actualizados (fórmula vieja `min(100, max(1, points))` → correcta `max(5, round(points/5))`), 28.583 saltados (ya correctos), 0 errores. XP de usuarios se corregirá gradualmente en próximo sync automático.

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
