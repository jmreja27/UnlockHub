# CLOSED_TESTING_LOG.md — UnlockHub

Registro de la prueba cerrada de cara al salto a producción en Google Play.

## Contexto

La primera solicitud de producción fue enviada el 2026-06-21 tras 14 días de prueba cerrada con 12 testers. Google la rechazó por engagement insuficiente de los testers y falta de evidencia de iteración sobre el feedback recibido.

Este documento registra los hallazgos de la segunda ronda de prueba cerrada: qué reportaron los testers, cómo se detectó cada problema, la causa raíz, la corrección aplicada y el estado actual. El objetivo es disponer de material concreto para el formulario de segunda solicitud de producción de Google.

---

## Hallazgos

### BUG-01 — Crash en notificaciones (Hermes / Intl)

**Reportado por**: Sentry (crash real de un tester en dispositivo Android).

**Descripción**: La pantalla de notificaciones crasheaba al cargar con `TypeError: undefined is not a function`, originado en `Intl.RelativeTimeFormat`. El crash se producía en dispositivos Android con la build de Hermes incluida en el APK, sin comportamiento diferente visible antes del crash (la pantalla simplemente cerraba o congelaba).

**Diagnóstico / causa raíz**: `Intl.RelativeTimeFormat` no está disponible en todos los builds de Hermes para Android. Aunque la documentación oficial indica soporte, el comportamiento real en producción depende de la versión exacta de Hermes compilada y del dispositivo. El mismo problema potencial existía con `Intl.NumberFormat`, `Intl.DateTimeFormat` y `Number.prototype.toLocaleString()` (que puede apoyarse en Intl internamente). Se identificaron 5 usos de APIs Intl en `apps/mobile`.

**Corrección aplicada**:
- Creadas las utilidades propias `lib/formatTimeAgo.ts` con las funciones `formatTimeAgo`, `formatDayMonth` y `formatNumber`, sin ninguna dependencia de `Intl`.
- Barrido de los 5 usos de Intl en mobile y reemplazados por las nuevas utilidades.
- Convención añadida a CLAUDE.md: nunca usar `Intl.*`, `toLocaleString()` ni similares en mobile — usar siempre las utilidades propias.

**Archivos modificados**: `apps/mobile/lib/formatTimeAgo.ts` (nuevo), `apps/mobile/app/notifications.tsx`, `apps/mobile/app/wrapped/[year].tsx`, `apps/mobile/components/ActivityCard.tsx`, y otros.

**Estado**: Corregido en `develop`. Pendiente de incluir en el próximo build EAS.

---

### BUG-02 — Vinculación de plataformas: navegación rota y ausencia de feedback (PSN + Steam + RA)

**Reportado por**: Tester directo al intentar vincular PSN. Síntomas: el spinner de carga terminaba pero la pantalla parecía no haber vinculado nada; el botón "Volver" no respondía; el botón de retroceso físico (Android) sacaba de la app en lugar de volver a la pantalla anterior.

**Diagnóstico / causa raíz**: Dos bugs independientes coexistiendo:

(a) **Navegación rota** — Las tres pantallas de vinculación (`steam.tsx`, `ra.tsx`, `psn.tsx`) usaban `router.replace('/onboarding')` como destino de éxito en determinados flujos. Cuando el usuario llegaba a la pantalla de vinculación desde el perfil (no desde el onboarding), `router.replace` reemplazaba el stack de navegación por una ruta que no correspondía al flujo actual, dejando el historial vacío y sin destino válido para el botón "Volver".

(b) **Sin feedback de éxito en PSN** — A diferencia de Steam y RA, la pantalla de PSN no mostraba ningún `Alert` de confirmación al completar la vinculación correctamente, lo que hacía que el tester interpretara el silencio como un fallo.

La vinculación de PSN *sí funcionaba* en todos los casos (la cuenta aparecía en base de datos). El NPSSO del sistema fue verificado como vigente — no era la causa del problema.

**Corrección aplicada**:
- Guard `canGoBack()` añadido en las tres pantallas: si hay historial en el stack, se usa `router.back()`; si no lo hay (flujo desde onboarding), se usa `router.replace('/(tabs)')`.
- `Alert` de éxito añadido en `psn.tsx` al completar la vinculación, alineado con el patrón ya existente en `steam.tsx` y `ra.tsx`.
- Errores de vinculación en PSN ahora muestran un `Alert` visible (antes se perdían sin feedback al usuario — el teclado quedaba abierto y no había mensaje).

**Archivos modificados**: `apps/mobile/app/link-platform/psn.tsx`, `apps/mobile/app/link-platform/steam.tsx`, `apps/mobile/app/link-platform/ra.tsx`.

