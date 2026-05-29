# 📱 Guía de build local — UnlockHub Android

Guía de referencia para generar una APK de debug localmente en Windows e instalarla en emulador o dispositivo físico Android.

> **App:** `UnlockHub` · **Package:** `com.unlockhub.app` · **API:** `https://unlockhub-production.up.railway.app`

---

## 📋 Índice

1. [Requisitos previos](#1-requisitos-previos)
2. [Variables de entorno — Windows](#2-variables-de-entorno--windows)
3. [Verificar instalaciones](#3-verificar-instalaciones)
4. [Generar la APK — paso a paso](#4-generar-la-apk--paso-a-paso)
5. [Instalar en emulador Android](#5-instalar-en-emulador-android)
6. [Instalar en dispositivo físico](#6-instalar-en-dispositivo-físico)
7. [Recompilar rápido (sin prebuild)](#7-recompilar-rápido-sin-prebuild)
8. [Solución de problemas frecuentes](#8-solución-de-problemas-frecuentes)
9. [Crear local.properties (alternativa)](#9-crear-localproperties-alternativa)
10. [TL;DR — Comandos mínimos](#tldr--comandos-mínimos)

---

## 1. Requisitos previos

Instalar estas herramientas antes de empezar:

| Herramienta | Versión mínima | Descarga |
|---|---|---|
| **Node.js** | 18.x LTS | https://nodejs.org |
| **Android Studio** | Hedgehog o superior | https://developer.android.com/studio |
| **Java JDK** | 17 | Incluido en Android Studio (JBR) |
| **ADB** | Cualquiera | Incluido en Android Studio (platform-tools) |

> ⚠️ **Java y ADB no necesitan instalación separada.** Android Studio instala el JDK (Jetbrains Runtime, JBR) y ADB en su propia carpeta. Solo hay que apuntar las variables de entorno a esas rutas.

### Verificar rutas de instalación

Antes de configurar nada, confirmar dónde está instalado Android Studio:

```powershell
# Buscar java.exe en el sistema
where.exe java

# Buscar adb.exe en el sistema
where.exe adb
```

Si no encuentran nada, las rutas típicas en Windows son:

- **JAVA_HOME** → `C:\Program Files\Android\Android Studio\jbr`
- **ANDROID_HOME** → `C:\Users\<TU_USUARIO>\AppData\Local\Android\Sdk`

Para confirmar que la JBR de Android Studio existe:

```powershell
Test-Path "C:\Program Files\Android\Android Studio\jbr\bin\java.exe"
# Debe devolver: True
```

---

## 🔧 2. Variables de entorno — Windows

### Configuración temporal (solo sesión actual de PowerShell)

Ideal para builds puntuales sin tocar la configuración global del sistema:

```powershell
# Reemplaza <TU_USUARIO> con tu nombre de usuario de Windows
# (ej: si tu perfil es C:\Users\Juanjo → usa Juanjo)

$env:JAVA_HOME    = "C:\Program Files\Android\Android Studio\jbr"
$env:ANDROID_HOME = "C:\Users\<TU_USUARIO>\AppData\Local\Android\Sdk"
$env:Path        += ";$env:JAVA_HOME\bin"              # necesario para que 'java' funcione en la terminal
$env:Path        += ";$env:ANDROID_HOME\platform-tools"
$env:Path        += ";$env:ANDROID_HOME\tools"
$env:Path        += ";$env:ANDROID_HOME\emulator"
```

Para verificar que se aplicó correctamente:

```powershell
$env:JAVA_HOME
$env:ANDROID_HOME
adb --version
```

### Configuración permanente (System Properties)

Para no tener que setear las variables en cada sesión:

1. Pulsar `Win + R` → escribir `sysdm.cpl` → Enter
2. Pestaña **Advanced** → botón **Environment Variables**
3. En **System variables**, hacer clic en **New** para cada una:

| Variable | Valor |
|---|---|
| `JAVA_HOME` | `C:\Program Files\Android\Android Studio\jbr` |
| `ANDROID_HOME` | `C:\Users\<TU_USUARIO>\AppData\Local\Android\Sdk` |

4. Buscar la variable `Path` en **System variables** → **Edit** → **New** y añadir:
   - `%JAVA_HOME%\bin`
   - `%ANDROID_HOME%\platform-tools`
   - `%ANDROID_HOME%\tools`
   - `%ANDROID_HOME%\emulator`

5. Aceptar todo y **abrir una nueva terminal** para que los cambios tengan efecto.

---

## ✅ 3. Verificar instalaciones

Ejecutar estos comandos en una terminal nueva para confirmar que todo está disponible:

```powershell
node --version
# Esperado: v18.x.x o superior

java --version
# Esperado: openjdk 17.x.x o similar

adb --version
# Esperado: Android Debug Bridge version 1.x.x

# Opcional: verificar que Gradle puede ejecutarse
cd C:\Users\Juanjo\Desktop\UnlockHub\apps\mobile\android
./gradlew --version
```

Si `adb` no se encuentra pero `ANDROID_HOME` está seteado:

```powershell
& "$env:ANDROID_HOME\platform-tools\adb.exe" --version
```

---

## 🛠️ 4. Generar la APK — paso a paso

> Todos los comandos se ejecutan desde la raíz del monorepo (`C:\Users\Juanjo\Desktop\UnlockHub`) salvo que se indique lo contrario.

### Paso 4.1 — Prebuild

```powershell
cd apps\mobile
npx expo prebuild --platform android --clean
```

**Qué hace:** elimina la carpeta `android/` y la regenera desde cero a partir de `app.json` y las dependencias nativas instaladas. Produce un proyecto Android estándar listo para compilar con Gradle.

> ⚠️ **Cuándo es necesario:**
> - La primera vez que compilas en esta máquina
> - Cuando cambias `app.json` (iconos, permisos, plugins)
> - Cuando instalas o actualizas dependencias nativas
> - Cuando ves errores raros de Gradle sin causa aparente
>
> Si solo cambia código TypeScript/JavaScript, puedes saltar este paso (ver sección 7).

### Paso 4.2 — Añadir meta-data de AdMob ⚠️

> Este paso es **manual** y solo es necesario la primera vez o después de un `--clean`. El prebuild regenera `AndroidManifest.xml` y borra este bloque.

Abrir el fichero:

```
apps\mobile\android\app\src\main\AndroidManifest.xml
```

Localizar la etiqueta `<application` y añadir este bloque **dentro de ella**, antes del primer `<activity`:

```xml
<meta-data
    android:name="com.google.android.gms.ads.APPLICATION_ID"
    android:value="ca-app-pub-3940256099942544~3347511713"/>
```

Ejemplo de cómo debe quedar:

```xml
<application
    android:name=".MainApplication"
    android:label="@string/app_name"
    ...>

    <!-- AÑADIR AQUÍ: AdMob Application ID (test ID) -->
    <meta-data
        android:name="com.google.android.gms.ads.APPLICATION_ID"
        android:value="ca-app-pub-3940256099942544~3347511713"/>

    <activity ...>
```

> ℹ️ El valor `ca-app-pub-3940256099942544~3347511713` es el **Application ID de prueba de Google**. Los IDs de producción se inyectan como EAS secrets en los builds de Play Store, no van en este fichero.

### Paso 4.3 — Generar el bundle JS

> ⚠️ **Paso crítico.** En builds de debug con este setup de Expo, Gradle no llama a Metro automáticamente. Sin este paso la app arrancará con un error `"Unable to load script. index.android.bundle is not packaged correctly"`.

Ejecutar desde `apps\mobile\`:

```powershell
# Setear variables de entorno para este paso
$env:EXPO_PUBLIC_API_URL = "https://unlockhub-production.up.railway.app"
$env:NODE_ENV            = "production"

# Crear la carpeta de assets si no existe
New-Item -ItemType Directory -Force -Path android\app\src\main\assets | Out-Null

# Generar el bundle
npx react-native bundle `
  --platform android `
  --dev false `
  --entry-file "..\..\node_modules\expo-router\entry.js" `
  --bundle-output android\app\src\main\assets\index.android.bundle `
  --assets-dest android\app\src\main\res
```

**Por qué `NODE_ENV=production` es obligatorio:**
Babel solo inlinea las variables `EXPO_PUBLIC_*` del entorno cuando `NODE_ENV=production`. En modo `--dev true` o sin la variable, `process.env.EXPO_PUBLIC_API_URL` queda vacío en el motor Hermes y la app usa el fallback `localhost:3000` en lugar de la API de producción.

**Por qué `--dev false`:**
Desactiva las herramientas de desarrollo de React Native (DevMenu, Fast Refresh, etc.), reduce el tamaño del bundle y activa las optimizaciones de Babel.

> Este paso tarda ~1-2 minutos la primera vez. Las siguientes son más rápidas gracias a la caché de Metro.

### Paso 4.4 — Compilar la APK

```powershell
# Desde apps\mobile\android\
cd android

$env:JAVA_HOME    = "C:\Program Files\Android\Android Studio\jbr"
$env:ANDROID_HOME = "C:\Users\<TU_USUARIO>\AppData\Local\Android\Sdk"

.\gradlew assembleDebug
```

O en una sola línea desde `apps\mobile\`:

```powershell
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
$env:ANDROID_HOME = "C:\Users\<TU_USUARIO>\AppData\Local\Android\Sdk"
cd android; .\gradlew assembleDebug; cd ..
```

**Tiempos esperados:**
- Primera compilación: ~5-10 minutos (descarga dependencias Gradle)
- Compilaciones incrementales: ~1-3 minutos

Al finalizar correctamente verás:

```
BUILD SUCCESSFUL in Xm Xs
```

### Paso 4.5 — Localizar la APK generada

```
apps\mobile\android\app\build\outputs\apk\debug\app-debug.apk
```

Tamaño esperado: ~165-175 MB (debug no tiene minificación R8/ProGuard).

---

## 📱 5. Instalar en emulador Android

### 5.1 — Arrancar el emulador

```powershell
# Listar los AVDs (Android Virtual Devices) disponibles
emulator -list-avds

# Arrancar un emulador específico (reemplaza con el nombre real)
emulator -avd Pixel_6_API_33
```

O simplemente abrirlo desde **Android Studio** → **Device Manager** → ▶️ Play.

### 5.2 — Verificar que el emulador está conectado

```powershell
adb devices
```

Salida esperada:

```
List of devices attached
emulator-5554   device
```

### 5.3 — Instalar la APK

```powershell
# Instalación limpia (falla si ya está instalada — usar -r para actualizar)
adb install apps\mobile\android\app\build\outputs\apk\debug\app-debug.apk

# Actualización (mantiene datos de la app)
adb install -r apps\mobile\android\app\build\outputs\apk\debug\app-debug.apk
```

> Si hay múltiples dispositivos conectados, especificar el emulador con `-s`:
> ```powershell
> adb -s emulator-5554 install -r apps\mobile\android\app\build\outputs\apk\debug\app-debug.apk
> ```

---

## 📲 6. Instalar en dispositivo físico

### 6.1 — Habilitar opciones de desarrollador en el móvil

1. Ir a **Ajustes** → **Acerca del teléfono** (o "Información del teléfono")
2. Pulsar **7 veces** en **"Número de compilación"** hasta ver "Eres desarrollador"
3. Volver a **Ajustes** → aparece el menú **"Opciones de desarrollador"**
4. Activar **"Depuración USB"**

> En algunas marcas (Samsung, Xiaomi, OnePlus) la ruta puede variar ligeramente. Buscar "Número de compilación" en el buscador de Ajustes si no aparece en el primer nivel.

### 6.2 — Conectar por USB y verificar

1. Conectar el móvil al PC con un cable USB (no todos los cables transmiten datos — usar uno de datos)
2. En el móvil aparecerá un diálogo **"¿Confiar en este ordenador?"** → pulsar **Confiar**

```powershell
adb devices
```

Salida esperada:

```
List of devices attached
R5CX12345AB     device
```

Si aparece `unauthorized` en lugar de `device`, el diálogo de confianza no se ha aceptado aún.

### 6.3 — Instalar la APK

```powershell
adb install apps\mobile\android\app\build\outputs\apk\debug\app-debug.apk
```

La app aparecerá en el menú de aplicaciones del móvil con el nombre **UnlockHub**.

> ⚠️ **Habilitar instalación de fuentes desconocidas** si el dispositivo lo requiere:
> Ajustes → Seguridad → Instalar apps desconocidas → habilitar para ADB o el gestor de archivos.

---

## ⚡ 7. Recompilar rápido (sin prebuild)

Cuando **solo cambia código TypeScript/JavaScript** (sin tocar `app.json`, sin instalar nuevas dependencias nativas), se puede saltar el paso 4.1 y 4.2:

```powershell
# Desde apps\mobile\

# 1. Regenerar bundle JS
$env:EXPO_PUBLIC_API_URL = "https://unlockhub-production.up.railway.app"
$env:NODE_ENV            = "production"

npx react-native bundle `
  --platform android `
  --dev false `
  --entry-file "..\..\node_modules\expo-router\entry.js" `
  --bundle-output android\app\src\main\assets\index.android.bundle `
  --assets-dest android\app\src\main\res

# 2. Compilar APK (incremental)
$env:JAVA_HOME    = "C:\Program Files\Android\Android Studio\jbr"
$env:ANDROID_HOME = "C:\Users\<TU_USUARIO>\AppData\Local\Android\Sdk"
cd android; .\gradlew assembleDebug; cd ..

# 3. Instalar (actualización)
adb install -r android\app\build\outputs\apk\debug\app-debug.apk
```

---

## 🔍 8. Solución de problemas frecuentes

| Problema | Causa probable | Solución |
|---|---|---|
| `adb : The term 'adb' is not recognized` | PATH no configurado | Añadir `%ANDROID_HOME%\platform-tools` al PATH o usar ruta absoluta |
| `java : El término 'java' no se reconoce` | `%JAVA_HOME%\bin` no está en el PATH | `$env:Path += ";$env:JAVA_HOME\bin"` (o añadirlo de forma permanente en `sysdm.cpl`) |
| `npx : No se puede cargar el archivo npx.ps1` | Política de ejecución de scripts bloqueada | Ejecutar `Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser` y abrir nueva terminal |
| `JAVA_HOME is not set` | Variable no configurada | `$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"` |
| `SDK location not found` | `ANDROID_HOME` no configurado | Setear `ANDROID_HOME` o crear `local.properties` (ver sección 9) |
| App muestra `localhost:3000` | `NODE_ENV` no era `production` | Setear `$env:NODE_ENV = "production"` antes del bundle |
| `Unable to load script` / pantalla roja | Bundle JS no generado antes de Gradle | Ejecutar paso 4.3 antes del paso 4.4 |
| Bundle generado pero app crashea al inicio | AdMob meta-data falta en `AndroidManifest.xml` | Añadir el bloque del paso 4.2 |
| `INSTALL_FAILED_UPDATE_INCOMPATIBLE` | La APK instalada tiene diferente firma | `adb uninstall com.unlockhub.app` y luego instalar de nuevo |
| `Signatures do not match` | Mismo que arriba | `adb uninstall com.unlockhub.app` |
| Gradle falla con `Kotlin metadata version mismatch` | Versión de Kotlin incompatible con la librería | No actualizar `react-native-google-mobile-ads` por encima de v13.6.1 (ver decisión documentada en CLAUDE.md) |
| `adb devices` muestra `unauthorized` | Diálogo de confianza no aceptado en el móvil | Desconectar y reconectar el cable; aceptar el diálogo en el móvil |
| `emulator: command not found` | PATH no incluye carpeta emulator | Añadir `%ANDROID_HOME%\emulator` al PATH |
| Build exitoso pero bundle stale (app desactualizada) | Metro usó caché de bundle anterior | Borrar `android\app\src\main\assets\index.android.bundle` y regenerar |
| Primera compilación Gradle falla con timeout | Descarga de dependencias lenta | Reintentar; Gradle descarga las dependencias solo la primera vez |

### Verificar que el bundle es reciente antes de instalar

Antes de instalar la APK, confirmar que el bundle se generó en esta sesión:

```powershell
Get-Item "android\app\src\main\assets\index.android.bundle" | Select-Object LastWriteTime
```

Si la fecha no corresponde a hace unos minutos, el bundle es antiguo y la APK instalada no tendrá los últimos cambios. Borrarlo y regenerar:

```powershell
Remove-Item "android\app\src\main\assets\index.android.bundle"
```

Y volver a ejecutar el paso 4.3 (bundle JS) + 4.4 (Gradle) + instalación.

### Limpiar caché de Metro

Si sospechas que Metro está sirviendo código antiguo:

```powershell
# Desde apps\mobile\
npx expo start --clear
# Ctrl+C para parar una vez que arranque (solo borra la caché)
```

O borrar manualmente:

```powershell
Remove-Item -Recurse -Force "$env:TEMP\metro-*" -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force "apps\mobile\.expo" -ErrorAction SilentlyContinue
```

---

## 🗂️ 9. Crear local.properties (alternativa a variables de entorno)

Si no quieres setear variables de entorno globales, crea el fichero `apps\mobile\android\local.properties` con el siguiente contenido:

```properties
sdk.dir=C\:\\Users\\<TU_USUARIO>\\AppData\\Local\\Android\\Sdk
```

> **Importante:** las barras invertidas llevan doble escape (`\\`) en este fichero.

Este fichero está listado en `.gitignore` y **nunca se commitea** al repositorio. Gradle lo lee automáticamente para encontrar el SDK sin necesidad de `ANDROID_HOME`.

Ejemplo con usuario real `Juanjo`:

```properties
sdk.dir=C\:\\Users\\Juanjo\\AppData\\Local\\Android\\Sdk
```

---

## ⚡ TL;DR — Comandos mínimos

Para cuando ya sabes lo que haces y solo necesitas un recordatorio rápido.

### Build completo (primer build o tras cambios nativos)

```powershell
# Desde C:\Users\Juanjo\Desktop\UnlockHub\apps\mobile\

npx expo prebuild --platform android --clean

# *** MANUAL: añadir meta-data AdMob en android\app\src\main\AndroidManifest.xml ***

$env:EXPO_PUBLIC_API_URL = "https://unlockhub-production.up.railway.app"
$env:NODE_ENV = "production"
New-Item -ItemType Directory -Force -Path android\app\src\main\assets | Out-Null
npx react-native bundle --platform android --dev false --entry-file "..\..\node_modules\expo-router\entry.js" --bundle-output android\app\src\main\assets\index.android.bundle --assets-dest android\app\src\main\res

$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
$env:ANDROID_HOME = "C:\Users\Juanjo\AppData\Local\Android\Sdk"
cd android; .\gradlew assembleDebug; cd ..

adb install -r android\app\build\outputs\apk\debug\app-debug.apk
```

### Recompilación rápida (solo cambios JS)

```powershell
# Desde C:\Users\Juanjo\Desktop\UnlockHub\apps\mobile\

$env:EXPO_PUBLIC_API_URL = "https://unlockhub-production.up.railway.app"
$env:NODE_ENV = "production"
npx react-native bundle --platform android --dev false --entry-file "..\..\node_modules\expo-router\entry.js" --bundle-output android\app\src\main\assets\index.android.bundle --assets-dest android\app\src\main\res

$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
$env:ANDROID_HOME = "C:\Users\Juanjo\AppData\Local\Android\Sdk"
cd android; .\gradlew assembleDebug; cd ..

adb install -r android\app\build\outputs\apk\debug\app-debug.apk
```

### Localizar la APK

```
apps\mobile\android\app\build\outputs\apk\debug\app-debug.apk
```

### Desinstalar la app del dispositivo

```powershell
adb uninstall com.unlockhub.app
```

---

*Última actualización: 2026-06-15 — Sesión 25*
