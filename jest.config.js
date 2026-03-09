/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  testMatch: ['**/__tests__/**/*.test.ts'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: 'tsconfig.json' }],
  },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx'],
  testEnvironment: 'node',
  // Avoid loading heavy native modules in unit tests
  moduleNameMapper: {
    '^firebase/(.*)$': '<rootDir>/__tests__/__mocks__/firebase.ts',
  },
};
