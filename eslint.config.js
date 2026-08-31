import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
  // Never lint build output, dependencies or scratch areas. `server/dist/` is
  // compiled JavaScript — linting it produced ~25 phantom "errors" about
  // globals that only exist in the sources it was built from.
  {
    ignores: [
      'dist/**',
      'server/dist/**',
      '**/node_modules/**',
      'coverage/**',
      'scratch/**',
      'reporting/**',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      // `_name` opts an argument out; `ignoreRestSiblings` lets the
      // `const { dropMe, ...rest } = x` idiom stand — dropping a key is the
      // point of that line, not an oversight.
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],
    },
  },

  // Browser half: the SPA under src/.
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      globals: { ...globals.browser },
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      // The two classic rules only. The React Compiler rules that ship in
      // `recommended-latest` are a separate (large) piece of work.
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },

  // Node half: the API, its scripts, the ETL loaders and the root tooling config.
  {
    files: [
      'server/**/*.{ts,mjs,js}',
      '*.config.{js,ts}',
      'scripts/**/*.{js,mjs,ts}',
    ],
    languageOptions: {
      globals: { ...globals.node },
    },
  },

  // Tests run under vitest with `globals: true`.
  {
    files: ['**/__tests__/**/*.{ts,tsx}', '**/*.test.{ts,tsx}'],
    languageOptions: {
      globals: { ...globals.node, ...globals.vitest },
    },
  }
);
