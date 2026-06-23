export enum LibraryScope {
  Shared = 'scope:shared',
  Domain = 'scope:domain',
}

export enum LibraryType {
  Contracts = 'type:contracts',
  Core = 'type:core',
  Features = 'type:features',
  Utils = 'type:utils',
  Testing = 'type:testing',
  Infrastructure = 'type:infrastructure',
}

/**
 * Module system a generated library ships in.
 *
 * Resolved in priority order (most direct signal first):
 *   1. `package.json` `"type"`        — `commonjs` → CJS, `module` → ESM
 *   2. `tsconfig.lib.json` `"module"` — `commonjs` → CJS; `esnext`/`nodenext`/`node16` → ESM
 *   3. build target executor + its `format` option (bundler-dependent)
 */
export enum ModuleFormat {
  CommonJs = 'cjs',
  EsModule = 'esm',
  Unknown = 'unknown',
}
