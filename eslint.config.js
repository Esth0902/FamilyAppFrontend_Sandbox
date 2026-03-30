// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const reactNativePlugin = require('eslint-plugin-react-native');

module.exports = defineConfig([
  expoConfig,
  {
    files: ['app/(app)/**/*.tsx', 'app/(auth)/**/*.tsx'],
    plugins: {
      'react-native': reactNativePlugin,
    },
    rules: {
      'react-native/no-inline-styles': 'warn',
      'react-native/no-color-literals': 'warn',
    },
  },
  {
    files: ['src/**/*.ts', 'src/**/*.tsx'],
    plugins: {
      'react-native': reactNativePlugin,
    },
    rules: {
      'import/no-unresolved': 'error',
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      }],
      'react-hooks/exhaustive-deps': 'warn',
      'react/no-unescaped-entities': 'error',
      // no-floating-promises is kept out of scope here:
      // this rule requires typed-lint (parserOptions.project/service),
      // which is not enabled in the current config.
    },
  },
  {
    ignores: ['dist/*'],
  },
]);
