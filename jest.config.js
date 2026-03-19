module.exports = {
  projects: [
    // ── React Native / Expo app tests ─────────────────────────────────────
    {
      displayName: 'app',
      preset: 'jest-expo',
      transformIgnorePatterns: [
        'node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|expo-modules-core|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg|moti|partycles|lucide-react-native)/)',
      ],
      moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
      setupFiles: ['./src/__tests__/setup.ts'],
      collectCoverageFrom: [
        'src/**/*.{ts,tsx}',
        '!src/**/*.d.ts',
        '!src/types/**',
      ],
      testMatch: [
        '<rootDir>/src/**/__tests__/**/*.test.{ts,tsx}',
        '<rootDir>/src/**/*.test.{ts,tsx}',
        '<rootDir>/__tests__/**/*.test.{ts,tsx}',
      ],
      // Prevent Haste collisions from worktrees and nested package.json files
      watchPathIgnorePatterns: ['\\.claude/worktrees'],
      testPathIgnorePatterns: ['/node_modules/', '\\.claude/worktrees'],
    },
    // ── Cloud Functions unit tests (pure logic, no Firebase/Stripe infra) ──
    '<rootDir>/functions/jest.config.js',
  ],
};
