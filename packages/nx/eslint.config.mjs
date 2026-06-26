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
          // `@nx/react` is an *optional* peer the domain generator loads on
          // demand via `ensurePackage` only under the `react` preset — it must
          // not be a hard dependency of the plugin (that would force every
          // consumer to install React tooling), so it is intentionally absent
          // from `dependencies`.
          ignoredDependencies: ['@swc/helpers', '@nx/react'],
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
