import { type Tree } from '@nx/devkit';

import type { Linter } from 'eslint';

import { warning } from './logger';

/**
 * The slice of `@nx/eslint`'s flat-config AST utilities this module relies on.
 */
type EslintConfigUtils = Pick<
  typeof import('@nx/eslint/internal'),
  | 'addOverrideToLintConfig'
  | 'isEslintConfigSupported'
  | 'lintConfigHasOverride'
  | 'updateOverrideInLintConfig'
>;

/**
 * Loads `@nx/eslint`'s ESLint-config AST utilities across Nx major versions.
 *
 * Nx >= 23 exposes them through the curated `@nx/eslint/internal` subpath. Nx 22
 * has no such subpath (requiring it throws "Cannot find module
 * '@nx/eslint/internal'"), but ships no `package.json` `exports` map either, so
 * the utilities can be required directly from their module path instead.
 */
function loadEslintConfigUtils(): EslintConfigUtils {
  try {
    return require('@nx/eslint/internal');
  } catch {
    return require('@nx/eslint/src/generators/utils/eslint-file');
  }
}

const {
  addOverrideToLintConfig,
  isEslintConfigSupported,
  lintConfigHasOverride,
  updateOverrideInLintConfig,
} = loadEslintConfigUtils();

/** The module-boundaries rule whose `depConstraints` encode the dependency graph. */
export const MODULE_BOUNDARIES_RULE = '@nx/enforce-module-boundaries';

/** A single `@nx/enforce-module-boundaries` dependency constraint. */
export interface DepConstraint {
  sourceTag: string;
  onlyDependOnLibsWithTags: string[];
}

/** A single `no-restricted-imports` pattern group with its violation message. */
interface RestrictedImportPattern {
  group: string[];
  message: string;
}

/**
 * Baseline options every `@nx/enforce-module-boundaries` rule we write carries.
 * The `allow` glob keeps libraries free to import the workspace's flat ESLint
 * config files (which live outside any project's source) without tripping the
 * boundary check.
 */
const DEFAULT_RULE_OPTIONS = {
  enforceBuildableLibDependency: true,
  allow: ['^.*/eslint(\\.base)?\\.config\\.[cm]?[jt]s$'],
};

/**
 * Merges `incoming` constraints into `existing`, keyed by `sourceTag`: an
 * incoming constraint replaces any existing one with the same `sourceTag`,
 * otherwise it is appended. Order of first appearance is preserved so the
 * config stays stable across re-runs (idempotent).
 */
function mergeConstraints(
  existing: DepConstraint[],
  incoming: DepConstraint[],
): DepConstraint[] {
  const bySource = new Map<string, DepConstraint>();
  for (const constraint of [...existing, ...incoming]) {
    bySource.set(constraint.sourceTag, constraint);
  }
  return [...bySource.values()];
}

/**
 * Ensures the root `@nx/enforce-module-boundaries` rule exists and that every
 * constraint in `constraints` is present in its `depConstraints` (merged by
 * `sourceTag`). Existing rule options are preserved; the baseline options are
 * filled in for any that are missing.
 *
 * Returns `false` (and warns) when there is no ESLint config to update — e.g.
 * the workspace was set up with `linter: none`.
 */
