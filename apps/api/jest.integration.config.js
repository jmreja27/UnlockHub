/** @type {import('jest').Config} */
const base = require('./jest.config.js');

// Tests de integración: contra Redis real (BullMQ Queue/Worker sin mockear).
// Requiere REDIS_URL apuntando a un Redis disponible — en local: `docker-compose up redis`.
const config = {
  ...base,
  testPathIgnorePatterns: ['/node_modules/'],
  testMatch: ['**/*.integration.test.ts'],
  testTimeout: 20000,
  collectCoverage: false,
};

module.exports = config;
