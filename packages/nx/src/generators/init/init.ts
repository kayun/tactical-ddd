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
const PREFIXED_GENERATORS = ['shared-kernel'] as const;

export async function initGenerator(tree: Tree, options: InitGeneratorSchema) {
  setGeneratorDefaults(tree, options);
  setModuleBoundaries(tree);

  await sharedKernelGenerator(tree, {
    directory: options.sharedDirectory,
    prefix: options.prefix,
    linter: options.linter,
    unitTestRunner: options.unitTestRunner,
    bundler: options.bundler,
  });

  await formatFiles(tree);
}

/**
 * Persists workspace-wide generator defaults into `nx.json` so a value like the
 * organization `prefix` is configured once during `init` and then transparently
 * injected by Nx into every subsequent generator invocation (e.g.
 * `nx g @tactical-ddd/nx:shared-kernel`) without the user re-typing it.
 *
 * Defaults are written under the collection key using Nx's nested shape:
 *
 *   "generators": {
 *     "@tactical-ddd/nx": {
 *       "shared-kernel": { "prefix": "@my-org" }
 *     }
 *   }
 */
function setGeneratorDefaults(tree: Tree, options: InitGeneratorSchema) {
  const nxJson = readNxJson(tree) ?? ({} as NxJsonConfiguration);

  nxJson.generators ??= {};

  const collectionDefaults = ((nxJson.generators as Record<string, unknown>)[
    COLLECTION
  ] ??= {}) as Record<string, Record<string, unknown>>;

  for (const generator of PREFIXED_GENERATORS) {
    collectionDefaults[generator] = {
      ...collectionDefaults[generator],
      prefix: options.prefix,
      linter: options.linter,
      unitTestRunner: options.unitTestRunner,
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
