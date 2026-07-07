# UnlockHub
Aplicación de seguimiento de logros de varias plataformas

## Tests

- `npm test --workspace=apps/api` — tests unitarios (todo mockeado, sin infraestructura externa).
- `npm run test:integration --workspace=apps/api` — tests de integración BullMQ contra Redis real
  (Queue/Worker sin mockear). Requiere Redis corriendo: `docker-compose up redis`. En CI corren
  contra el `redis:7-alpine` service container ya definido en `.github/workflows/ci.yml`.
