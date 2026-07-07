/** @type {import('jest').Config} */
const config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  globals: {
    'ts-jest': { tsconfig: 'tsconfig.test.json' },
  },
  forceExit: true,
  coverageThreshold: {
    global: { lines: 80 },
  },
  moduleNameMapper: {
    '^@unlockhub/types$': '<rootDir>/../../packages/types/src/index.ts',
    '^@unlockhub/validators$': '<rootDir>/../../packages/validators/src/index.ts',
  },
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts', '**/*.test.ts'],
  // Los tests *.integration.test.ts requieren Redis real — corren aparte via `npm run test:integration`
  // (ver jest.integration.config.js) para que `npm test` nunca dependa de infraestructura externa.
  testPathIgnorePatterns: ['/node_modules/', '\\.integration\\.test\\.ts$'],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/index.ts',
    '!src/app.ts',
    '!src/**/__tests__/**',
    '!src/lib/prisma.ts',
    '!src/lib/redis.ts',
    '!src/config/env.ts',
    '!src/jobs/**',
    '!src/platforms/**',
    '!src/lib/socket.ts',
    '!src/sockets/**',
  ],
};

module.exports = config;
