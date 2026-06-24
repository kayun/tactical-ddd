import {
  formatFiles,
  readNxJson,
  updateNxJson,
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

export async function initGenerator(tree: Tree, options: InitGeneratorSchema) {
  setGeneratorDefaults(tree, options);

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
