// Configuración compartida para todos los scripts de carga
export const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

// Credenciales de prueba — usar cuenta de test dedicada, nunca producción real
export const TEST_EMAIL = __ENV.TEST_EMAIL || 'demo@unlockhub.test';
export const TEST_PASSWORD = __ENV.TEST_PASSWORD || 'Demo1234!';

// Opciones por defecto: 100 usuarios concurrentes, umbral p95 < 500ms
export const defaultOptions = {
  vus: 100,
  duration: '60s',
  thresholds: {
    http_req_duration: ['p(95)<500'],
    http_req_failed: ['rate<0.01'], // menos del 1% de errores
  },
};
