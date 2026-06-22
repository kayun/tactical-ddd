import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';
import { Tree, readProjectConfiguration } from '@nx/devkit';

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
  const options: SharedKernelGeneratorSchema = { directory: 'libs/shared' };

  beforeEach(() => {
    tree = createTreeWithEmptyWorkspace();
  });

  it('should run successfully', async () => {
    await expect(sharedKernelGenerator(tree, options)).resolves.not.toThrow();
  });

  describe('library creation', () => {
    beforeEach(async () => {
      await sharedKernelGenerator(tree, options);
    });

    it('should create the contracts library at libs/shared/contracts', () => {
      const config = readProjectConfiguration(tree, 'contracts');

      expect(config).toBeDefined();
      expect(config.root).toBe('libs/shared/contracts');
    });

    it('should create the utils library at libs/shared/utils', () => {
      const config = readProjectConfiguration(tree, 'utils');

      expect(config).toBeDefined();
      expect(config.root).toBe('libs/shared/utils');
    });

    it('should create the infrastructure library at libs/shared/infrastructure', () => {
      const config = readProjectConfiguration(tree, 'infrastructure');

      expect(config).toBeDefined();
      expect(config.root).toBe('libs/shared/infrastructure');
    });
  });

  describe('nx tags', () => {
    beforeEach(async () => {
      await sharedKernelGenerator(tree, options);
    });

    it('should tag contracts with scope:shared and type:contracts', () => {
      const { tags } = readProjectConfiguration(tree, 'contracts');

      expect(tags).toEqual(
        expect.arrayContaining([LibraryScope.Shared, LibraryType.Contracts]),
      );
    });

    it('should tag utils with scope:shared and type:utils', () => {
      const { tags } = readProjectConfiguration(tree, 'utils');

      expect(tags).toEqual(
        expect.arrayContaining([LibraryScope.Shared, LibraryType.Utils]),
      );
    });

    it('should tag infrastructure with scope:shared and type:infrastructure', () => {
      const { tags } = readProjectConfiguration(tree, 'infrastructure');

      expect(tags).toEqual(
        expect.arrayContaining([
          LibraryScope.Shared,
          LibraryType.Infrastructure,
        ]),
      );
    });

    it('should never tag any shared library with scope:domain', () => {
      for (const project of ['contracts', 'utils', 'infrastructure']) {
        const { tags } = readProjectConfiguration(tree, project);
        expect(tags).not.toContain(LibraryScope.Domain);
      }
    });
  });

  describe('contracts library configuration', () => {
    beforeEach(async () => {
      await sharedKernelGenerator(tree, options);
    });

    it('should generate contracts without a unit test runner', () => {
      const config = readProjectConfiguration(tree, 'contracts');

      expect(config.targets?.['test']).toBeUndefined();

      // No test config should be emitted, regardless of the workspace's module
      // setup (jest.config may resolve to .ts/.mts/.cts/.js/.cjs, and Vitest uses
      // vite.config.*) — so assert none of those exist rather than a single name.
      const testConfigFiles = tree
        .children('libs/shared/contracts')
        .filter((file) => /^(jest|vite)\.config\.[mc]?[jt]s$/.test(file));

      expect(testConfigFiles).toEqual([]);
    });
  });

  describe('idempotency', () => {
    it('should be safe to run multiple times without throwing', async () => {
      await sharedKernelGenerator(tree, options);

      await expect(sharedKernelGenerator(tree, options)).resolves.not.toThrow();
    });

    it('should not duplicate or recreate libraries that already exist', async () => {
      await sharedKernelGenerator(tree, options);

      // Mark the existing contracts source so we can detect an unwanted overwrite.
      const sentinel = 'libs/shared/contracts/src/sentinel.ts';
      tree.write(sentinel, 'export const sentinel = true;');

      await sharedKernelGenerator(tree, options);

      // The pre-existing library must be left untouched.
      expect(tree.exists(sentinel)).toBe(true);
      expect(readProjectConfiguration(tree, 'contracts').root).toBe(
        'libs/shared/contracts',
      );
    });

    it('should keep exactly one project per layer after repeated runs', async () => {
      await sharedKernelGenerator(tree, options);
      await sharedKernelGenerator(tree, options);

      for (const project of ['contracts', 'utils', 'infrastructure']) {
        expect(() => readProjectConfiguration(tree, project)).not.toThrow();
      }
    });
  });
});
