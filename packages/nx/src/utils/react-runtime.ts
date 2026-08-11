import { type Tree } from '@nx/devkit';

import { declaredPackages } from './declared-packages';

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
 * React Native runtime version added to the *user's* workspace under the
 * `react-native` preset, alongside `react` at {@link REACT_VERSION}. Kept in
 * step with the version `@nx/react-native`'s own generators install so the two
 * never disagree.
 */
export const REACT_NATIVE_VERSION = '~0.84.1';

/**
 * Whether the workspace `package.json` already declares `react` or `react-dom`
 * (in either `dependencies` or `devDependencies`). When it does, the generators
 * leave the React runtime untouched so they can't introduce a version skew or
 * trigger a conflicting re-resolve.
 */
export function workspaceHasReactRuntime(tree: Tree): boolean {
  const declared = declaredPackages(tree);
  return 'react' in declared || 'react-dom' in declared;
}

/**
 * Whether the workspace `package.json` already declares `react` or
 * `react-native`. Same rationale as {@link workspaceHasReactRuntime}: when
 * either half is present we defer to the workspace's own pins rather than
 * re-resolving and risking a peer conflict.
 */
export function workspaceHasReactNativeRuntime(tree: Tree): boolean {
  const declared = declaredPackages(tree);
  return 'react' in declared || 'react-native' in declared;
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

/**
 * The React Native runtime dependencies a generator should add: `react` (at the
 * same {@link REACT_VERSION} React web uses) and `react-native` at
 * {@link REACT_NATIVE_VERSION} — but only when the workspace manages neither
 * `react` nor `react-native` yet, so we never bump a pinned version or provoke
 * an `ERESOLVE`. Returns `{}` otherwise. Note: no `react-dom` — React Native
 * renders to native views, not the DOM.
 */
export function reactNativeRuntimeDependencies(
  tree: Tree,
): Record<string, string> {
  if (workspaceHasReactNativeRuntime(tree)) {
    return {};
  }

  return {
    react: REACT_VERSION,
    'react-native': REACT_NATIVE_VERSION,
  };
}
