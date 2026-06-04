# BUILD_LOCAL — APK debug local (Expo SDK 55 + RN 0.83.6)

Guía para generar un APK debug standalone (sin Metro) desde el monorepo en Windows.
Última verificación: 2026-06-04 — BUILD SUCCESSFUL en 22m 22s, APK debug 204.9 MB.

---

## Prerrequisitos

| Herramienta | Versión probada | Dónde obtener |
|---|---|---|
| Java (JDK) | 21.0.10 (Android Studio JBR) | `C:\Program Files\Android\Android Studio\jbr` |
| Android SDK | build-tools 36.x, NDK 27.1.12297006 | Android Studio SDK Manager |
| Node.js | ≥18 | nodejs.org |
| npm | ≥10 | incluido con Node.js |

Verificar que `JAVA_HOME` apunta al JBR de Android Studio y que el SDK tiene `compileSdk 36` instalado.

---

## Proceso completo paso a paso

### Paso 1 — Instalar dependencias

Desde la raíz del monorepo:

```powershell
cd C:\Users\Juanjo\Desktop\UnlockHub
npm install
```

Esto instala todos los workspaces incluyendo `@react-native-community/cli@20.1.3` (hoisted en root `node_modules`).

> **Nota**: el package.json de `apps/mobile` declara `@react-native-community/cli@^20.1.3` como devDependency. Si sólo ejecutaste `npm install --omit=dev` o `npm ci --omit=dev` previamente, el CLI no estará disponible — corre `npm install` sin flags.

---

### Paso 2 — Regenerar el directorio android (prebuild)

```powershell
cd apps\mobile
npx expo prebuild --platform android --clean
```

Este comando borra y regenera `apps/mobile/android/` desde `app.json`. Tarda ~1 min.

Warnings esperados (inofensivos):
- `Root-level "expo" object found. Ignoring extra key: react-native-google-mobile-ads` → ignorar
- `[@sentry/react-native/expo] Missing config for organization, project` → ignorar (se inyecta en EAS)

---

### Paso 3 — Parchear Gradle (CRÍTICO)

`expo prebuild` siempre genera **Gradle 9.0.0**, que es incompatible con RN 0.83.6.
Editar **inmediatamente** tras el prebuild:

**Archivo**: `apps/mobile/android/gradle/wrapper/gradle-wrapper.properties`

```properties
# Cambiar esta línea:
distributionUrl=https\://services.gradle.org/distributions/gradle-9.0.0-bin.zip

# Por esta:
distributionUrl=https\://services.gradle.org/distributions/gradle-8.13-all.zip
```

> **Por qué**: Gradle 9.0.0 rompe la compatibilidad con el React Native Gradle Plugin de RN 0.83.6 (APIs eliminadas). EAS Build aplica este parche automáticamente — sólo afecta a builds locales.

---

### Paso 4 — Generar el bundle JS

> **Nota importante**: Con Expo SDK 55 + `@react-native-community/cli@20`, el comando `react-native bundle` falla con `Cannot resolve @react-native/metro-config`. El comando correcto es `expo export:embed`, que es el mismo que usa Gradle internamente (`bundleCommand = "export:embed"` en `app/build.gradle`).

```powershell
# Desde apps/mobile/
cd C:\Users\Juanjo\Desktop\UnlockHub\apps\mobile

# Crear directorio de assets si no existe
New-Item -ItemType Directory -Force "android\app\src\main\assets" | Out-Null

# Generar bundle
$env:EXPO_PUBLIC_API_URL = "https://unlockhub-production.up.railway.app"
$env:NODE_ENV = "production"
npx expo export:embed `
  --platform android `
  --dev false `
  --bundle-output "android\app\src\main\assets\index.android.bundle" `
  --assets-dest "android\app\src\main\res"
```

Salida esperada: `Android Bundled Xms node_modules\expo-router\entry.js (3356 modules)`

El bundle resultante pesa ~7.5 MB en `android/app/src/main/assets/index.android.bundle`.

> **Por qué no especificamos `--entry-file`**: `package.json` ya tiene `"main": "expo-router/entry"` y Expo lo resuelve automáticamente. Pasar `--entry-file "../../node_modules/expo-router/entry.js"` causa error de resolución de rutas en el monorepo.

---

### Paso 5 — Compilar APK debug

```powershell
# Desde apps/mobile/android/
cd C:\Users\Juanjo\Desktop\UnlockHub\apps\mobile\android

$env:JAVA_HOME  = "C:\Program Files\Android\Android Studio\jbr"
$env:ANDROID_HOME = "C:\Users\Juanjo\AppData\Local\Android\Sdk"
$env:PATH = "$env:JAVA_HOME\bin;$env:ANDROID_HOME\platform-tools;$env:PATH"

.\gradlew assembleDebug
```

