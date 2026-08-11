import baseConfig from '../../eslint.config.mjs';

export default [
  ...baseConfig,
  {
    files: ['**/*.json'],
    rules: {
      '@nx/dependency-checks': [
        'error',
        {
          ignoredFiles: ['{projectRoot}/eslint.config.{js,cjs,mjs,ts,cts,mts}'],
          // `@swc/helpers` is a runtime dependency injected by the SWC build
          // (`externalHelpers: true` emits `require("@swc/helpers/...")`), so it
          // never appears as an import in the source the rule scans.
          //
          // `@nx/react` / `@nx/react-native` / `@nx/vue` are *optional* peers the
          // domain generator loads on demand via `ensurePackage` only under the
          // matching preset — they must not be hard dependencies of the plugin
          // (that would force every consumer to install framework tooling), so
          // they are intentionally absent from `dependencies`.
          //
          // `eslint` is only ever imported for its `Linter` *type* (erased at
          // runtime). Declaring it as a runtime dependency would drag ESLint 8
          // into consumer workspaces and flip `@nx/eslint`'s config detection to
          // the legacy `.eslintrc` format, so it stays out of `dependencies`.
          ignoredDependencies: [
            '@swc/helpers',
            '@nx/react',
            '@nx/react-native',
            '@nx/vue',
            'eslint',
          ],
        },
      ],
    },
    languageOptions: {
      parser: await import('jsonc-eslint-parser'),
    },
  },
  {
    ignores: ['**/out-tsc'],
  },
  {
    files: ['**/package.json', '**/generators.json'],
    rules: {
      '@nx/nx-plugin-checks': 'error',
    },
    languageOptions: {
      parser: await import('jsonc-eslint-parser'),
    },
  },
];
