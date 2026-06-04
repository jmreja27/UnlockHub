/**
 * Test de carga: GET /api/v1/rankings
 * Umbral: p95 < 500ms con 100 usuarios concurrentes
 *
 * Ejecutar:
 *   k6 run scripts/load-test/rankings.test.js
 *   k6 run --env BASE_URL=https://api.staging.unlockhub.app --env TOKEN=<jwt> scripts/load-test/rankings.test.js
 */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { BASE_URL, TEST_EMAIL, TEST_PASSWORD, defaultOptions } from './config.js';

export const options = defaultOptions;

// setup() se ejecuta una vez antes del test y devuelve datos compartidos por los VUs
export function setup() {
  const res = http.post(
    `${BASE_URL}/api/v1/auth/login`,
    JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
    { headers: { 'Content-Type': 'application/json' } },
  );

  const body = JSON.parse(res.body);
  return { token: body.accessToken ?? '' };
}

export default function ({ token }) {
  const params = {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  };

  // Rankings global
  const globalRes = http.get(`${BASE_URL}/api/v1/rankings?type=global&limit=50`, params);
  check(globalRes, {
    'global: status 200': (r) => r.status === 200,
    'global: tiene data[]': (r) => {
      try {
        return Array.isArray(JSON.parse(r.body).data);
      } catch {
        return false;
      }
    },
  });

  sleep(0.5);

  // Rankings por plataforma
  const platformRes = http.get(`${BASE_URL}/api/v1/rankings?type=platform&platform=STEAM&limit=50`, params);
  check(platformRes, {
    'plataforma: status 200': (r) => r.status === 200,
  });

  sleep(1);
}
