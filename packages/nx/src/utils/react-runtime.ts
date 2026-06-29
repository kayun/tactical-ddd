import { readJson, type Tree } from '@nx/devkit';

/**
 * React runtime version added to the *user's* workspace under the `react`
 * preset. `react` and `react-dom` are pinned to the *same* specifier and only
 * ever added together (see {@link reactRuntimeDependencies}) so we never
 * introduce a `react` vs `react-dom` version skew of our own. Kept in step with
 * the React version `@nx/react`'s own generators install so the two never
 * disagree.
 */
export const REACT_VERSION = '^19.0.0';

/**
 * Whether the workspace `package.json` already declares `react` or `react-dom`
 * (in either `dependencies` or `devDependencies`). When it does, the generators
 * leave the React runtime untouched so they can't introduce a version skew or
 * trigger a conflicting re-resolve.
 */
export function workspaceHasReactRuntime(tree: Tree): boolean {
  const packageJson = readJson<{
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  }>(tree, 'package.json');

  const declared = {
    ...packageJson.devDependencies,
    ...packageJson.dependencies,
  };

  return 'react' in declared || 'react-dom' in declared;
}

/**
 * The React runtime dependencies a generator should add: both halves at the
 * same {@link REACT_VERSION} specifier, but only when the workspace manages
 * neither yet. Returns `{}` when `react`/`react-dom` is already present, so we
 * never bump a pinned version or add a second half whose floating range
 * resolves to a patch the existing one no longer satisfies (an `ERESOLVE`).
 */
export function reactRuntimeDependencies(tree: Tree): Record<string, string> {
  if (workspaceHasReactRuntime(tree)) {
    return {};
  }

  return {
    react: REACT_VERSION,
    'react-dom': REACT_VERSION,
  };
}
