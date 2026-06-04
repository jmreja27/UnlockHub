module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: [
    '@testing-library/jest-native/extend-expect',
    '<rootDir>/jest.setup.ts',
  ],
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@shopify/flash-list|nativewind|tailwindcss)',
  ],
  moduleNameMapper: {
    '^react-native-worklets$': '<rootDir>/__mocks__/react-native-worklets.js',
    '^@/(.*)$': '<rootDir>/$1',
    '^@unlockhub/types$': '<rootDir>/../../packages/types/src/index.ts',
    '^@unlockhub/validators$': '<rootDir>/../../packages/validators/src/index.ts',
  },
};
