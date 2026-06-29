import { Tree } from '@nx/devkit';

/**
 * Whether a kernel library has actually been generated at `root`.
 *


 * We key off the library's project manifest rather than the directory:
 * `tree.exists(root)` is `true` for *any* existing directory — including an
 * empty leftover from an aborted run — which would make the generator wrongly
 * skip a layer that has no files in it.
 *
 * `@nx/js:library` writes its configuration to whichever manifest suits the
 * workspace: `project.json` in an integrated (tsconfig-paths) workspace, or the
 * `package.json` `nx` block in a package-manager-workspaces (TS solution) one —
 * and in the latter the bundler-less case may leave only `project.json`. Either
 * manifest existing is a reliable marker that the library was scaffolded.
 */
export function libraryExists(tree: Tree, root: string): boolean {
  return (
    tree.exists(`${root}/package.json`) || tree.exists(`${root}/project.json`)
  );
}
