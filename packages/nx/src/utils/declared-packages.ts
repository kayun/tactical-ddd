import { readJson, type Tree } from '@nx/devkit';

/**
 * Merged view of a workspace's declared deps + devDeps.
 *
 * Both halves are read because a runtime the workspace manages counts as present
 * wherever it was declared: a monorepo that keeps `react` (or `vue`) in
 * `devDependencies` still manages its own version, and adding ours on top would
 * force a re-resolve.
 */
export function declaredPackages(tree: Tree): Record<string, string> {
  const packageJson = readJson<{
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  }>(tree, 'package.json');

  return {
    ...packageJson.devDependencies,
    ...packageJson.dependencies,
  };
}
