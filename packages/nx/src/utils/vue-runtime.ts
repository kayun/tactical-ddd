import { type Tree } from '@nx/devkit';

import { declaredPackages } from './declared-packages';

/**
 * Vue runtime version added to the *user's* workspace under the `vue` preset.
 * Kept in step with the version `@nx/vue`'s own generators install so the two
 * never disagree — the `domain` generator delegates to `@nx/vue:library`, which
 * declares `vue` itself, and a different range here would mean the workspace's
 * `vue` depends on which generator ran first.
 */
export const VUE_VERSION = '^3.5.13';

/**
 * Whether the workspace `package.json` already declares `vue` (in either
 * `dependencies` or `devDependencies`). When it does, the generators leave the
 * Vue runtime untouched: re-declaring our own range over a pinned one only
 * forces the package manager to re-resolve, which can surface a latent peer
 * conflict already present in the workspace and abort the install.
 */
export function workspaceHasVueRuntime(tree: Tree): boolean {
  return 'vue' in declaredPackages(tree);
}

/**
 * The Vue runtime dependencies a generator should add: `vue` at
 * {@link VUE_VERSION}, but only when the workspace does not manage it yet.
 * Returns `{}` otherwise, so an existing pin is never bumped.
 *
 * Unlike React there is no second half to keep in step — Vue ships its compiler
 * and runtime in the one package — so this is a presence check rather than the
 * skew guard `reactRuntimeDependencies` also has to be.
 */
export function vueRuntimeDependencies(tree: Tree): Record<string, string> {
  if (workspaceHasVueRuntime(tree)) {
    return {};
  }

  return { vue: VUE_VERSION };
}
