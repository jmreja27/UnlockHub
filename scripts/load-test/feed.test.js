/**
 * Test de carga: GET /api/v1/feed
 * Umbral: p95 < 500ms con 100 usuarios concurrentes
 *
 * Ejecutar:
 *   k6 run scripts/load-test/feed.test.js
 */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { BASE_URL, TEST_EMAIL, TEST_PASSWORD, defaultOptions } from './config.js';

export const options = defaultOptions;

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

  const res = http.get(`${BASE_URL}/api/v1/feed?page=1&limit=20`, params);

  check(res, {
    'status 200': (r) => r.status === 200,
    'tiene data[]': (r) => {
      try {
        return Array.isArray(JSON.parse(r.body).data);
      } catch {
        return false;
      }
    },
  });

  sleep(1);
}