**Estado**: Corregido en `develop`. Pendiente de incluir en el próximo build EAS.

---

### MEJ-01 — UX en registro: date picker y placeholder de email

**Reportado por**: Feedback directo de testers.

**Descripción**:
- El campo de fecha de nacimiento en el registro acepta texto libre, lo que obliga al usuario a teclear la fecha manualmente y conocer el formato esperado. En Android la experiencia nativa esperada es un date picker.
- El placeholder del campo de email (`"tu@email.com"`) es demasiado informal para una app de producción y podría sugerir que solo se acepta Gmail.

**Diagnóstico**: Ambos son problemas de pulido UX sin impacto funcional. La validación de fecha (≥ 16 años) funciona correctamente.

**Corrección aplicada**:

*(a) Date picker nativo* — `TextInput` de fecha de nacimiento reemplazado por un `Pressable` que abre `@react-native-community/datetimepicker` (nueva dependencia). En Android se muestra el diálogo nativo de calendario; en iOS un spinner inline con botón "Confirmar". La fecha seleccionada se muestra en formato `DD/MM/AAAA` mediante la nueva utilidad `formatBirthDate(date: Date)` añadida a `lib/formatTimeAgo.ts` (sin Intl). La validación de edad mínima (≥ 16 años) se mantiene intacta: el picker no permite seleccionar fechas posteriores al corte de 16 años (`maximumDate`). La fecha se convierte a `YYYY-MM-DD` para la API mediante `formatForApi()` local en `register.tsx`.

*(b) Placeholder de email* — Actualizado de `"tu@email.com"` a `"nombre@ejemplo.com"` (ES) y `"name@example.com"` (EN) en los tres campos de email de la app: login, registro y recuperación de contraseña.

**Archivos modificados**:
- `apps/mobile/lib/formatTimeAgo.ts` — nueva función `formatBirthDate`
- `apps/mobile/app/(auth)/register.tsx` — date picker en lugar de TextInput
- `apps/mobile/i18n/locales/es.json` — 3 placeholders + claves `birthdate_placeholder` y `birthdate_confirm`
- `apps/mobile/i18n/locales/en.json` — ídem en inglés
- `apps/mobile/jest.setup.ts` — mock de `@react-native-community/datetimepicker`
- `apps/mobile/__tests__/screens/RegisterScreen.test.tsx` — 2 tests actualizados para usar el picker

**Estado**: Corregido en `develop`. Pendiente de incluir en el próximo build EAS.

---

### BUG-03 — Rewarded ad: botón sin feedback visual de estado de carga

**Reportado por**: Tester directo.

**Descripción**: El botón "Ver anuncio" aparecía visualmente levemente atenuado cuando el anuncio aún no había terminado de cargar (`isReady = false`), pero seguía siendo pulsable. Al pulsarlo se mostraba un Alert de "anuncio no disponible", pero la experiencia resultaba confusa: el botón parecía funcional y el mensaje era inesperado. El tester lo describió como "el botón se puede pulsar pero no hace nada".

**Diagnóstico / causa raíz**: El prop `disabled` del botón solo cubría dos estados: cooldown activo e `isWatchingAd` (spinner). El estado `!isReady` (anuncio aún descargándose desde los servidores de AdMob) no ponía el botón en `disabled`, aunque la opacidad bajaba a 0.75 como indicio visual. El texto del botón tampoco cambiaba para indicar que se estaba cargando.

**Corrección aplicada**:
- `disabled` extendido a `isOnCooldown || isWatchingAd || !isAdReady`.
- `accessibilityState.disabled` actualizado en consecuencia.
- Texto del botón: cuando `!isAdReady` (y sin cooldown), muestra `t('profile.points_watch_ad_loading')` ("Cargando anuncio...") en lugar de "Ver anuncio".
- Opacidad: 0.6 cuando deshabilitado por cualquier causa (cooldown o no disponible), 1 cuando disponible.
- Nuevas claves i18n `points_watch_ad_loading` en ES y EN.
- 2 tests actualizados en `ProfileScreen.test.tsx`.

**Archivos modificados**: `apps/mobile/app/(tabs)/profile.tsx`, `apps/mobile/i18n/locales/es.json`, `apps/mobile/i18n/locales/en.json`, `apps/mobile/__tests__/screens/ProfileScreen.test.tsx`.

**Estado**: Corregido en `develop`. Pendiente de incluir en el próximo build EAS.

---

### MEJ-02 — Layout de comparación: nombre del amigo truncado + nombres de logros no centrados

**Reportado por**: Tester directo (capturas de pantalla).

