import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';
import { Tree, readProjectConfiguration, getProjects } from '@nx/devkit';

import { sharedKernelGenerator } from './shared-kernel';
import { SharedKernelGeneratorSchema } from './schema';
import { LibraryScope, LibraryType } from '../../types';

// Prettier v3 ships as ESM behind a CJS shim whose top-level `import()` throws
// under jest's VM ("dynamic import callback was invoked without
// --experimental-vm-modules"). `@nx/js`'s init generator loads it eagerly via
// `ensurePackage('prettier')`. Stub it so neither `require` nor `import` evaluates
// the real shim; the no-op formatter is irrelevant to what these tests assert.
jest.mock('prettier', () => ({
  __esModule: true,
  resolveConfig: async () => ({}),
  getFileInfo: async () => ({ ignored: false, inferredParser: 'typescript' }),
  format: async (content: string) => content,
}));

describe('shared-kernel generator', () => {
  let tree: Tree;

  const baseOptions: SharedKernelGeneratorSchema = {
    directory: 'libs/shared',
    linter: 'eslint',
    unitTestRunner: 'jest',
    bundler: 'none',
  };

  // The three kernel layers: generated project name, library root and type tag.
  const LAYERS = [
    {
      project: 'shared-contracts',
      root: 'libs/shared/contracts',
      type: LibraryType.Contracts,
    },
    {
      project: 'shared-utils',
      root: 'libs/shared/utils',
      type: LibraryType.Utils,
    },
    {
      project: 'shared-infrastructure',
      root: 'libs/shared/infrastructure',
      type: LibraryType.Infrastructure,
    },
  ] as const;

  beforeEach(() => {
    tree = createTreeWithEmptyWorkspace();
  });

  it('should run successfully', async () => {
    // Resolves to the install task; assert on the value rather than invoking it
    // (which `.toThrow()` would do, spawning a real package install).
    await expect(sharedKernelGenerator(tree, baseOptions)).resolves.toEqual(
      expect.any(Function),
    );
  });

  describe('library creation', () => {
    beforeEach(async () => {
      await sharedKernelGenerator(tree, baseOptions);
    });

    it.each(LAYERS)(
      'creates the $project library at $root',
      ({ project, root }) => {
        const config = readProjectConfiguration(tree, project);

        expect(config).toBeDefined();
        expect(config.root).toBe(root);
      },
    );

    it('creates exactly the three kernel libraries', () => {
      const names = [...getProjects(tree).keys()].sort();

      expect(names).toEqual(
        ['shared-contracts', 'shared-infrastructure', 'shared-utils'].sort(),
      );
    });
  });

  describe('nx tags', () => {
    beforeEach(async () => {
      await sharedKernelGenerator(tree, baseOptions);
    });

    it.each(LAYERS)(
      'tags $project with scope:shared and its layer type',
      ({ project, type }) => {
        const { tags } = readProjectConfiguration(tree, project);

        expect(tags).toEqual(
          expect.arrayContaining([LibraryScope.Shared, type]),
        );
      },
    );

    it('never tags any shared library with scope:domain', () => {
      for (const { project } of LAYERS) {
        const { tags } = readProjectConfiguration(tree, project);
        expect(tags).not.toContain(LibraryScope.Domain);
      }
    });
  });

  describe('directory option', () => {
    it('generates the libraries under the provided directory', async () => {
      await sharedKernelGenerator(tree, {
        ...baseOptions,
        directory: 'libs/platform',
      });

      expect(readProjectConfiguration(tree, 'shared-contracts').root).toBe(
        'libs/platform/contracts',
      );
      expect(readProjectConfiguration(tree, 'shared-utils').root).toBe(
        'libs/platform/utils',
      );
      expect(readProjectConfiguration(tree, 'shared-infrastructure').root).toBe(
        'libs/platform/infrastructure',
      );
    });
  });

  describe('prefix option', () => {
    it('prefixes the library names when a prefix is given', async () => {
      await sharedKernelGenerator(tree, {
        ...baseOptions,
        prefix: '@my-org',
      });

      const names = [...getProjects(tree).keys()].sort();

      expect(names).toEqual(
        [
          '@my-org/shared-contracts',
          '@my-org/shared-infrastructure',
          '@my-org/shared-utils',
        ].sort(),
      );
    });

    it('uses unprefixed names when no prefix is given', async () => {
      await sharedKernelGenerator(tree, baseOptions);

      expect(() =>
        readProjectConfiguration(tree, 'shared-contracts'),
      ).not.toThrow();
    });
  });

  // Tasks are inferred (Project Crystal) rather than written as explicit
  // executor targets, so these assert the per-layer config files the inferred
  // plugins key off — robust to both flat (`eslint.config.*`) and, in the
  // ESLint-8 unit env, legacy (`.eslintrc.*`) formats.
  const ESLINT_CONFIG_FILES = [
    'eslint.config.mjs',
    'eslint.config.js',
    'eslint.config.cjs',
    '.eslintrc.json',
    '.eslintrc.js',
    '.eslintrc.cjs',
  ];
  const JEST_CONFIG_FILES = [
    'jest.config.ts',
    'jest.config.cts',
    'jest.config.js',
    'jest.config.cjs',
    'jest.config.mjs',
  ];
  const layerHasConfig = (project: string, candidates: string[]): boolean => {
    const { root } = readProjectConfiguration(tree, project);
    return candidates.some((name) => tree.exists(`${root}/${name}`));
  };

  describe('unitTestRunner option', () => {
    it('always generates contracts without a test setup', async () => {
      // contracts holds only compile-time types, so it is hard-coded to 'none'
      // regardless of the requested runner.
      await sharedKernelGenerator(tree, {
        ...baseOptions,
        unitTestRunner: 'jest',
      });

      expect(layerHasConfig('shared-contracts', JEST_CONFIG_FILES)).toBe(false);
    });

    it('sets up jest for utils and infrastructure when jest is selected', async () => {
      await sharedKernelGenerator(tree, {
        ...baseOptions,
        unitTestRunner: 'jest',
      });

      expect(layerHasConfig('shared-utils', JEST_CONFIG_FILES)).toBe(true);
      expect(layerHasConfig('shared-infrastructure', JEST_CONFIG_FILES)).toBe(
        true,
      );
    });

    it('sets up no test runner anywhere when the runner is none', async () => {
      await sharedKernelGenerator(tree, {
        ...baseOptions,
        unitTestRunner: 'none',
      });

      for (const { project } of LAYERS) {
        expect(layerHasConfig(project, JEST_CONFIG_FILES)).toBe(false);
      }
    });
  });

  describe('linter option', () => {
    it('sets up eslint for every layer when eslint is selected', async () => {
      await sharedKernelGenerator(tree, {
        ...baseOptions,
        linter: 'eslint',
      });

      for (const { project } of LAYERS) {
        expect(layerHasConfig(project, ESLINT_CONFIG_FILES)).toBe(true);
      }
    });

    it('sets up no linter when the linter is none', async () => {
      await sharedKernelGenerator(tree, {
        ...baseOptions,
        linter: 'none',
      });

      for (const { project } of LAYERS) {
        expect(layerHasConfig(project, ESLINT_CONFIG_FILES)).toBe(false);
      }
    });
  });

  describe('bundler option', () => {
    it('adds a build target to every layer when a bundler is selected', async () => {
      await sharedKernelGenerator(tree, {
        ...baseOptions,
        bundler: 'tsc',
      });

      for (const { project } of LAYERS) {
        expect(
          readProjectConfiguration(tree, project).targets?.['build'],
        ).toBeDefined();
      }
    });

    it('adds no build target when the bundler is none', async () => {
      await sharedKernelGenerator(tree, {
        ...baseOptions,
        bundler: 'none',
      });

      for (const { project } of LAYERS) {
        expect(
          readProjectConfiguration(tree, project).targets?.['build'],
        ).toBeUndefined();
      }
    });
  });

  describe('contracts source scaffolding', () => {
    beforeEach(async () => {
      await sharedKernelGenerator(tree, baseOptions);
    });

    it('removes the default placeholder lib file', () => {
      expect(
        tree.exists('libs/shared/contracts/src/lib/shared-contracts.ts'),
      ).toBe(false);
    });

    it('scaffolds the interface source files', () => {
      expect(
        tree.exists(
          'libs/shared/contracts/src/lib/interfaces/http-client.interface.ts',
        ),
      ).toBe(true);
      expect(
        tree.exists(
          'libs/shared/contracts/src/lib/interfaces/store.interface.ts',
        ),
      ).toBe(true);
    });

    it('barrel-exports both interfaces from index.ts', () => {
      const index = tree.read('libs/shared/contracts/src/index.ts', 'utf-8');

      expect(index).toContain('http-client.interface');
      expect(index).toContain('store.interface');
    });
  });

  describe('contracts barrel honors the resolved module format', () => {
    it('omits .js extensions for a CommonJS library (tsc bundler)', async () => {
      await sharedKernelGenerator(tree, { ...baseOptions, bundler: 'tsc' });

      const index = tree.read('libs/shared/contracts/src/index.ts', 'utf-8');

      expect(index).toContain("'./lib/interfaces/http-client.interface'");
      expect(index).not.toContain('.interface.js');
    });

    it('appends .js extensions for an ESM library (vite bundler)', async () => {
      await sharedKernelGenerator(tree, { ...baseOptions, bundler: 'vite' });

      const index = tree.read('libs/shared/contracts/src/index.ts', 'utf-8');

      expect(index).toContain("'./lib/interfaces/http-client.interface.js'");
      expect(index).toContain("'./lib/interfaces/store.interface.js'");
    });
  });

  describe.each([
    { layer: 'utils', root: 'libs/shared/utils', placeholder: 'shared-utils' },
    {
      layer: 'infrastructure',
      root: 'libs/shared/infrastructure',
      placeholder: 'shared-infrastructure',
    },
  ])('$layer source scaffolding', ({ root, placeholder }) => {
    beforeEach(async () => {
      await sharedKernelGenerator(tree, baseOptions);
    });

    it('removes the default placeholder lib and spec files', () => {
      expect(tree.exists(`${root}/src/lib/${placeholder}.ts`)).toBe(false);
      expect(tree.exists(`${root}/src/lib/${placeholder}.spec.ts`)).toBe(false);
    });

    it('leaves an empty barrel index.ts', () => {
      expect(tree.read(`${root}/src/index.ts`, 'utf-8')?.trim()).toBe('');
    });
  });

  describe('idempotency', () => {
    it('is safe to run multiple times without throwing', async () => {
      await sharedKernelGenerator(tree, baseOptions);

      // Resolves to the install task; assert on the value rather than invoking
      // it (which `.toThrow()` would do, spawning a real package install).
      await expect(sharedKernelGenerator(tree, baseOptions)).resolves.toEqual(
        expect.any(Function),
      );
    });

    it('does not recreate or overwrite libraries that already exist', async () => {
      await sharedKernelGenerator(tree, baseOptions);

      const sentinel = 'libs/shared/contracts/src/sentinel.ts';
      tree.write(sentinel, 'export const sentinel = true;');

      await sharedKernelGenerator(tree, baseOptions);

      expect(tree.exists(sentinel)).toBe(true);
      expect(readProjectConfiguration(tree, 'shared-contracts').root).toBe(
        'libs/shared/contracts',
      );
    });

    it('keeps exactly one project per layer after repeated runs', async () => {
      await sharedKernelGenerator(tree, baseOptions);
      await sharedKernelGenerator(tree, baseOptions);

      expect(getProjects(tree).size).toBe(LAYERS.length);
    });

    it('scaffolds a layer whose directory exists but was never generated', async () => {
      // An aborted run can leave an empty `libs/shared/<layer>` directory with
      // no library manifest. The directory existing must not make the generator
      // skip the layer — it should still be scaffolded.
      tree.write('libs/shared/contracts/src/.gitkeep', '');

      await sharedKernelGenerator(tree, baseOptions);

      // The project is registered (manifest-agnostic: `@nx/js:library` writes
      // `project.json` in this integrated workspace) and its source exists.
      expect(readProjectConfiguration(tree, 'shared-contracts').root).toBe(
        'libs/shared/contracts',
      );
      expect(tree.exists('libs/shared/contracts/src/index.ts')).toBe(true);
    });
  });
});
