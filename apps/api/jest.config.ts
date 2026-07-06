import type { Config } from 'jest';
const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/test'],
  testMatch: ['**/*.spec.ts', '**/*.e2e-spec.ts'],
  setupFilesAfterEnv: ['<rootDir>/test/jest.setup.ts'],
  testTimeout: 30000,
  // Each e2e suite boots its own in-memory mongod; unbounded parallelism
  // causes 10s startup timeouts on loaded machines.
  maxWorkers: 4,
};
export default config;
