import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';
import {
  Tree,
  getProjects,
  readNxJson,
  readProjectConfiguration,
  updateNxJson,
} from '@nx/devkit';

import { initGenerator } from './init';
import { InitGeneratorSchema } from './schema';
import { DEP_CONSTRAINTS } from './module-boundaries';
import { LibraryScope } from '../../types';

// Prettier v3 ships as ESM behind a CJS shim whose top-level `import()` throws
// under jest's VM ("dynamic import callback was invoked without
// --experimental-vm-modules"). The delegated shared-kernel generator loads it
// eagerly via `@nx/js`'s `ensurePackage('prettier')`. Stub it so neither
// `require` nor `import` evaluates the real shim; the no-op formatter is
// irrelevant to what these tests assert.
jest.mock('prettier', () => ({
  __esModule: true,
  resolveConfig: async () => ({}),
  getFileInfo: async () => ({ ignored: false, inferredParser: 'typescript' }),
  format: async (content: string) => content,
}));

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

  const baseOptions: InitGeneratorSchema = {
    sharedDirectory: 'libs/shared',
    prefix: '@my-org',
    linter: 'eslint',
    unitTestRunner: 'jest',
    bundler: 'none',
  };

  beforeEach(() => {
    tree = createTreeWithEmptyWorkspace();
    tree.write(ESLINT_CONFIG, ROOT_ESLINT_WITH_RULE);
  });

  it('should run successfully', async () => {
    await expect(initGenerator(tree, baseOptions)).resolves.not.toThrow();
  });

  describe('generator defaults', () => {
    it('registers the prefix as a default for the shared-kernel generator', async () => {
      await initGenerator(tree, baseOptions);

      expect(readNxJson(tree)?.generators).toMatchObject({
        '@tactical-ddd/nx': {
          'shared-kernel': { prefix: '@my-org' },
        },
      });
    });

    it('registers the linter and unitTestRunner defaults for the shared-kernel generator', async () => {
      await initGenerator(tree, {
        ...baseOptions,
        linter: 'eslint',
        unitTestRunner: 'vitest',
      });

      expect(readNxJson(tree)?.generators).toMatchObject({
        '@tactical-ddd/nx': {
          'shared-kernel': {
            prefix: '@my-org',
            linter: 'eslint',
            unitTestRunner: 'vitest',
          },
        },
      });
    });

    it('preserves unrelated existing generator defaults', async () => {
      const nxJson = readNxJson(tree) ?? {};
      nxJson.generators = {
        '@nx/react': { library: { unitTestRunner: 'jest' } },
      };
      updateNxJson(tree, nxJson);

      await initGenerator(tree, baseOptions);

      expect(readNxJson(tree)?.generators).toMatchObject({
        '@nx/react': { library: { unitTestRunner: 'jest' } },
        '@tactical-ddd/nx': { 'shared-kernel': { prefix: '@my-org' } },
      });
    });

    it('updates the prefix when init runs again with a new value', async () => {
      await initGenerator(tree, { ...baseOptions, prefix: '@old-org' });
      await initGenerator(tree, { ...baseOptions, prefix: '@new-org' });

      const collection = readNxJson(tree)?.generators?.[
        '@tactical-ddd/nx'
      ] as Record<string, { prefix: string }>;

      expect(collection['shared-kernel'].prefix).toBe('@new-org');
    });
  });

  describe('module boundaries', () => {
    it('populates depConstraints in the existing enforce-module-boundaries rule', async () => {
      await initGenerator(tree, baseOptions);

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
      await initGenerator(tree, baseOptions);

      const config = tree.read(ESLINT_CONFIG, 'utf-8') ?? '';

      expect(config).toContain(LibraryScope.CrossDomain);
    });

    it('adds an enforce-module-boundaries override when none exists yet', async () => {
      tree.write(ESLINT_CONFIG, `export default [];\n`);

      await initGenerator(tree, baseOptions);

      const config = tree.read(ESLINT_CONFIG, 'utf-8') ?? '';

      expect(config).toContain('@nx/enforce-module-boundaries');
      expect(config).toContain('onlyDependOnLibsWithTags');
      expect(config).toContain(LibraryScope.Shared);
    });

    it('does not throw when no ESLint config is present', async () => {
      tree.delete(ESLINT_CONFIG);
      expect(tree.exists(ESLINT_CONFIG)).toBe(false);

      await expect(initGenerator(tree, baseOptions)).resolves.not.toThrow();
    });
  });

  describe('shared kernel scaffolding', () => {
    it('generates the three shared kernel libraries via the shared-kernel generator', async () => {
      await initGenerator(tree, baseOptions);

      const names = [...getProjects(tree).keys()].sort();

      expect(names).toEqual(
        [
          '@my-org/shared-contracts',
          '@my-org/shared-infrastructure',
          '@my-org/shared-utils',
        ].sort(),
      );
    });

    it('forwards the sharedDirectory option to the kernel libraries', async () => {
      await initGenerator(tree, {
        ...baseOptions,
        sharedDirectory: 'libs/platform',
      });

      expect(
        readProjectConfiguration(tree, '@my-org/shared-contracts').root,
      ).toBe('libs/platform/contracts');
      expect(readProjectConfiguration(tree, '@my-org/shared-utils').root).toBe(
        'libs/platform/utils',
      );
      expect(
        readProjectConfiguration(tree, '@my-org/shared-infrastructure').root,
      ).toBe('libs/platform/infrastructure');
    });

    it('tags the generated libraries as scope:shared', async () => {
      await initGenerator(tree, baseOptions);

      for (const project of [
        '@my-org/shared-contracts',
        '@my-org/shared-utils',
        '@my-org/shared-infrastructure',
      ]) {
        expect(readProjectConfiguration(tree, project).tags).toContain(
          LibraryScope.Shared,
        );
      }
    });

    it('forwards the bundler option so buildable layers get a build target', async () => {
      await initGenerator(tree, { ...baseOptions, bundler: 'tsc' });

      expect(
        readProjectConfiguration(tree, '@my-org/shared-utils').targets?.[
          'build'
        ],
      ).toBeDefined();
    });

    it('forwards the unitTestRunner option so testable layers get a test target', async () => {
      await initGenerator(tree, { ...baseOptions, unitTestRunner: 'jest' });

      expect(
        readProjectConfiguration(tree, '@my-org/shared-utils').targets?.[
          'test'
        ],
      ).toBeDefined();
    });
  });
});
