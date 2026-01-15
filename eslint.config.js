import js from '@eslint/js';
import globals from 'globals';

export default [
  js.configs.recommended,
  {
    // Configuration for Node.js server files
    files: ['**/*.js'],
    ignores: ['static/**', 'views/**'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.node,
      }
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-console': 'off',
    }
  },
  {
    // Configuration for browser-side files (static and views)
    files: ['static/**/*.js', 'views/**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'script',
      globals: {
        ...globals.browser,
        $: 'readonly',
        jQuery: 'readonly',
        bootstrap: 'readonly',
        Chart: 'readonly',
        DataTable: 'readonly',
        Masonry: 'readonly',
        Prism: 'readonly',
        universe: 'readonly',
        contributors: 'readonly',
        avatar_url: 'readonly',
        activity_data: 'readonly',
        updates: 'readonly',
        get_json: 'readonly',
        observer: 'readonly',
        msnry: 'readonly',
        newquery: 'readonly',
      }
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-console': 'off',
    }
  },
  {
    ignores: ['node_modules/**', 'logs/**', 'dummydata-*/**', 'static/prism.js']
  }
];
