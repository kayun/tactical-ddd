import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';
import { Tree, readNxJson, updateNxJson } from '@nx/devkit';

import { initGenerator } from './init';
import { InitGeneratorSchema } from './schema';
import { DEP_CONSTRAINTS } from './module-boundaries';
import { LibraryScope } from '../../types';

const ESLINT_CONFIG = 'eslint.config.mjs';

const ROOT_ESLINT_WITH_RULE = `import nx from '@nx/eslint-plugin';

export default [
  {
    files: ['**/*.ts', '**/*.js'],
    rules: {
      '@nx/enforce-module-boundaries': [
        'error',
        {
          enforceBuildableLibDependency: true,
          allow: ['^.*/eslint(\\\\.base)?\\\\.config\\\\.[cm]?[jt]s$'],
          depConstraints: [],
        },
      ],
    },
  },
];
`;

describe('init generator', () => {
  let tree: Tree;
  const options: InitGeneratorSchema = { prefix: '@my-org' };

  beforeEach(() => {
    tree = createTreeWithEmptyWorkspace();
    tree.write(ESLINT_CONFIG, ROOT_ESLINT_WITH_RULE);
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

  describe('module boundaries', () => {
    it('populates depConstraints in the existing enforce-module-boundaries rule', async () => {
      await initGenerator(tree, options);

      const config = tree.read(ESLINT_CONFIG, 'utf-8') ?? '';

      // Every source tag from the constraint set is now wired into the config.
      for (const { sourceTag } of DEP_CONSTRAINTS) {
        expect(config).toContain(sourceTag);
      }
      expect(config).toContain('onlyDependOnLibsWithTags');
      // The empty default is gone — depConstraints is now populated.
      expect(config).not.toMatch(/depConstraints:\s*\[\s*\]/);
    });

    it('protects against cross-domain imports via the dynamic domain:* tag', async () => {
      await initGenerator(tree, options);

      const config = tree.read(ESLINT_CONFIG, 'utf-8') ?? '';

      expect(config).toContain(LibraryScope.CrossDomain);
    });

    it('adds an enforce-module-boundaries override when none exists yet', async () => {
      tree.write(ESLINT_CONFIG, `export default [];\n`);

      await initGenerator(tree, options);

      const config = tree.read(ESLINT_CONFIG, 'utf-8') ?? '';

      expect(config).toContain('@nx/enforce-module-boundaries');
      expect(config).toContain('onlyDependOnLibsWithTags');
      expect(config).toContain(LibraryScope.Shared);
    });

    it('does not throw when no ESLint config is present', async () => {
      tree.delete(ESLINT_CONFIG);
      expect(tree.exists(ESLINT_CONFIG)).toBe(false);

      await expect(initGenerator(tree, options)).resolves.not.toThrow();
    });
  });
});