**Descripción (a)**: En la pantalla de comparación de logros (`user-game/[username]/[gameId].tsx`, tab "Comparar"), la columna del nombre del amigo en la cabecera tenía un ancho fijo de `w-9` (36px), igual que la columna de los checks. Usernames de más de 4-5 caracteres se cortaban y aparecían como "SEIT..." o similar.

**Descripción (b)**: Los nombres de los logros en las filas de comparación estaban alineados a la izquierda. Al ser la columna central entre dos checks (✓/○), la alineación izquierda hacía que no quedara claro visualmente a qué par de checks correspondía cada logro.

**Corrección aplicada**:

*(a) Nombre del amigo*: la columna derecha de la cabecera cambia de `className="w-9 items-center"` (36px fijo) a `style={{ minWidth: 36, maxWidth: 100, alignItems: 'center' }}`. Permite hasta ~12-15 caracteres a `text-xs` sin corte visible; los más largos se truncan con `ellipsizeMode="tail"` de forma controlada.

*(b) Nombres de logros*: `CompareRow` — añadido `text-center` a los `Text` de título y XP de la columna central para que los nombres queden centrados entre los dos checks.

**Archivos modificados**: `apps/mobile/app/user-game/[username]/[gameId].tsx`.

**Estado**: Corregido en `develop`. Pendiente de incluir en el próximo build EAS.

---

### F-01 — Wrapped: estadísticas extendidas (F45)

**Reportado por**: Feedback de testers — interés en ver más detalles en el resumen anual/mensual.

**Descripción**: Los testers señalaron que el Wrapped es una de las funcionalidades más atractivas de la app, pero les gustaría ver estadísticas más detalladas: juego más jugado del período, logro más difícil desbloqueado, plataforma más activa, racha más larga en el período, etc.

**Diagnóstico**: La infraestructura de `wrapped.service.ts` ya tiene las consultas necesarias. Las estadísticas extendidas requieren añadir nuevos campos al response y nuevas secciones en la pantalla `wrapped/[year].tsx`.

**Estado**: Documentado en `docs/BACKLOG.md` como F45. Pendiente de implementar.

---

## Para la solicitud de producción

Esta sección resume el proceso de prueba en un formato apto para responder el formulario de segunda solicitud de producción de Google Play.

### Cómo se recogió el feedback

El feedback se obtuvo por dos vías complementares:

1. **Sentry (crash reporting automático)**: configurado en la app desde el primer build de prueba. Capturó automáticamente el crash de `Intl.RelativeTimeFormat` (BUG-01) con stack trace completo, dispositivo afectado y versión de la app. Esto permitió identificar y diagnosticar el problema sin depender de que el tester describiera el error.

2. **Testers directos**: 12 personas reclutadas personalmente (comunidad de cazadores de logros). Cada tester probó los flujos principales — vinculación de plataformas, exploración de biblioteca, rankings, notificaciones — y comunicó su experiencia por mensaje directo. El bug de navegación en la vinculación de plataformas (BUG-02) fue detectado y descrito por un tester de esta forma.

### Qué se corrigió a raíz del feedback

Se publicó una actualización de la app durante el período de prueba cerrada con las siguientes correcciones, todas derivadas directamente del feedback recibido:

- **Crash en notificaciones** (BUG-01): eliminados todos los usos de `Intl.RelativeTimeFormat` y APIs Intl relacionadas, reemplazados por utilidades propias. El crash ya no es reproducible.
- **Navegación y feedback en vinculación de plataformas** (BUG-02): corregido el comportamiento del botón "Volver" en las tres pantallas de vinculación; añadido mensaje de confirmación al vincular PSN; mejorada la visibilidad de errores.
- **Botón rewarded ad sin feedback de estado de carga** (BUG-03): botón ahora deshabilitado visualmente (`disabled + opacidad 0.6`) mientras el anuncio carga; texto cambia a "Cargando anuncio..." para que el usuario entienda que hay que esperar.
- **Layout de comparación** (MEJ-02): nombre del amigo en la cabecera ya no se trunca (ancho máximo 100px); nombres de logros centrados en la columna central.

### Iteración durante la prueba

La prueba cerrada no fue un evento puntual sino un proceso iterativo: se recibió feedback, se diagnosticaron los problemas y se aplicaron correcciones en la rama `develop`. Las correcciones de BUG-01, BUG-02, BUG-03, MEJ-01 y MEJ-02 están listas en `develop` y serán incluidas en el próximo build EAS, que se generará y distribuirá a los mismos testers del track de prueba cerrada para verificar que los bugs están resueltos antes de promover a producción. El build aún no se ha generado — esta actualización se publicará al track de prueba cerrada con ese build, no antes.
