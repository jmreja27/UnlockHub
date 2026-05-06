import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts', '**/*.test.ts'],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/index.ts',
    '!src/app.ts',
    '!src/**/__tests__/**',
    // Infraestructura: singletons de conexión y bootstrapping de entorno
    '!src/lib/prisma.ts',
    '!src/lib/redis.ts',
    '!src/config/env.ts',
    // Jobs BullMQ y adaptadores de plataformas — dependencias de sistemas externos
    '!src/jobs/**',
    '!src/platforms/**',
  ],
};

export default config;