export function applyDepConstraints(
  tree: Tree,
  constraints: DepConstraint[],
): boolean {
  if (!isEslintConfigSupported(tree)) {
    warning(
      'No supported ESLint config found at the workspace root — skipping module boundary rules.',
    );
    return false;
  }

  const hasRule = lintConfigHasOverride(tree, '', (override) =>
    Boolean(override.rules?.[MODULE_BOUNDARIES_RULE]),
  );

  if (!hasRule) {
    addOverrideToLintConfig(tree, '', {
      files: ['**/*.ts', '**/*.js'],
      rules: {
        [MODULE_BOUNDARIES_RULE]: [
          'error',
          { ...DEFAULT_RULE_OPTIONS, depConstraints: constraints },
        ],
      },
    });
    return true;
  }

  updateOverrideInLintConfig(
    tree,
    '',
    (override) => Boolean(override.rules?.[MODULE_BOUNDARIES_RULE]),
    (override) => {
      const rules = override.rules ?? {};
      const rule = rules[MODULE_BOUNDARIES_RULE];

      // The rule may be a bare severity string (`'error'`) or the usual
      // `[severity, options]` tuple. Falling back to `{}` for the non-tuple
      // form would silently drop `enforceBuildableLibDependency`/`allow`, so we
      // start from the baseline options and layer any existing ones on top.
      const severity: Linter.RuleSeverity = Array.isArray(rule)
        ? (rule[0] as Linter.RuleSeverity)
        : ((rule as Linter.RuleSeverity) ?? 'error');
      const existingOptions = (
        Array.isArray(rule) ? (rule[1] ?? {}) : {}
      ) as Record<string, unknown>;
      const existingConstraints = Array.isArray(existingOptions.depConstraints)
        ? (existingOptions.depConstraints as DepConstraint[])
        : [];

      const updatedRule: Linter.RuleEntry = [
        severity,
        {
          ...DEFAULT_RULE_OPTIONS,
          ...existingOptions,
          depConstraints: mergeConstraints(existingConstraints, constraints),
        },
      ];

      return {
        ...override,
        rules: { ...rules, [MODULE_BOUNDARIES_RULE]: updatedRule },
      };
    },
  );
  return true;
}

/**
 * The `no-restricted-imports` patterns enforcing Clean Architecture layering
 * *inside* a domain's `core` library: `domain` may not reach into `application`
 * or `infrastructure`, and `application` may not reach into `infrastructure`.
 *
 * Each layer gets a relative-path rule (sibling folders under `src/lib`) and,
 * when an organization `prefix` is known, an absolute-path rule that closes the
 * loophole of bypassing the relative rule through a workspace alias.
 */
function domainLayerPatterns(prefix?: string): RestrictedImportPattern[] {
  const patterns: RestrictedImportPattern[] = [
    {
      group: [
        '../application/*',
        '../application',
        '../infrastructure/*',
        '../infrastructure',
      ],
      message:
        'Clean Architecture violation: Domain layer must be independent and cannot import from Application or Infrastructure layers.',
    },
  ];

  if (prefix) {
    patterns.push({
      group: [
        `${prefix}/*/core/infrastructure/*`,
        `${prefix}/*/core/application/*`,
      ],
      message:
        'Clean Architecture violation: Domain layer cannot import upper layers via absolute paths.',
    });
  }

  return patterns;
}

function applicationLayerPatterns(prefix?: string): RestrictedImportPattern[] {
  const patterns: RestrictedImportPattern[] = [
    {
      group: ['../infrastructure/*', '../infrastructure'],
      message:
        'Clean Architecture violation: Application layer cannot import from Infrastructure layer.',
    },
  ];

  if (prefix) {
    patterns.push({
      group: [`${prefix}/*/core/infrastructure/*`],
      message:
        'Clean Architecture violation: Application layer cannot import Infrastructure via absolute paths.',
    });
  }

  return patterns;
}

/**
 * Adds Clean Architecture import boundaries to a `core` library's own ESLint
 * config (`<libraryRoot>/eslint.config.*`) via `no-restricted-imports` overrides
 * scoped to the `domain` and `application` layer folders. `@nx/enforce-module-
 * boundaries` guards dependencies *between* projects; these rules guard the
 * layering *within* the core library.
 *
 * No-op (returning `false`) when the library has no ESLint config — e.g. it was
 * generated with `linter: none`.
 */
export function applyCleanArchitectureBoundaries(
  tree: Tree,
  libraryRoot: string,
  prefix?: string,
): boolean {
  if (!isEslintConfigSupported(tree, libraryRoot)) {
    return false;
  }

  addOverrideToLintConfig(tree, libraryRoot, {
    files: ['src/lib/domain/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: domainLayerPatterns(prefix) },
      ],
    },
  });

  addOverrideToLintConfig(tree, libraryRoot, {
    files: ['src/lib/application/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: applicationLayerPatterns(prefix) },
      ],
    },
  });

  return true;
}
