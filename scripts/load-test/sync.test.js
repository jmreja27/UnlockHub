/**
 * Test de carga: POST /api/v1/sync/all
 * Umbral: p95 < 500ms para aceptar el job (el sync ocurre en background)
 *
 * NOTA: Este test dispara sync real. Ejecutar en staging con usuario de prueba.
 * Reducir VUs a 10-20 para no saturar las APIs externas (Steam, etc.).
 *
 * Ejecutar:
 *   k6 run --vus 10 --duration 30s scripts/load-test/sync.test.js
 */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { BASE_URL, TEST_EMAIL, TEST_PASSWORD } from './config.js';

export const options = {
  // Carga reducida para sync — no sobrecargar APIs de plataformas externas
  vus: 10,
  duration: '30s',
  thresholds: {
    // El endpoint acepta el job rápido; el sync ocurre en worker
    http_req_duration: ['p(95)<500'],
    http_req_failed: ['rate<0.01'],
  },
};

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

  const res = http.post(`${BASE_URL}/api/v1/sync/all`, null, params);

  check(res, {
    'sync aceptado (200 o 429)': (r) => r.status === 200 || r.status === 429,
    'respuesta en tiempo': (r) => r.timings.duration < 500,
  });

  // Espera larga entre syncs para respetar el cooldown
  sleep(5);
}
