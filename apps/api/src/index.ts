import { validateEnv } from './config/env';
import app from './app';

const env = validateEnv();

const server = app.listen(env.PORT, () => {
  console.warn(`API arrancada en el puerto ${env.PORT} (${env.NODE_ENV})`);
});

process.on('SIGTERM', () => {
  server.close(() => {
    console.warn('Servidor cerrado.');
    process.exit(0);
  });
});

export default server;
