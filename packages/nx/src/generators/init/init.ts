import {
  addDependenciesToPackageJson,
  formatFiles,
  generateFiles,
  NX_VERSION,
  OverwriteStrategy,
  readNxJson,
  runTasksInSerial,
  updateNxJson,
  type GeneratorCallback,
  type NxJsonConfiguration,
  type Tree,
} from '@nx/devkit';
import { resolve } from 'path';

import type { InitGeneratorSchema } from './schema';
import { DEP_CONSTRAINTS } from './module-boundaries';
import { applyDepConstraints } from '../../utils/eslint-module-boundaries';
import {
  reactNativeRuntimeDependencies,
  reactRuntimeDependencies,
} from '../../utils/react-runtime';
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
 * `@nx/js:library` always applies; the framework library generator is layered
 * on only for the matching preset (see {@link setGeneratorDefaults}).
 */
const BASE_LIBRARY_GENERATORS = ['@nx/js:library'] as const;
const REACT_LIBRARY_GENERATORS = ['@nx/react:library'] as const;
const REACT_NATIVE_LIBRARY_GENERATORS = ['@nx/react-native:library'] as const;

/** The Tactical DDD React runtime bindings package. */
const TACTICAL_DDD_REACT = '@tactical-ddd/react';

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
  const installKernel = await sharedKernelGenerator(tree, {
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

  // Drop an architecture guide for AI agents at the workspace root so they place
  // files/entities by the same boundaries lint enforces. `KeepExisting` so a
  // re-run never clobbers a guide the user has customized.
  generateFiles(
    tree,
    resolve(__dirname, 'files'),
    '.',
    { prefix: options.prefix ?? '' },
    { overwriteStrategy: OverwriteStrategy.KeepExisting },
  );

  await formatFiles(tree);

  // Run both the plugin-dependency install and the shared kernel's own install
  // callbacks (the latter installs the packages backing the inferred ESLint/Jest
  // plugins the generated libraries registered).
  return runTasksInSerial(installDependencies, installKernel);
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
 * generator plugin (dev-time) plus the `@tactical-ddd/react` bindings as a
 * production dependency.
 *
 * The `react`/`react-dom` runtime is treated carefully: a React workspace
 * already ships its own React, and declaring our own range on top adds nothing
 * but forces the package manager to re-resolve — which can surface a latent
 * peer-dependency conflict already present in the workspace (e.g. an exactly
 * pinned `react` that a newer `react-dom` patch no longer satisfies) and abort
 * the install. So we only add `react` and `react-dom` when *neither* is already
 * present, and add them together at the same {@link REACT_VERSION} specifier —
 * never introducing a skew of our own.
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
    // Run-time: our React bindings always ship in the app.
    dependencies[TACTICAL_DDD_REACT] = tacticalDddReactVersion();

    // Only provide the React runtime when the workspace manages neither half of
    // it yet; if it already has `react` (or `react-dom`), defer to whatever
    // versions it pinned rather than re-resolving and risking a peer conflict.
    Object.assign(dependencies, reactRuntimeDependencies(tree));
  } else if (options.preset === 'react-native') {
    // Dev-time: powers the `@nx/react-native:library` defaults and generators.
    devDependencies['@nx/react-native'] = NX_VERSION;
    // Run-time: our React bindings always ship in the app.
    dependencies[TACTICAL_DDD_REACT] = tacticalDddReactVersion();

    // Run-time: `react` + `react-native` (no `react-dom` — native views, not
    // the DOM), added only when the workspace manages neither `react` nor
    // `react-native` yet, for the same skew/`ERESOLVE` reasons as above.
    Object.assign(dependencies, reactNativeRuntimeDependencies(tree));
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
 *     "@nx/react:library": { "bundler": "none", "linter": "eslint", "unitTestRunner": "jest" },
 *     // `@nx/react-native:library` is added only under the `react-native` preset
 *     // (no `bundler` — Metro is fixed; `unitTestRunner` is `jest` or `none`).
 *     "@nx/react-native:library": { "linter": "eslint", "unitTestRunner": "jest" }
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
  // test defaults, so a plain `nx g @nx/js:library` (or the framework library
  // generator) produces a library that already matches the Tactical DDD
  // conventions. The framework generator's defaults are written only under its
  // matching preset, so we don't advertise tooling a workspace never installed.
  const libraryDefaults: Record<string, unknown> = {
    bundler: options.bundler ?? 'none',
    linter: options.linter,
    unitTestRunner: options.unitTestRunner,
  };

  for (const generator of [
    ...BASE_LIBRARY_GENERATORS,
    ...(options.preset === 'react' ? REACT_LIBRARY_GENERATORS : []),
  ]) {
    generators[generator] = {
      ...generators[generator],
      ...libraryDefaults,
    };
  }

  // `@nx/react-native:library` has no `bundler` option (Metro is fixed) and
  // supports only `jest`/`none` for `unitTestRunner`, so it gets its own,
  // narrower defaults rather than the shared `libraryDefaults`.
  if (options.preset === 'react-native') {
    for (const generator of REACT_NATIVE_LIBRARY_GENERATORS) {
      generators[generator] = {
        ...generators[generator],
        linter: options.linter,
        unitTestRunner: options.unitTestRunner === 'jest' ? 'jest' : 'none',
      };
    }
  }

  updateNxJson(tree, nxJson);
}

export default initGenerator;
