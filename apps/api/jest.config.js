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
