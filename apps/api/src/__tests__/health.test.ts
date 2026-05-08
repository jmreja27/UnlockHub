import request from 'supertest';

import app from '../app';

describe('Health check', () => {
  it('GET /health devuelve status ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('status', 'ok');
    expect(res.body).toHaveProperty('maintenance', false);
    expect(res.body).toHaveProperty('timestamp');
  });

  it('GET /health devuelve 503 en modo mantenimiento', async () => {
    const original = process.env['MAINTENANCE_MODE'];
    process.env['MAINTENANCE_MODE'] = 'true';

    const res = await request(app).get('/health');
    expect(res.status).toBe(503);
    expect(res.body).toHaveProperty('status', 'maintenance');
    expect(res.body).toHaveProperty('maintenance', true);

    process.env['MAINTENANCE_MODE'] = original;
  });

  it('GET /api/v1 devuelve info de la API', async () => {
    const res = await request(app).get('/api/v1');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('name', 'UnlockHub API');
    expect(res.body).toHaveProperty('version', '1.0.0');
  });

  it('GET /ruta-inexistente devuelve 404', async () => {
    const res = await request(app).get('/ruta-inexistente');
    expect(res.status).toBe(404);
  });
});
