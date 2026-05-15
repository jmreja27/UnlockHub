import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';

import { sendAll } from '../services/notification.service';
import { getAdminMetrics } from '../services/admin.service';
import { logger } from '../lib/logger';

const maintenanceNotifySchema = z.object({
  title: z.string().min(1).max(100),
  body: z.string().min(1).max(300),
});

export async function notifyMaintenanceHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { title, body } = maintenanceNotifySchema.parse(req.body);

    res.json({ ok: true, message: 'Notificación en proceso de envío' });

    void sendAll(title, body, { type: 'maintenance' }).catch((err: unknown) => {
      logger.error({ err }, '[admin] Error enviando notificación de mantenimiento');
    });
  } catch (err) {
    next(err);
  }
}

export async function getMetricsHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const metrics = await getAdminMetrics();
    res.json(metrics);
  } catch (err) {
    next(err);
  }
}

export async function getDashboardHandler(
  _req: Request,
  res: Response,
): Promise<void> {
  // Dashboard HTML mínimo para monitoreo sin framework frontend
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(`<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>UnlockHub — Admin Dashboard</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: system-ui, sans-serif; background: #0f172a; color: #e2e8f0; padding: 2rem; }
  h1 { font-size: 1.5rem; font-weight: 700; margin-bottom: 0.25rem; color: #818cf8; }
  .subtitle { color: #64748b; font-size: 0.875rem; margin-bottom: 2rem; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 1rem; }
  .card { background: #1e293b; border: 1px solid #334155; border-radius: 12px; padding: 1.25rem; }
  .card-title { font-size: 0.75rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b; margin-bottom: 1rem; }
  .metric { display: flex; justify-content: space-between; align-items: center; padding: 0.5rem 0; border-bottom: 1px solid #334155; }
  .metric:last-child { border-bottom: none; }
  .metric-label { font-size: 0.875rem; color: #94a3b8; }
  .metric-value { font-size: 1rem; font-weight: 700; color: #f1f5f9; }
  .metric-value.warn { color: #fbbf24; }
  .metric-value.danger { color: #f87171; }
  .refresh { margin-top: 2rem; color: #64748b; font-size: 0.75rem; }
  a { color: #818cf8; }
</style>
</head>
<body>
<h1>UnlockHub Admin</h1>
<p class="subtitle">Dashboard de métricas — <span id="now"></span></p>
<div class="grid" id="grid">
  <div class="card"><div class="card-title">Cargando métricas…</div></div>
</div>
<p class="refresh">Auto-refresca cada 60 segundos. <a href="#" onclick="load()">Refrescar ahora</a></p>

<script>
async function load() {
  const r = await fetch('/api/v1/admin/metrics', {
    headers: { 'Authorization': 'Bearer ' + (sessionStorage.getItem('adminToken') || prompt('Admin token:')) }
  });
  if (!r.ok) { alert('No autorizado'); return; }
  const d = await r.json();
  document.getElementById('now').textContent = new Date().toLocaleString();
  document.getElementById('grid').innerHTML = \`
    <div class="card">
      <div class="card-title">Usuarios</div>
      <div class="metric"><span class="metric-label">Total</span><span class="metric-value">\${d.users.total.toLocaleString()}</span></div>
      <div class="metric"><span class="metric-label">Registrados hoy</span><span class="metric-value">\${d.users.registeredToday}</span></div>
      <div class="metric"><span class="metric-label">Registrados esta semana</span><span class="metric-value">\${d.users.registeredThisWeek}</span></div>
      <div class="metric"><span class="metric-label">Premium activos</span><span class="metric-value">\${d.users.premiumActive}</span></div>
    </div>
    <div class="card">
      <div class="card-title">Sincronizaciones</div>
      <div class="metric"><span class="metric-label">Completadas (24h)</span><span class="metric-value">\${d.syncs.completedLast24h.toLocaleString()}</span></div>
      <div class="metric"><span class="metric-label">Fallidas (24h)</span><span class="metric-value \${d.syncs.failedLast24h > 10 ? 'danger' : ''}">\${d.syncs.failedLast24h}</span></div>
      <div class="metric"><span class="metric-label">Jobs en cola</span><span class="metric-value \${d.syncs.queueDepth > 100 ? 'warn' : ''}">\${d.syncs.queueDepth}</span></div>
    </div>
    <div class="card">
      <div class="card-title">Errores servidor</div>
      <div class="metric"><span class="metric-label">5xx (24h)</span><span class="metric-value \${d.errors.serverErrors5xxLast24h > 0 ? 'danger' : ''}">\${d.errors.serverErrors5xxLast24h}</span></div>
    </div>
    <div class="card">
      <div class="card-title">Steam API</div>
      <div class="metric"><span class="metric-label">Llamadas hoy</span><span class="metric-value">\${d.steam.apiCallsToday.toLocaleString()}</span></div>
      <div class="metric"><span class="metric-label">Uso del límite diario</span><span class="metric-value \${d.steam.apiCallsLimitPercent >= 90 ? 'danger' : d.steam.apiCallsLimitPercent >= 80 ? 'warn' : ''}">\${d.steam.apiCallsLimitPercent}%</span></div>
    </div>
    <div class="card">
      <div class="card-title">Comunidad (UGC)</div>
      <div class="metric"><span class="metric-label">Guías reportadas pendientes</span><span class="metric-value \${d.ugc.guidesReportedPending > 0 ? 'warn' : ''}">\${d.ugc.guidesReportedPending}</span></div>
    </div>
  \`;
}
load();
setInterval(load, 60000);
</script>
</body>
</html>`);
}
