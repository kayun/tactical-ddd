import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';
import { Tree } from '@nx/devkit';

import { libraryExists } from './library-exist';

describe('libraryExists', () => {
  let tree: Tree;

  beforeEach(() => {
    tree = createTreeWithEmptyWorkspace();
  });

  it('returns true when a library manifest exists at the root', () => {
    tree.write('libs/foo/package.json', JSON.stringify({ name: 'foo' }));

    expect(libraryExists(tree, 'libs/foo')).toBe(true);
  });

  it('returns false for an empty leftover directory with no manifest', () => {
    // A directory left behind by an aborted run exists but holds no library —
    // keying off `tree.exists(root)` would wrongly report it as generated.
    tree.write('libs/foo/src/.gitkeep', '');

    expect(libraryExists(tree, 'libs/foo')).toBe(false);
  });

  it('returns false when the root does not exist at all', () => {
    expect(libraryExists(tree, 'libs/missing')).toBe(false);
  });
});
