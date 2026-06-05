import js from '@eslint/js';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import globals from 'globals';
import prettierRecommended from 'eslint-plugin-prettier/recommended';
import reactDoctor from 'eslint-plugin-react-doctor';
import reactHooks from 'eslint-plugin-react-hooks';

const sourceFiles = ['src/**/*.{ts,tsx}', '*.{ts,tsx}'];

export default [
  {
    ignores: ['dist/**', 'node_modules/**', '*.js'],
  },
  js.configs.recommended,
  {
    files: sourceFiles,
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        project: './tsconfig.json',
      },
      globals: {
        ...globals.browser,
        ...globals.es2021,
        ...globals.greasemonkey,
        $: 'readonly',
        jQuery: 'readonly',
        GM_download: 'readonly',
        GM_getValue: 'readonly',
        GM_setValue: 'readonly',
        GM_xmlhttpRequest: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
      'react-hooks': reactHooks,
    },
    rules: {
      ...tsPlugin.configs['eslint-recommended'].overrides[0].rules,
      ...tsPlugin.configs.recommended.rules,
      ...reactHooks.configs.flat.recommended.rules,
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/no-non-null-assertion': 'off',
      'no-console': 'off',
    },
  },
  {
    ...reactDoctor.configs.recommended,
    files: sourceFiles,
  },
  {
    files: sourceFiles,
    rules: {
      // The userscript is a single browser IIFE, not an SSR/server-components app.
      'react-doctor/rendering-hydration-mismatch-time': 'off',
      'react-doctor/rendering-hydration-no-flicker': 'off',
      'react-doctor/server-after-nonblocking': 'off',
      'react-doctor/server-auth-actions': 'off',
      'react-doctor/server-cache-with-object-literal': 'off',
      'react-doctor/server-dedup-props': 'off',
      'react-doctor/server-fetch-without-revalidate': 'off',
      'react-doctor/server-hoist-static-io': 'off',
      'react-doctor/server-no-mutable-module-state': 'off',
      'react-doctor/server-sequential-independent-await': 'off',

      // This project does not use these state/query/schema ecosystems.
      'react-doctor/jotai-derived-atom-returns-fresh-object': 'off',
      'react-doctor/jotai-select-atom-in-render-body': 'off',
      'react-doctor/jotai-tq-use-raw-query-atom': 'off',
      'react-doctor/redux-useselector-inline-derivation': 'off',
      'react-doctor/redux-useselector-returns-new-collection': 'off',
      'react-doctor/zod-v4-no-deprecated-error-apis': 'off',
      'react-doctor/zod-v4-no-deprecated-error-customization': 'off',
      'react-doctor/zod-v4-no-deprecated-schema-apis': 'off',
      'react-doctor/zod-v4-prefer-top-level-string-formats': 'off',

      // Existing project conventions intentionally route through index modules and ship one bundled file.
      'react-doctor/no-barrel-import': 'off',
      'react-doctor/prefer-dynamic-import': 'off',

      // The automation modules intentionally serialize DOM actions, throttled requests, and page transitions.
      'react-doctor/async-await-in-loop': 'off',
      'react-doctor/async-defer-await': 'off',

      // Most scanned collections are small DOM/question lists; these micro-optimizations add review noise here.
      'react-doctor/js-combine-iterations': 'off',
      'react-doctor/js-flatmap-filter': 'off',
      'react-doctor/js-index-maps': 'off',
      'react-doctor/js-set-map-lookups': 'off',

      // Keep hooks diagnostics from the existing react-hooks plugin as the single source of truth.
      'react-doctor/exhaustive-deps': 'off',
      'react-doctor/rules-of-hooks': 'off',

      // React Compiler is not part of the current tsup userscript build.
      'react-doctor/react-compiler-no-manual-memoization': 'off',
    },
  },
  prettierRecommended,
];
