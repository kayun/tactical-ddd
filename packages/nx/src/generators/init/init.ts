import {
  addDependenciesToPackageJson,
  formatFiles,
  NX_VERSION,
  readNxJson,
  updateNxJson,
  type GeneratorCallback,
  type NxJsonConfiguration,
  type Tree,
} from '@nx/devkit';

import type { InitGeneratorSchema } from './schema';
import { DEP_CONSTRAINTS } from './module-boundaries';
import { applyDepConstraints } from '../../utils/eslint-module-boundaries';
import sharedKernelGenerator from '../shared-kernel/shared-kernel';

/**
 * Collection name this plugin publishes its generators under. Used as the key
 * in `nx.json`'s `generators` map so defaults apply to every generator we ship.
 */
const COLLECTION = '@tactical-ddd/nx';

/**
 * Generators that accept (and should inherit) the workspace-wide `prefix`.
 * Extend this list as new generators are added — for now only `shared-kernel`
 * consumes the prefix.
 */
const PREFIXED_GENERATORS = ['shared-kernel', 'domain'] as const;

/**
 * Built-in Nx library generators that should inherit the workspace-wide
 * build/lint/test defaults so hand-rolled libraries match the conventions.
 * `@nx/js:library` always applies; `@nx/react:library` is layered on only for
 * the `react` preset (see {@link setGeneratorDefaults}).
 */
const BASE_LIBRARY_GENERATORS = ['@nx/js:library'] as const;
const REACT_LIBRARY_GENERATORS = ['@nx/react:library'] as const;

/** The Tactical DDD React runtime bindings package. */
const TACTICAL_DDD_REACT = '@tactical-ddd/react';

/**
 * React runtime versions added to the *user's* workspace under the `react`
 * preset. Kept in step with the React version `@nx/react`'s own generators
 * install so the two never disagree.
 */
const REACT_VERSION = '^19.0.0';
const REACT_DOM_VERSION = '^19.0.0';

/**
 * Version specifier to install `@tactical-ddd/react` at. The React bindings are
 * released in lockstep with this plugin, so we mirror the running plugin's own
 * version. This also makes the e2e suite resolve the locally-published build:
 * both packages are published to the local registry under the same e2e version.
 */
function tacticalDddReactVersion(): string {
  try {
    // Resolves from the workspace the generator runs in, where the plugin is
    // installed (real usage and e2e).
    return require('@tactical-ddd/nx/package.json').version as string;
  } catch {
    // Source / unit-test fallback: this package's own manifest.
    return require('../../../package.json').version as string;
  }
}

export async function initGenerator(
  tree: Tree,
  options: InitGeneratorSchema,
): Promise<GeneratorCallback> {
  setGeneratorDefaults(tree, options);

  // Make sure every Nx plugin the configured/invoked generators rely on is
  // present; the returned task installs whatever was missing once the generator
  // finishes writing to the tree.
  const installDependencies = ensureGeneratorDependencies(tree, options);

  // Generate the shared kernel first: in a fresh workspace the root ESLint
  // config does not exist until the first library is generated, so this is what
  // establishes the config that `applyDepConstraints` then tunes.
  await sharedKernelGenerator(tree, {
    directory: options.sharedDirectory,
    prefix: options.prefix,
    linter: options.linter,
    unitTestRunner: options.unitTestRunner,
    bundler: options.bundler,
  });

  // Populate the root ESLint config with the Tactical DDD dependency graph so
  // the architecture is enforced at lint time. Skipped (with a warning) when
  // the workspace has no ESLint config — e.g. `linter: none`.
  applyDepConstraints(tree, DEP_CONSTRAINTS);

  await formatFiles(tree);

  return installDependencies;
}

/**
 * Ensures the Nx plugin packages the configured/invoked generators depend on are
 * declared in the workspace `package.json`, installing any that are missing.
 *
 * `addDependenciesToPackageJson` is itself the presence check: it only adds (or
 * bumps) entries that are absent or older, leaving existing versions untouched,
 * and returns a task that runs the package manager install for whatever changed.
 * All versions are pinned to `NX_VERSION` — the Nx version this plugin runs
 * against — so the added plugins stay in lockstep with the workspace's Nx core.
 *
 * Dependencies are scoped to the chosen options: the ESLint tooling is only
 * required when `linter: 'eslint'`, and the test-runner plugin follows
 * `unitTestRunner`. The `react` preset additionally pulls in the `@nx/react`
 * generator plugin (dev-time) plus the React runtime — `react`, `react-dom`
 * and the `@tactical-ddd/react` bindings — as production dependencies.
 */
