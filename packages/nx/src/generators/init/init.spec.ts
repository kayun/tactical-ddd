import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';
import { Tree, readNxJson, updateNxJson } from '@nx/devkit';

import { initGenerator } from './init';
import { InitGeneratorSchema } from './schema';

describe('init generator', () => {
  let tree: Tree;
  const options: InitGeneratorSchema = { prefix: '@my-org' };

  beforeEach(() => {
    tree = createTreeWithEmptyWorkspace();
  });

  it('should run successfully', async () => {
    await expect(initGenerator(tree, options)).resolves.not.toThrow();
  });

  it('registers the prefix as a default for the shared-kernel generator', async () => {
    await initGenerator(tree, options);

    const nxJson = readNxJson(tree);

    expect(nxJson?.generators).toMatchObject({
      '@tactical-ddd/nx': {
        'shared-kernel': { prefix: '@my-org' },
      },
    });
  });

  it('preserves unrelated existing generator defaults', async () => {
    const nxJson = readNxJson(tree) ?? {};
    nxJson.generators = {
      '@nx/react': { library: { unitTestRunner: 'jest' } },
    };
    updateNxJson(tree, nxJson);

    await initGenerator(tree, options);

    expect(readNxJson(tree)?.generators).toMatchObject({
      '@nx/react': { library: { unitTestRunner: 'jest' } },
      '@tactical-ddd/nx': { 'shared-kernel': { prefix: '@my-org' } },
    });
  });

  it('updates the prefix when init runs again with a new value', async () => {
    await initGenerator(tree, { prefix: '@old-org' });
    await initGenerator(tree, { prefix: '@new-org' });

    const collection = readNxJson(tree)?.generators?.[
      '@tactical-ddd/nx'
    ] as Record<string, { prefix: string }>;

    expect(collection['shared-kernel'].prefix).toBe('@new-org');
  });
});
