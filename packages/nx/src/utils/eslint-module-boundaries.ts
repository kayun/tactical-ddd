import { type Tree } from '@nx/devkit';
import {
  addOverrideToLintConfig,
  isEslintConfigSupported,
  lintConfigHasOverride,
  updateOverrideInLintConfig,
} from '@nx/eslint/internal';

import type { Linter } from 'eslint';

/** The module-boundaries rule whose `depConstraints` encode the dependency graph. */
export const MODULE_BOUNDARIES_RULE = '@nx/enforce-module-boundaries';

/** A single `@nx/enforce-module-boundaries` dependency constraint. */
export interface DepConstraint {
  sourceTag: string;
  onlyDependOnLibsWithTags: string[];
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
    console.warn(
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
