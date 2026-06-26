import { Tree } from '@nx/devkit';

/**
 * Whether a kernel library has actually been generated at `root`.
 *
 * We key off the library manifest (`package.json`) rather than the directory:
 * `tree.exists(root)` is `true` for *any* existing directory — including an
 * empty leftover from an aborted run — which would make the generator wrongly
 * skip a layer that has no files in it. A `package.json` only exists once
 * `@nx/js:library` has scaffolded the library, so it is the reliable marker.
 */
export function libraryExists(tree: Tree, root: string): boolean {
  return tree.exists(`${root}/package.json`);
}
