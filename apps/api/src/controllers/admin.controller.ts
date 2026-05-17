import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';

import { sendAll } from '../services/notification.service';
import { getAdminMetrics } from '../services/admin.service';
import { seedCatalogQueue } from '../jobs/seed-catalog.queue';
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

export async function triggerSeedCatalogHandler(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const job = await seedCatalogQueue.add(
      'manual-seed',
      { platforms: ['STEAM', 'RA'], triggeredBy: 'admin_manual' },
      { jobId: `manual-seed-${Date.now()}` },
    );
    logger.info({ jobId: job.id }, '[admin] Seed de catálogo encolado manualmente');
    res.json({ ok: true, jobId: job.id, message: 'Seed de catálogo encolado correctamente' });
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
  .actions { margin-top: 1.5rem; display: flex; gap: 0.75rem; flex-wrap: wrap; }
  .btn { background: #312e81; color: #e0e7ff; border: 1px solid #4338ca; border-radius: 8px; padding: 0.5rem 1.25rem; font-size: 0.875rem; font-weight: 600; cursor: pointer; }
  .btn:hover { background: #3730a3; }
  .btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .toast { position: fixed; bottom: 1.5rem; right: 1.5rem; background: #1e293b; border: 1px solid #334155; border-radius: 10px; padding: 0.75rem 1.25rem; color: #e2e8f0; font-size: 0.875rem; display: none; }
</style>
</head>
<body>
<h1>UnlockHub Admin</h1>
<p class="subtitle">Dashboard de métricas — <span id="now"></span></p>
<div class="grid" id="grid">
  <div class="card"><div class="card-title">Cargando métricas…</div></div>
</div>
<div class="actions">
  <button class="btn" id="btnSeed" onclick="triggerSeed()">Actualizar catálogo (Steam + RA)</button>
</div>
<div id="toast" class="toast"></div>
<p class="refresh">Auto-refresca cada 60 segundos. <a href="#" onclick="load()">Refrescar ahora</a></p>

<script>
function getToken() {
  return sessionStorage.getItem('adminToken') || (function() {
    const t = prompt('Admin token:');
    if (t) sessionStorage.setItem('adminToken', t);
    return t;
  })();
}
function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.style.display = 'block';
  setTimeout(() => { el.style.display = 'none'; }, 4000);
}
async function triggerSeed() {
  const btn = document.getElementById('btnSeed');
  btn.disabled = true;
  btn.textContent = 'Encolando...';
  try {
    const r = await fetch('/api/v1/admin/seed-catalog', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + getToken() },
    });
    const d = await r.json();
    showToast(r.ok ? \`✓ \${d.message} (jobId: \${d.jobId})\` : \`✗ Error: \${d.error ?? 'desconocido'}\`);
  } catch (e) {
    showToast(\`✗ Error de red: \${e.message}\`);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Actualizar catálogo (Steam + RA)';
  }
}
async function load() {
  const r = await fetch('/api/v1/admin/metrics', {
    headers: { 'Authorization': 'Bearer ' + getToken() }
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
