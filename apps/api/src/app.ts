// Sentry debe inicializarse antes que cualquier otro módulo — el import split es intencional.
/* eslint-disable import/order */
import * as Sentry from '@sentry/node';
/* eslint-enable import/order */

// Inicializar Sentry antes que cualquier otro módulo para capturar errores desde el arranque
Sentry.init({
  dsn: process.env['SENTRY_DSN'],
  environment: process.env['NODE_ENV'] ?? 'production',
  tracesSampleRate: 0.1,
  enabled: !!process.env['SENTRY_DSN'],
});

import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import compression from 'compression';

import { globalRateLimiter } from './middleware/rateLimiter';
import { errorHandler } from './middleware/errorHandler';
import router from './routes';

const app = express();

// Necesario para que express-rate-limit funcione correctamente detrás de Fly.io / proxies
app.set('trust proxy', 1);

app.use(helmet());
app.use(
  cors({
    origin: process.env['CORS_ORIGIN']?.split(',').filter(Boolean) ?? [],
    credentials: true,
  }),
);

app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));
app.use(cookieParser());
app.use(compression());

// /health excluido del rate limiter — UptimeRobot y Railway healthcheck no deben bloquearse
app.get('/health', (_req, res) => {
  const maintenance = process.env['MAINTENANCE_MODE'] === 'true';
  res.status(maintenance ? 503 : 200).json({
    status: maintenance ? 'maintenance' : 'ok',
    maintenance,
    timestamp: new Date().toISOString(),
  });
});

app.use(globalRateLimiter);

app.use('/api/v1', router);

// El error handler siempre va al final
app.use(errorHandler);

export default app;
