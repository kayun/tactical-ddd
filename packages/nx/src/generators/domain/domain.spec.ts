import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';
import {
  Tree,
  readJson,
  readProjectConfiguration,
  updateJson,
} from '@nx/devkit';

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

// Under the `react-native` preset the domain generator delegates ui/features to
// `@nx/react-native`'s library generator (loaded on demand via `ensurePackage`).
// Running the real generator in-memory is heavy and environment-sensitive, so
// stub it and assert on *how* the domain generator drives it — mirroring how the
// React web path is left to react-runtime.spec + the e2e suite. The stub returns
// a no-op install callback, matching the real generator's `GeneratorCallback`.
const mockReactNativeLibraryGenerator = jest.fn(
  async (_tree: Tree, _options: unknown) => () => undefined as void,
);
jest.mock('@nx/react-native', () => ({
  __esModule: true,
  reactNativeLibraryGenerator: mockReactNativeLibraryGenerator,
}));

// Same treatment for the `vue` preset, which delegates ui/features to
// `@nx/vue`'s library generator (also loaded on demand via `ensurePackage`).
const mockVueLibraryGenerator = jest.fn(
  async (_tree: Tree, _options: unknown) => () => undefined as void,
);
jest.mock('@nx/vue', () => ({
  __esModule: true,
  libraryGenerator: mockVueLibraryGenerator,
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
    prefix: '',
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
    it('scaffolds the default domain, application and infrastructure folders', async () => {
      await domainGenerator(tree, baseOptions);

      // The empty layers are kept in version control with a `.gitkeep`; the
      // application layer instead ships the generated facade (asserted below).
      expect(tree.exists('libs/orders/core/src/lib/domain/.gitkeep')).toBe(
        true,
      );
      expect(
        tree.exists('libs/orders/core/src/lib/infrastructure/.gitkeep'),
      ).toBe(true);
      expect(tree.exists('libs/orders/core/src/lib/application')).toBe(true);
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

  /** Types the facade templates may use from the runtime kernel. */
  const KERNEL_TYPES = ['Facade', 'Query', 'Watch', 'Command', 'Outcome'];

  /** Names of the zero-argument methods a generated facade declares. */
  const methodNames = (source: string): string[] =>
    [...source.matchAll(/^\s*(\w+)\(\):/gm)].map(([, name]) => name);

  /**
   * Kernel types a generated file references without importing them. Compares
   * against the body only, so the import list itself never counts as a use.
   */
  const missingKernelImports = (source: string): string[] => {
    const importList =
      /import type \{([^}]+)\} from '@tactical-ddd\/core'/.exec(source)?.[1] ??
      '';
    const imported = importList.split(',').map((name) => name.trim());
    const body = source.replace(/import type \{[^}]+\} from '[^']+';/g, '');

    return KERNEL_TYPES.filter(
      (type) =>
        new RegExp(`\\b${type}\\b`).test(body) && !imported.includes(type),
    );
  };

  describe('facade scaffolding', () => {
    // `names('<domain>Facade').className` — e.g. orders → OrdersFacade.
    const FACADE = 'OrdersFacade';

    it('generates the facade type (with a DI token) in the contracts library', async () => {
      await domainGenerator(tree, baseOptions);

      const iface = tree.read(
        'libs/orders/contracts/src/lib/interfaces/orders-facade.interface.ts',
        'utf-8',
      );

      // A type alias, not an interface: `Facade` composes the declared groups,
      // and an interface body would be a place to add a fourth, ungrouped method.
      expect(iface).toContain(`export type ${FACADE} = Facade<{`);
      // The paired const carries a Symbol DI token for the type.
      expect(iface).toContain(`Symbol.for('${FACADE}')`);
    });

    it('declares one method of each kind, in its own group', async () => {
      await domainGenerator(tree, baseOptions);

      const iface =
        tree.read(
          'libs/orders/contracts/src/lib/interfaces/orders-facade.interface.ts',
          'utf-8',
        ) ?? '';

      // Each group is constrained to a return shape, so the scaffold shows the
      // kernel's vocabulary rather than leaving the kind to be inferred later.
      expect(iface).toContain('queries: {');
      expect(iface).toContain('query(): Query<unknown>;');
      expect(iface).toContain('watches: {');
      expect(iface).toContain('watch(): Watch<unknown>;');
      expect(iface).toContain('commands: {');
      expect(iface).toContain('command(): Command;');
    });

    it('imports every kernel type the facade type uses', async () => {
      // A type used but not imported makes the generated library fail to
      // compile, and no unit test of the generator would notice otherwise.
      await domainGenerator(tree, baseOptions);

      const iface =
        tree.read(
          'libs/orders/contracts/src/lib/interfaces/orders-facade.interface.ts',
          'utf-8',
        ) ?? '';

      expect(missingKernelImports(iface)).toEqual([]);
    });

    it('declares the kernel as a dependency of the contracts library', async () => {
      await domainGenerator(tree, baseOptions);

      const dependencies =
        readJson(tree, 'libs/orders/contracts/package.json').dependencies ?? {};

      expect(dependencies).toHaveProperty('@tactical-ddd/core');
    });

    it('barrel-exports the facade interface from the contracts library', async () => {
      await domainGenerator(tree, baseOptions);

      const barrel =
        tree.read('libs/orders/contracts/src/index.ts', 'utf-8') ?? '';

      expect(barrel).toContain('orders-facade.interface');
    });

    it('generates a facade implementation in the core application layer', async () => {
      await domainGenerator(tree, { ...baseOptions, prefix: '@my-org' });

      const facade = tree.read(
        'libs/orders/core/src/lib/application/orders.facade.ts',
        'utf-8',
      );

      expect(facade).toContain(
        `export class Core${FACADE} implements ${FACADE}`,
      );
      // It depends on the contract abstraction, imported by package name.
      expect(facade).toContain(`from '@my-org/orders-contracts'`);
      // Methods keep the kernel's vocabulary: a write resolves to nothing.
      expect(facade).toContain('command(): Command');
    });

    it('imports every kernel type the implementation uses', async () => {
      await domainGenerator(tree, baseOptions);

      const facade =
        tree.read(
          'libs/orders/core/src/lib/application/orders.facade.ts',
          'utf-8',
        ) ?? '';

      expect(missingKernelImports(facade)).toEqual([]);
    });

    it('implements every method the contract declares', async () => {
      // The two templates are edited by hand and drift silently: a method
      // renamed in one and not the other only surfaces when a consumer compiles
      // the generated workspace.
      await domainGenerator(tree, baseOptions);

      const iface =
        tree.read(
          'libs/orders/contracts/src/lib/interfaces/orders-facade.interface.ts',
          'utf-8',
        ) ?? '';
      const facade =
        tree.read(
          'libs/orders/core/src/lib/application/orders.facade.ts',
          'utf-8',
        ) ?? '';

      const declared = methodNames(iface);

      expect(declared.length).toBeGreaterThan(0);
      expect(methodNames(facade)).toEqual(declared);
    });

    it('declares the kernel as a dependency of the core library', async () => {
      await domainGenerator(tree, baseOptions);

      const dependencies =
        readJson(tree, 'libs/orders/core/package.json').dependencies ?? {};

      expect(dependencies).toHaveProperty('@tactical-ddd/core');
    });

    it('adds the kernel to the workspace when it manages no version yet', async () => {
      await domainGenerator(tree, baseOptions);

      const dependencies = readJson(tree, 'package.json').dependencies ?? {};

      expect(dependencies).toHaveProperty('@tactical-ddd/core');
    });

    it('leaves an existing kernel version untouched', async () => {
      updateJson(tree, 'package.json', (pkg) => {
        pkg.dependencies = {
          ...pkg.dependencies,
          '@tactical-ddd/core': '0.1.5',
        };
        return pkg;
      });

      await domainGenerator(tree, baseOptions);

      expect(
        readJson(tree, 'package.json').dependencies['@tactical-ddd/core'],
      ).toBe('0.1.5');
      // Libraries follow the workspace rather than pinning a range of their own.
      expect(
        readJson(tree, 'libs/orders/contracts/package.json').dependencies[
          '@tactical-ddd/core'
        ],
      ).toBe('0.1.5');
    });

    it('imports the contracts package by its unscoped name when no prefix is given', async () => {
      await domainGenerator(tree, baseOptions); // baseOptions has no prefix

      const facade =
        tree.read(
          'libs/orders/core/src/lib/application/orders.facade.ts',
          'utf-8',
        ) ?? '';

      expect(facade).toContain(`from 'orders-contracts'`);
      expect(facade).not.toContain('undefined');
    });

    it('declares the contracts package as a dependency of the core library', async () => {
      // The facade imports the contracts package, so it must be a declared
      // dependency or `@nx/dependency-checks` fails when the core lib is linted.
      await domainGenerator(tree, { ...baseOptions, prefix: '@my-org' });

      const dependencies =
        readJson(tree, 'libs/orders/core/package.json').dependencies ?? {};

      expect(dependencies).toHaveProperty('@my-org/orders-contracts');
    });

    it('barrel-exports the facade implementation from the core library', async () => {
      await domainGenerator(tree, baseOptions);

      const barrel = tree.read('libs/orders/core/src/index.ts', 'utf-8') ?? '';

      expect(barrel).toContain('orders.facade');
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

  describe('react-native preset', () => {
    const rnOptions: DomainGeneratorSchema = {
      ...baseOptions,
      preset: 'react-native',
      layers: ['ui', 'features'],
    };

    beforeEach(() => {
      mockReactNativeLibraryGenerator.mockClear();
    });

    it('generates ui and features via @nx/react-native, not @nx/js', async () => {
      await domainGenerator(tree, rnOptions);

      expect(mockReactNativeLibraryGenerator).toHaveBeenCalledTimes(2);
      const roots = mockReactNativeLibraryGenerator.mock.calls.map(
        ([, opts]) => (opts as { directory: string }).directory,
      );
      expect(roots).toEqual(
        expect.arrayContaining(['libs/orders/ui', 'libs/orders/features']),
      );
    });

    it('does not fall back to the @nx/js DOM path for a react-native layer', async () => {
      await domainGenerator(tree, { ...rnOptions, layers: ['ui'] });

      // @nx/js was never used for the ui layer, so no tsconfig.lib.json exists to
      // carry a DOM lib entry (React Native renders to native views, not the DOM).
      expect(tree.exists('libs/orders/ui/tsconfig.lib.json')).toBe(false);
    });

    it('delegates with skipPackageJson, addPlugin and the layer tags', async () => {
      await domainGenerator(tree, { ...rnOptions, layers: ['ui'] });

      expect(mockReactNativeLibraryGenerator).toHaveBeenCalledWith(
        tree,
        expect.objectContaining({
          directory: 'libs/orders/ui',
          addPlugin: true,
          skipPackageJson: true,
          linter: 'eslint',
          tags: expect.stringContaining(LibraryType.Ui),
        }),
      );
    });

    it('passes jest straight through as the test runner', async () => {
      await domainGenerator(tree, {
        ...rnOptions,
        layers: ['ui'],
        unitTestRunner: 'jest',
      });

      expect(mockReactNativeLibraryGenerator).toHaveBeenCalledWith(
        tree,
        expect.objectContaining({ unitTestRunner: 'jest' }),
      );
    });

    it('coerces a non-jest runner to none — RN supports only jest/none', async () => {
      await domainGenerator(tree, {
        ...rnOptions,
        layers: ['ui'],
        unitTestRunner: 'vitest',
      });

      expect(mockReactNativeLibraryGenerator).toHaveBeenCalledWith(
        tree,
        expect.objectContaining({ unitTestRunner: 'none' }),
      );
    });

    it('adds the react and react-native runtime, never react-dom', async () => {
      await domainGenerator(tree, { ...rnOptions, layers: ['ui'] });

      const deps = readJson(tree, 'package.json').dependencies ?? {};
      expect(deps).toHaveProperty('react');
      expect(deps).toHaveProperty('react-native');
      expect(deps).not.toHaveProperty('react-dom');
    });

    it('defers to a react-native runtime the workspace already manages', async () => {
      updateJson(tree, 'package.json', (json) => {
        json.dependencies = {
          ...json.dependencies,
          'react-native': '0.84.0',
        };
        return json;
      });

      await domainGenerator(tree, { ...rnOptions, layers: ['ui'] });

      const deps = readJson(tree, 'package.json').dependencies ?? {};
      // The existing pin is left untouched and the missing half is not added on
      // top of it — we defer entirely to what the workspace already manages.
      expect(deps['react-native']).toBe('0.84.0');
      expect(deps).not.toHaveProperty('react');
    });
  });

  describe('vue preset', () => {
    const vueOptions: DomainGeneratorSchema = {
      ...baseOptions,
      preset: 'vue',
      unitTestRunner: 'vitest',
      layers: ['ui', 'features'],
    };

    beforeEach(() => {
      mockVueLibraryGenerator.mockClear();
    });

    it('generates ui and features via @nx/vue, not @nx/js', async () => {
      await domainGenerator(tree, vueOptions);

      expect(mockVueLibraryGenerator).toHaveBeenCalledTimes(2);
      const roots = mockVueLibraryGenerator.mock.calls.map(
        ([, opts]) => (opts as { directory: string }).directory,
      );
      expect(roots).toEqual(
        expect.arrayContaining(['libs/orders/ui', 'libs/orders/features']),
      );
    });

    it('does not fall back to the @nx/js DOM path for a vue layer', async () => {
      await domainGenerator(tree, { ...vueOptions, layers: ['ui'] });

      // @nx/js was never used for the ui layer, so there is no tsconfig.lib.json
      // to carry a DOM lib entry — `@nx/vue` writes the library's own config.
      expect(tree.exists('libs/orders/ui/tsconfig.lib.json')).toBe(false);
    });

    it('delegates with addPlugin and the layer tags', async () => {
      await domainGenerator(tree, { ...vueOptions, layers: ['ui'] });

      expect(mockVueLibraryGenerator).toHaveBeenCalledWith(
        tree,
        expect.objectContaining({
          directory: 'libs/orders/ui',
          addPlugin: true,
          linter: 'eslint',
          tags: expect.stringContaining(LibraryType.Ui),
        }),
      );
    });

    it('does not skip the package.json — the Vue tooling is gated behind it', async () => {
      await domainGenerator(tree, { ...vueOptions, layers: ['ui'] });

      // Unlike the React paths: `skipPackageJson` would also drop
      // `@vitejs/plugin-vue`, `vue-tsc` and `@vue/test-utils`, without which the
      // generated library cannot build or run its tests. `@nx/vue` declares `vue`
      // itself keeping any existing version, so there is no skew to guard against.
      expect(mockVueLibraryGenerator).toHaveBeenCalledWith(
        tree,
        expect.not.objectContaining({ skipPackageJson: true }),
      );
    });

    it('passes vitest straight through as the test runner', async () => {
      await domainGenerator(tree, { ...vueOptions, layers: ['ui'] });

      expect(mockVueLibraryGenerator).toHaveBeenCalledWith(
        tree,
        expect.objectContaining({ unitTestRunner: 'vitest' }),
      );
    });

    it('coerces a non-vitest runner to none — Vue supports only vitest/none', async () => {
      await domainGenerator(tree, {
        ...vueOptions,
        layers: ['ui'],
        unitTestRunner: 'jest',
      });

      expect(mockVueLibraryGenerator).toHaveBeenCalledWith(
        tree,
        expect.objectContaining({ unitTestRunner: 'none' }),
      );
    });

    it('coerces a bundler @nx/vue does not support to none', async () => {
      // `tsc` is the Tactical DDD standard for the framework-agnostic layers, but
      // `@nx/vue:library` accepts only vite/none.
      await domainGenerator(tree, {
        ...vueOptions,
        layers: ['ui'],
        bundler: 'tsc',
      });

      expect(mockVueLibraryGenerator).toHaveBeenCalledWith(
        tree,
        expect.objectContaining({ bundler: 'none' }),
      );
    });

    it('passes vite through as the bundler', async () => {
      await domainGenerator(tree, {
        ...vueOptions,
        layers: ['ui'],
        bundler: 'vite',
      });

      expect(mockVueLibraryGenerator).toHaveBeenCalledWith(
        tree,
        expect.objectContaining({ bundler: 'vite' }),
      );
    });

    it('leaves the Vue runtime to @nx/vue rather than adding it centrally', async () => {
      await domainGenerator(tree, { ...vueOptions, layers: ['ui'] });

      // The delegated generator (stubbed here) is what declares `vue`, so the
      // domain generator must not add a second, possibly different range.
      const deps = readJson(tree, 'package.json').dependencies ?? {};
      expect(deps).not.toHaveProperty('vue');
    });
  });

  // The React (web) runtime policy is unit-tested directly against
  // `reactRuntimeDependencies` (see react-runtime.spec.ts) — that avoids running
  // the heavy `@nx/react` generator in-memory here — and the end-to-end wiring
  // (skipPackageJson + the deferral) is covered by the e2e suite.
});
