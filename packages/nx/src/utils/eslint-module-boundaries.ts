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
 * Root-level ESLint config filenames, grouped by format. `@nx/eslint`'s AST
 * utilities branch on `useFlatConfig()`, which — absent the
 * `ESLINT_USE_FLAT_CONFIG` env var and a flat config file — falls back to the
 * *installed* ESLint version (>= 9 ⇒ flat). We use these to detect the format
 * actually on disk; see {@link withAlignedEslintConfigDetection}.
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
 * Pins `@nx/eslint`'s `useFlatConfig()` to the root config format actually on
 * disk and returns a disposer that restores the previous `ESLINT_USE_FLAT_CONFIG`
 * value. Only the unambiguous single-format cases are pinned; a workspace with
 * neither (or both) is left to Nx's own detection.
 *
 * Two things go wrong without this, both rooted in the same desync — a
 * workspace scaffolded against ESLint 8 keeps a legacy `.eslintrc.*`, but our
 * own plugin install bumps ESLint to >= 9, flipping `useFlatConfig()` to flat:
 *   1. The flat-config AST utils mis-target a non-existent flat config (reading
 *      `undefined`, which throws) when updating module boundaries.
 *   2. Library generators emit *flat* per-project configs that try to extend a
 *      legacy root config, so `nx lint` later fails with "baseConfig is not
 *      iterable". Pinning keeps generated lib configs in the root's format.
 */
export function pinEslintConfigDetection(tree: Tree): () => void {
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

  return () => {
    if (previous === undefined) {
      delete process.env.ESLINT_USE_FLAT_CONFIG;
    } else {
      process.env.ESLINT_USE_FLAT_CONFIG = previous;
    }
  };
}

/** Synchronous {@link pinEslintConfigDetection} wrapper around `run`. */
export function withAlignedEslintConfigDetection(tree: Tree, run: () => void) {
  const restore = pinEslintConfigDetection(tree);
  try {
    run();
  } finally {
    restore();
  }
}

/**
 * Async {@link pinEslintConfigDetection} wrapper: keeps the detection pinned for
 * the whole of an awaited `run` (e.g. library generation), then restores it.
 */
export async function withAlignedEslintConfigDetectionAsync<T>(
  tree: Tree,
  run: () => Promise<T>,
): Promise<T> {
  const restore = pinEslintConfigDetection(tree);
  try {
    return await run();
  } finally {
    restore();
  }
}

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
 * filled in for any that are missing. Both flat config (`eslint.config.*`) and
 * legacy `.eslintrc.*` are detected and updated via AST manipulation.
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

  withAlignedEslintConfigDetection(tree, () =>
    upsertModuleBoundaries(tree, constraints),
  );
  return true;
}

function upsertModuleBoundaries(tree: Tree, constraints: DepConstraint[]) {
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
    return;
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
}
