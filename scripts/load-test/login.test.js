/**
 * Test de carga: POST /api/v1/auth/login
 * Umbral: p95 < 500ms con 100 usuarios concurrentes
 *
 * Ejecutar:
 *   k6 run scripts/load-test/login.test.js
 *   k6 run --env BASE_URL=https://api.staging.unlockhub.app scripts/load-test/login.test.js
 */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { BASE_URL, TEST_EMAIL, TEST_PASSWORD, defaultOptions } from './config.js';

export const options = defaultOptions;

export default function () {
  const payload = JSON.stringify({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
  });

  const params = {
    headers: { 'Content-Type': 'application/json' },
  };

  const res = http.post(`${BASE_URL}/api/v1/auth/login`, payload, params);

  check(res, {
    'status es 200': (r) => r.status === 200,
    'devuelve accessToken': (r) => {
      try {
        return JSON.parse(r.body).accessToken !== undefined;
      } catch {
        return false;
      }
    },
  });

  sleep(1);
}