function ensureGeneratorDependencies(
  tree: Tree,
  options: InitGeneratorSchema,
): GeneratorCallback {
  const dependencies: Record<string, string> = {};
  const devDependencies: Record<string, string> = {
    // Powers the shared-kernel generator (`@nx/js:library`) and the
    // `@nx/js:library` defaults written above.
    '@nx/js': NX_VERSION,
  };

  if (options.linter === 'eslint') {
    // `@nx/eslint` provides the flat-config AST utilities and lint target;
    // `@nx/eslint-plugin` provides the `@nx/enforce-module-boundaries` rule.
    devDependencies['@nx/eslint'] = NX_VERSION;
    devDependencies['@nx/eslint-plugin'] = NX_VERSION;
  }

  if (options.unitTestRunner === 'jest') {
    devDependencies['@nx/jest'] = NX_VERSION;
  } else if (options.unitTestRunner === 'vitest') {
    devDependencies['@nx/vite'] = NX_VERSION;
  }

  if (options.preset === 'react') {
    // Dev-time: powers the `@nx/react:library` defaults and React generators.
    devDependencies['@nx/react'] = NX_VERSION;
    // Run-time: the React framework and our React bindings ship in the app.
    dependencies['react'] = REACT_VERSION;
    dependencies['react-dom'] = REACT_DOM_VERSION;
    dependencies[TACTICAL_DDD_REACT] = tacticalDddReactVersion();
  }

  return addDependenciesToPackageJson(tree, dependencies, devDependencies);
}

/**
 * Persists workspace-wide generator defaults into `nx.json` so choices like the
 * organization `prefix`, linter and test runner are configured once during
 * `init` and then transparently injected by Nx into every subsequent generator
 * invocation (e.g. `nx g @tactical-ddd/nx:shared-kernel`, or even the built-in
 * `nx g @nx/js:library`) without the user re-typing them.
 *
 * Two groups of defaults are written:
 *
 *   "generators": {
 *     // 1. Our own collection — inherit the prefix and linting/testing choices.
 *     "@tactical-ddd/nx": {
 *       "shared-kernel": { "prefix": "@my-org", "linter": "eslint", "unitTestRunner": "jest" }
 *     },
 *     // 2. The built-in library generators — so hand-rolled libs match conventions.
 *     "@nx/js:library":    { "bundler": "none", "linter": "eslint", "unitTestRunner": "jest" },
 *     // `@nx/react:library` is added only under the `react` preset.
 *     "@nx/react:library": { "bundler": "none", "linter": "eslint", "unitTestRunner": "jest" }
 *   }
 */
function setGeneratorDefaults(tree: Tree, options: InitGeneratorSchema) {
  const nxJson = readNxJson(tree) ?? ({} as NxJsonConfiguration);

  const generators = (nxJson.generators ??= {}) as Record<
    string,
    Record<string, unknown>
  >;

  // 1. Our own collection's generators inherit the prefix + linting/testing.
  const collectionDefaults = (generators[COLLECTION] ??= {}) as Record<
    string,
    Record<string, unknown>
  >;

  for (const generator of PREFIXED_GENERATORS) {
    collectionDefaults[generator] = {
      ...collectionDefaults[generator],
      prefix: options.prefix,
      linter: options.linter,
      unitTestRunner: options.unitTestRunner,
      preset: options.preset,
    };
  }

  // 2. The built-in library generators get the same workspace-wide build/lint/
  // test defaults, so a plain `nx g @nx/js:library` (or `@nx/react:library`)
  // produces a library that already matches the Tactical DDD conventions.
  // `@nx/react:library` defaults are written only under the `react` preset, so
  // we don't advertise React tooling a non-React workspace never installed.
  const libraryDefaults: Record<string, unknown> = {
    bundler: options.bundler ?? 'none',
    linter: options.linter,
    unitTestRunner: options.unitTestRunner,
  };

  const libraryGenerators =
    options.preset === 'react'
      ? [...BASE_LIBRARY_GENERATORS, ...REACT_LIBRARY_GENERATORS]
      : BASE_LIBRARY_GENERATORS;

  for (const generator of libraryGenerators) {
    generators[generator] = {
      ...generators[generator],
      ...libraryDefaults,
    };
  }

  updateNxJson(tree, nxJson);
}

export default initGenerator;
