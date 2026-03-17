// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

// Mock firebase
jest.mock('../services/firebase', () => ({
  db: {},
  auth: {
    currentUser: null,
  },
}));

// Mock logger
jest.mock('../utils/logger', () => ({
  logger: {
    log: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));