La primera ejecución descarga Gradle 8.13 (~150 MB) y todas las dependencias — puede tardar **15-25 minutos**. Las siguientes corren con caché (~3-5 min).

**Salida esperada**:
```
BUILD SUCCESSFUL in Xm Xs
508 actionable tasks: 480 executed, 28 up-to-date
```

**APK generado**: `android/app/build/outputs/apk/debug/app-debug.apk` (~205 MB con todas las ABIs)

---

## Instalar en emulador/dispositivo

```powershell
# Instalar en el emulador activo (o dispositivo USB conectado)
$env:ANDROID_HOME = "C:\Users\Juanjo\AppData\Local\Android\Sdk"
& "$env:ANDROID_HOME\platform-tools\adb.exe" install -r "android\app\build\outputs\apk\debug\app-debug.apk"
```

> **Nota emulador**: Usa `http://10.0.2.2:3000` para el API en local, nunca `localhost`. Configura `EXPO_PUBLIC_API_URL=https://unlockhub-production.up.railway.app` para conectar a producción (lo que hace el bundle generado en el paso 4).

---

## Optimización: APK sólo para el emulador (x86_64)

El APK debug incluye 4 ABIs (~205 MB). Para el emulador se puede compilar sólo `x86_64`:

```powershell
.\gradlew assembleDebug -PreactNativeArchitectures=x86_64
```

Resultado: ~55-70 MB.

Para un dispositivo físico ARM64:

```powershell
.\gradlew assembleDebug -PreactNativeArchitectures=arm64-v8a
```

---

## Warnings conocidos (ignorar)

| Warning | Causa | Acción |
|---|---|---|
| `D8: Expected stack map table` (×100+) | `amazon-appstore-sdk` de RevenueCat | Inofensivo — no afecta al APK |
| `package=... found in source AndroidManifest.xml` | `async-storage`, `react-native-purchases` | Inofensivo — deprecation de AGP, no error |
| `Deprecated Gradle features were used` | Plugins con API Gradle 8.x | Inofensivo con Gradle 8.13 |
| `NODE_ENV environment variable is required but was not specified` | La task `expo-constants:createExpoConfig` | Inofensivo — usa `.env.local` y `.env` como fallback |

---

## Diferencias con EAS Build

| Aspecto | Build local | EAS Build |
|---|---|---|
| Gradle | 8.13 (parcheado manual) | Gestionado automáticamente |
| Firma | `debug.keystore` incluido | Keystore de producción desde Expo Credentials |
| Secrets EAS | No disponibles | Inyectados por EAS |
| AdMob IDs | IDs de test (`.env`) | IDs de producción (EAS secrets) |
| Sentry | DSN vacío (warning) | DSN configurado (EAS env) |
| Tiempo de build | 15-25 min (primera vez) | ~15-20 min en cloud |
| ABIs | Todas o la especificada | arm64-v8a + armeabi-v7a (optimizado) |

> **REGLA ABSOLUTA**: Nunca lanzar `eas build` sin que el desarrollador lo pida explícitamente en ese mismo mensaje.

---

## Troubleshooting

### Error: `FAILURE: Build failed with an exception` al compilar con Gradle 9.0.0
**Causa**: Olvidaste parchear `gradle-wrapper.properties` después del prebuild.  
**Fix**: Cambiar `gradle-9.0.0-bin.zip` → `gradle-8.13-all.zip` en el archivo.

### Error: `Cannot resolve @react-native/metro-config`
**Causa**: Estás usando `npx react-native bundle` con `@react-native-community/cli@20`.  
**Fix**: Usar `npx expo export:embed` (ver Paso 4).

### Error al resolver entry file con `--entry-file`
**Causa**: En monorepo, la ruta relativa se resuelve desde la raíz del workspace, no desde `apps/mobile`.  
**Fix**: Omitir `--entry-file` — `package.json` ya define `"main": "expo-router/entry"`.

### El APK no arranca / pantalla en blanco
**Causa**: El bundle JS no fue generado antes de `assembleDebug` (para el build en modo debug, Gradle omite la generación automática del bundle).  
**Fix**: Ejecutar siempre el Paso 4 antes del Paso 5 para builds standalone.

### `@react-native-community/cli` no se instala
**Causa**: `npm install` fue ejecutado con `--omit=dev`.  
**Fix**: Ejecutar `npm install` desde la raíz sin flags.
