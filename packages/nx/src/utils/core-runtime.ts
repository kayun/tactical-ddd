import { type Tree } from '@nx/devkit';
import { createRequire } from 'node:module';

import { declaredPackages } from './declared-packages';

/** The runtime kernel the generated facade templates are written against. */
export const CORE_PACKAGE = '@tactical-ddd/core';

/**
 * Range used when the workspace does not manage the kernel yet: a caret over
 * *this plugin's own* version.
 *
 * The two packages are released together (`nx.json` → `release.projects`
 * covers `packages/*` under one version), so the plugin's version is by
 * definition the kernel version whose primitives its templates use — reading it
 * here means there is no constant to keep in step by hand. On a `0.x` version a
 * caret stops at the next minor, which is exactly the release that may change
 * those primitives.
 */
function pluginVersionRange(): string {
  try {
    const { version } = createRequire(__filename)(
      '@tactical-ddd/nx/package.json',
    ) as { version?: string };

    if (version) {
      return `^${version}`;
    }
  } catch {
    // Falls through to the wildcard below.
  }

  // `*` rather than a throw: an unresolvable manifest (a plugin loaded from a
  // path, a stripped install) must not fail domain generation over a range the
  // package manager can still satisfy.
  return '*';
}

/**
 * The range to declare for {@link CORE_PACKAGE} inside a generated library.
 *
 * Prefers whatever the workspace already declares, so a library's dependency
 * never disagrees with the version actually installed.
 */
export function coreVersion(tree: Tree): string {
  return declaredPackages(tree)[CORE_PACKAGE] ?? pluginVersionRange();
}

/**
 * The kernel dependency a generator should add to the *workspace*: absent when
 * it is already declared, so a pinned version is never bumped — the same
 * presence check the framework runtimes use.
 */
export function coreRuntimeDependencies(tree: Tree): Record<string, string> {
  if (CORE_PACKAGE in declaredPackages(tree)) {
    return {};
  }

  return { [CORE_PACKAGE]: pluginVersionRange() };
}
