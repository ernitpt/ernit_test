/**
 * Jest configuration for Cloud Functions unit tests.
 *
 * Uses ts-jest (from the root node_modules) to compile TypeScript directly —
 * no build step required. The tsconfig.test.json overrides the production
 * module: "Node16" setting to "CommonJS" so Jest can handle imports.
 *
 * Run from repo root: npx jest --config functions/jest.config.js
 * Or from functions/: node ../node_modules/jest-cli/bin/jest.js
 */
/** @type {import('@jest/types').Config.InitialOptions} */
module.exports = {
  displayName: 'functions',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: '<rootDir>/tsconfig.test.json',
      },
    ],
  },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  // ts-jest must be resolved from root node_modules — tell Jest where to look
  resolver: undefined,
};
