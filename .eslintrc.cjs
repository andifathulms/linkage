module.exports = {
  root: true,
  env: { browser: true, es2022: true },
  parser: '@typescript-eslint/parser',
  parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
  plugins: ['@typescript-eslint'],
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
  rules: {
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    '@typescript-eslint/no-explicit-any': 'error',
    // CLAUDE.md non-negotiable 3: the generator is seeded and pure.
    'no-restricted-properties': [
      'error',
      { object: 'Math', property: 'random', message: 'Use the seeded RNG in src/engine/rng.ts.' },
    ],
  },
  ignorePatterns: ['dist', 'node_modules'],
};
