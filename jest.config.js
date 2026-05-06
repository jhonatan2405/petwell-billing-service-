/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],

  // ── Transform ────────────────────────────────────────────
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      tsconfig: {
        // Relax strict for tests without touching src tsconfig
        strict: false,
        esModuleInterop: true,
        skipLibCheck: true,
      },
    }],
  },

  // ── Coverage ─────────────────────────────────────────────
  collectCoverage: false,          // only when --coverage flag is passed
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/server.ts',              // entry point — just wires things together
    '!src/config/supabase.ts',     // thin Supabase client init
    '!src/**/*.d.ts',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  coverageThreshold: {
    global: {
      statements: 75,
      branches:   60,
      functions:  75,
      lines:      75,
    },
  },

  // ── Aliases / env ─────────────────────────────────────────
  setupFiles: ['<rootDir>/tests/setup.ts'],

  // ── Timeouts ──────────────────────────────────────────────
  testTimeout: 15000,
};
