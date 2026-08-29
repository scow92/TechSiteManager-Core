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
      globals: { ...globals.browser, OfflineStore: 'readonly', OfflineSync: 'readonly' }
    }
  },
  {
    files: ['public/js/api.js', 'public/js/auth.js', 'public/js/dom.js', 'public/js/main.js', 'public/js/offline-ui.js', 'public/js/import/**/*.js', 'public/js/views/**/*.js'],
    languageOptions: {
      sourceType: 'module',
      globals: { ...globals.browser, OfflineStore: 'readonly', OfflineSync: 'readonly' }
    }
  }
];
