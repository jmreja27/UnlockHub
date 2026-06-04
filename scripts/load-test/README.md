# Load tests — k6

Scripts de carga para los endpoints críticos de UnlockHub. Umbral de aceptación: **p95 < 500ms con 100 usuarios concurrentes**.

## Requisitos

```bash
# macOS
brew install k6

# Windows
choco install k6

# Linux
sudo apt-key adv --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
echo "deb https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt update && sudo apt install k6
```

## Scripts disponibles

| Script | Endpoint | VUs | Duración |
|---|---|---|---|
| `login.test.js` | `POST /api/v1/auth/login` | 100 | 60s |
| `rankings.test.js` | `GET /api/v1/rankings` | 100 | 60s |
| `feed.test.js` | `GET /api/v1/feed` | 100 | 60s |
| `sync.test.js` | `POST /api/v1/sync/all` | 10 | 30s |

> `sync.test.js` usa VUs reducidos para no saturar las APIs de Steam, RetroAchievements y PSN.

## Ejecutar contra staging

```bash
# Un script concreto (sustituir por la URL de Railway cuando esté disponible)
k6 run --env BASE_URL=https://PENDIENTE-URL-RAILWAY-STAGING.up.railway.app scripts/load-test/login.test.js

# Con credenciales de staging
k6 run \
  --env BASE_URL=https://PENDIENTE-URL-RAILWAY-STAGING.up.railway.app \
  --env TEST_EMAIL=demo@unlockhub.test \
  --env TEST_PASSWORD=Demo1234! \
  scripts/load-test/rankings.test.js

# Todos los scripts en secuencia (esperar a que termine cada uno)
for script in login rankings feed; do
  k6 run --env BASE_URL=https://PENDIENTE-URL-RAILWAY-STAGING.up.railway.app \
    "scripts/load-test/${script}.test.js"
done
```

## Ejecutar contra local

```bash
k6 run scripts/load-test/login.test.js
# BASE_URL por defecto: http://localhost:3000
# Credenciales por defecto: demo@unlockhub.test / Demo1234!
```

## Interpretar resultados

k6 muestra al final un resumen con los percentiles de latencia. Buscar:

- `http_req_duration p(95)` — debe ser < 500ms
- `http_req_failed rate` — debe ser < 1%
- `checks` — deben pasar al 100%

Si algún umbral falla, k6 sale con código de error 99.

## Cuándo ejecutar

- Antes de cada lanzamiento importante
- Antes de escalar a 2 réplicas en Railway (acción N3)
- Tras cualquier cambio que afecte los endpoints críticos
