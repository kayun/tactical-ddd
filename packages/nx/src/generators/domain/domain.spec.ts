import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';
import { Tree, readProjectConfiguration } from '@nx/devkit';

import { domainGenerator } from './domain';
import { DomainGeneratorSchema } from './schema';
import { LibraryScope, LibraryType } from '../../types';

// Prettier v3 ships as ESM behind a CJS shim whose top-level `import()` throws
// under jest's VM. The delegated `@nx/js` generator loads it eagerly via
// `ensurePackage('prettier')`. Stub it so neither `require` nor `import`
// evaluates the real shim; the no-op formatter is irrelevant to these tests.
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

describe('domain generator', () => {
  let tree: Tree;

  const baseOptions: DomainGeneratorSchema = {
    name: 'orders',
    directory: 'libs/orders',
    layers: ['contracts', 'core'],
    preset: 'none',
    linter: 'eslint',
    unitTestRunner: 'jest',
    bundler: 'tsc',
  };

  beforeEach(() => {
    tree = createTreeWithEmptyWorkspace();
    tree.write(ESLINT_CONFIG, ROOT_ESLINT_WITH_RULE);
    // Seed the shared kernel so the implicit-existence warning stays quiet
    // unless a test deliberately removes it.
    tree.write(
      'libs/shared/contracts/package.json',
      JSON.stringify({ name: 'shared-contracts' }),
    );
  });

  describe('layer scaffolding', () => {
    it('generates the requested layer libraries', async () => {
      await domainGenerator(tree, baseOptions);

      expect(tree.exists('libs/orders/contracts/package.json')).toBe(true);
      expect(tree.exists('libs/orders/core/package.json')).toBe(true);
    });

    it('does not generate unselected layers', async () => {
      await domainGenerator(tree, baseOptions);

      expect(tree.exists('libs/orders/ui/package.json')).toBe(false);
      expect(tree.exists('libs/orders/features/package.json')).toBe(false);
    });

    it('tags each layer with scope:domain, the domain tag and its type', async () => {
      await domainGenerator(tree, baseOptions);

      expect(readProjectConfiguration(tree, 'orders-contracts').tags).toEqual(
        expect.arrayContaining([
          LibraryScope.Domain,
          'domain:orders',
          LibraryType.Contracts,
        ]),
      );
      expect(readProjectConfiguration(tree, 'orders-core').tags).toEqual(
        expect.arrayContaining([
          LibraryScope.Domain,
          'domain:orders',
          LibraryType.Core,
        ]),
      );
    });

    it('tags the features layer type:features, never type:ui', async () => {
      await domainGenerator(tree, { ...baseOptions, layers: ['features'] });

      const tags = readProjectConfiguration(tree, 'orders-features').tags ?? [];

      expect(tags).toContain(LibraryType.Features);
      expect(tags).not.toContain(LibraryType.Ui);
    });

    it('applies the organization prefix to the library names', async () => {
      await domainGenerator(tree, { ...baseOptions, prefix: '@my-org' });

      expect(
        readProjectConfiguration(tree, '@my-org/orders-contracts'),
      ).toBeDefined();
    });
  });

  describe('module boundaries', () => {
    it('injects a per-domain constraint confining the domain to itself, shared and public contracts', async () => {
      await domainGenerator(tree, baseOptions);

      const config = tree.read(ESLINT_CONFIG, 'utf-8') ?? '';

      // The base config starts with empty depConstraints, so these tags can only
      // come from the per-domain constraint the generator injects.
      expect(config).toContain('domain:orders');
      expect(config).toContain('scope:shared');
      // Published-language: a domain may import other domains' public contracts.
      expect(config).toContain('type:contracts');
    });
  });

  describe('core clean architecture layering', () => {
    it('scaffolds the domain, application and infrastructure layer folders', async () => {
      await domainGenerator(tree, baseOptions);

      for (const layer of ['domain', 'application', 'infrastructure']) {
        expect(tree.exists(`libs/orders/core/src/lib/${layer}/index.ts`)).toBe(
          true,
        );
      }
    });

    it('restricts cross-layer imports in the core library ESLint config', async () => {
      await domainGenerator(tree, baseOptions);

      const config =
        tree.read('libs/orders/core/eslint.config.mjs', 'utf-8') ?? '';

      expect(config).toContain('no-restricted-imports');
      expect(config).toContain('src/lib/domain/**/*.ts');
      expect(config).toContain('src/lib/application/**/*.ts');
      expect(config).toContain('Clean Architecture violation');
    });
  });

  describe('implicit shared-kernel check', () => {
    it('warns when the shared kernel is missing', async () => {
      tree.delete('libs/shared/contracts/package.json');
      const warn = jest
        .spyOn(console, 'warn')
        .mockImplementation(() => undefined);

      await domainGenerator(tree, baseOptions);

      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('libs/shared/contracts'),
      );
      warn.mockRestore();
    });

    it('does not warn about the shared kernel when it exists', async () => {
      const warn = jest
        .spyOn(console, 'warn')
        .mockImplementation(() => undefined);

      await domainGenerator(tree, baseOptions);

      expect(warn).not.toHaveBeenCalledWith(
        expect.stringContaining('Shared kernel not found'),
      );
      warn.mockRestore();
    });
  });

  describe('idempotency', () => {
    it('is safe to run multiple times without throwing', async () => {
      await domainGenerator(tree, baseOptions);

      // Resolves to the install task; assert on the value rather than invoking
      // it (which `.toThrow()` would do, spawning a real package install).
      await expect(domainGenerator(tree, baseOptions)).resolves.toEqual(
        expect.any(Function),
      );
    });
  });
});
