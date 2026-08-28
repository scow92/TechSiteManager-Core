const globals = require('globals');

module.exports = [
  {
    ignores: ['node_modules/**', 'sbom.cdx.json'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: { ...globals.node }
    },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-eval': 'error'
    }
  },
  {
    files: ['public/**/*.js'],
    languageOptions: {
      sourceType: 'script',
      globals: { ...globals.browser, OfflineStore: 'readonly' }
    }
  }
];
