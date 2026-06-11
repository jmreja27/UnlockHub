module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint', 'react', 'react-hooks', 'import', 'security'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react/recommended',
    'plugin:react-hooks/recommended',
    'prettier',
  ],
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
  },
  rules: {
    '@typescript-eslint/no-explicit-any': 'error',
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    '@typescript-eslint/consistent-type-imports': ['warn', { prefer: 'type-imports' }],
    'import/order': [
      'warn',
      {
        groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index'],
        'newlines-between': 'always',
      },
    ],
    'react/react-in-jsx-scope': 'off',
    'no-console': ['warn', { allow: ['warn', 'error'] }],
    'security/detect-unsafe-regex': 'warn',
    'security/detect-possible-timing-attacks': 'warn',
    'security/detect-child-process': 'warn',
  },
  settings: {
    react: {
      version: 'detect',
    },
  },
  overrides: [
    {
      files: ['*.js'],
      rules: {
        '@typescript-eslint/no-var-requires': 'off',
      },
    },
    {
      // Los tests usan jest.mock() entre imports (patrón Jest estándar) y
      // jest.requireActual con typeof import() para tipado de módulos mockeados.
      // ESLint no puede auto-fixear estas mezclas, así que desactivamos las
      // reglas que generan falsos positivos solo en ficheros de test.
      files: ['**/__tests__/**/*.ts', '**/__tests__/**/*.tsx', '**/*.test.ts', '**/*.test.tsx', '**/*.spec.ts'],
      rules: {
        'import/order': 'off',
        '@typescript-eslint/consistent-type-imports': 'off',
      },
    },
  ],
  ignorePatterns: ['node_modules/', 'dist/', '.expo/', 'coverage/', '*.tsbuildinfo'],
};
