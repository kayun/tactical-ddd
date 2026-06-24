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
import {
  addOverrideToLintConfig,
  isEslintConfigSupported,
  lintConfigHasOverride,
  updateOverrideInLintConfig,
} from '@nx/eslint/internal';

import type { Linter } from 'eslint';

import type { InitGeneratorSchema } from './schema';
import { DEP_CONSTRAINTS } from './module-boundaries';
import sharedKernelGenerator from '../shared-kernel/shared-kernel';

/** The module-boundaries rule whose `depConstraints` encode the dependency graph. */
const MODULE_BOUNDARIES_RULE = '@nx/enforce-module-boundaries';

/**
 * Root-level ESLint config filenames, grouped by format. `@nx/eslint`'s AST
 * utilities branch on `useFlatConfig()`, which — absent the
 * `ESLINT_USE_FLAT_CONFIG` env var and a flat config file — falls back to the
 * *installed* ESLint version (>= 9 ⇒ flat). We use these to detect the format
 * actually on disk; see `withAlignedEslintConfigDetection`.
 */
const FLAT_ESLINT_CONFIG_FILES = [
  'eslint.config.js',
  'eslint.config.cjs',
  'eslint.config.mjs',
  'eslint.config.ts',
  'eslint.config.cts',
  'eslint.config.mts',
];
const LEGACY_ESLINT_CONFIG_FILES = [
  '.eslintrc.json',
  '.eslintrc.js',
  '.eslintrc.cjs',
  '.eslintrc.yaml',
  '.eslintrc.yml',
  '.eslintrc',
];

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
 */
const LIBRARY_GENERATORS = ['@nx/js:library', '@nx/react:library'] as const;

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
  // establishes the config that `setModuleBoundaries` then tunes.
  await sharedKernelGenerator(tree, {
    directory: options.sharedDirectory,
    prefix: options.prefix,
    linter: options.linter,
    unitTestRunner: options.unitTestRunner,
    bundler: options.bundler,
  });

  setModuleBoundaries(tree);

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
 * `unitTestRunner`.
 */
function ensureGeneratorDependencies(
  tree: Tree,
  options: InitGeneratorSchema,
): GeneratorCallback {
  const devDependencies: Record<string, string> = {
    // Powers the shared-kernel generator (`@nx/js:library`) and the
    // `@nx/js:library` defaults written above.
    '@nx/js': NX_VERSION,
    // Powers the `@nx/react:library` defaults written above.
    '@nx/react': NX_VERSION,
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

  return addDependenciesToPackageJson(tree, {}, devDependencies);
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
    };
  }

  // 2. The built-in library generators get the same workspace-wide build/lint/
  // test defaults, so a plain `nx g @nx/js:library` (or `@nx/react:library`)
  // produces a library that already matches the Tactical DDD conventions.
  const libraryDefaults: Record<string, unknown> = {
    bundler: options.bundler ?? 'none',
    linter: options.linter,
    unitTestRunner: options.unitTestRunner,
  };

  for (const generator of LIBRARY_GENERATORS) {
    generators[generator] = {
      ...generators[generator],
      ...libraryDefaults,
    };
  }

  updateNxJson(tree, nxJson);
}

/**
 * Configures `@nx/enforce-module-boundaries` in the root ESLint flat config with
 * the Tactical DDD `depConstraints`, so the architecture's dependency graph (and
 * the absence of circular dependencies) is enforced at lint time.
 *
 * The existing rule block — created by Nx with an empty `depConstraints: []` —
 * is updated in place via AST manipulation. If no such block exists yet, a new
 * override carrying the full rule is appended.
 */
function setModuleBoundaries(tree: Tree) {
  if (!isEslintConfigSupported(tree)) {
    console.warn(
      'No supported ESLint flat config found at the workspace root — skipping module boundary rules.',
    );
    return;
  }

  // `@nx/eslint`'s flat-config AST utils mis-target a non-existent flat config
  // (reading `undefined`, which throws) when their detection disagrees with the
  // config on disk. This happens on a re-run: a workspace scaffolded against
  // ESLint 8 keeps a legacy `.eslintrc.*`, but our own plugin install bumps
  // ESLint to >= 9, flipping `useFlatConfig()` to flat. Pin the detection to the
  // format actually present for the duration of the AST work.
  withAlignedEslintConfigDetection(tree, () => updateModuleBoundaries(tree));
}

/**
 * Forces `@nx/eslint`'s `useFlatConfig()` to agree with the root config format
 * actually on disk while `run` executes, then restores the previous
 * `ESLINT_USE_FLAT_CONFIG` value. Only the unambiguous single-format cases are
 * pinned; a workspace with neither (or both) is left to Nx's own detection.
 */
function withAlignedEslintConfigDetection(tree: Tree, run: () => void) {
  const hasFlat = FLAT_ESLINT_CONFIG_FILES.some((file) => tree.exists(file));
  const hasLegacy = LEGACY_ESLINT_CONFIG_FILES.some((file) =>
    tree.exists(file),
  );

  let pinned: 'true' | 'false' | undefined;
  if (hasLegacy && !hasFlat) {
    pinned = 'false';
  } else if (hasFlat && !hasLegacy) {
    pinned = 'true';
  }

  const previous = process.env.ESLINT_USE_FLAT_CONFIG;
  if (pinned !== undefined) {
    process.env.ESLINT_USE_FLAT_CONFIG = pinned;
  }

  try {
    run();
  } finally {
    if (previous === undefined) {
      delete process.env.ESLINT_USE_FLAT_CONFIG;
    } else {
      process.env.ESLINT_USE_FLAT_CONFIG = previous;
    }
  }
}

function updateModuleBoundaries(tree: Tree) {
  const hasRule = lintConfigHasOverride(tree, '', (override) =>
    Boolean(override.rules?.[MODULE_BOUNDARIES_RULE]),
  );

  if (hasRule) {
    updateOverrideInLintConfig(
      tree,
      '',
      (override) => Boolean(override.rules?.[MODULE_BOUNDARIES_RULE]),
      (override) => {
        const rules = override.rules ?? {};
        const rule = rules[MODULE_BOUNDARIES_RULE];
        const [severity = 'error', ruleOptions = {}] = Array.isArray(rule)
          ? rule
          : [];

        const updatedRule: Linter.RuleEntry = [
          severity as Linter.RuleSeverity,
          {
            ...(ruleOptions as Record<string, unknown>),
            depConstraints: DEP_CONSTRAINTS,
          },
        ];

        return {
          ...override,
          rules: { ...rules, [MODULE_BOUNDARIES_RULE]: updatedRule },
        };
      },
    );
    return;
  }

  addOverrideToLintConfig(tree, '', {
    files: ['**/*.ts', '**/*.js'],
    rules: {
      [MODULE_BOUNDARIES_RULE]: [
        'error',
        {
          enforceBuildableLibDependency: true,
          allow: ['^.*/eslint(\\.base)?\\.config\\.[cm]?[jt]s$'],
          depConstraints: DEP_CONSTRAINTS,
        },
      ],
    },
  });
}

export default initGenerator;
