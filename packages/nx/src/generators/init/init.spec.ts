import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';
import {
  Tree,
  getProjects,
  readJson,
  readNxJson,
  readProjectConfiguration,
  updateJson,
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
    // Resolves to the install task; assert on the value rather than `.toThrow()`
    // so the returned callback is not invoked (which would spawn a real install).
    await expect(initGenerator(tree, baseOptions)).resolves.toEqual(
      expect.any(Function),
    );
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

    it('registers build/lint/test defaults for the @nx/js:library generator', async () => {
      await initGenerator(tree, {
        ...baseOptions,
        linter: 'eslint',
        unitTestRunner: 'jest',
        bundler: 'none',
      });

      expect(readNxJson(tree)?.generators).toMatchObject({
        '@nx/js:library': {
          bundler: 'none',
          linter: 'eslint',
          unitTestRunner: 'jest',
        },
      });
    });

    it('forwards the chosen linter/test-runner to the library generator defaults', async () => {
      await initGenerator(tree, {
        ...baseOptions,
        linter: 'none',
        unitTestRunner: 'vitest',
      });

      const generators = readNxJson(tree)?.generators as Record<
        string,
        Record<string, unknown>
      >;

      expect(generators['@nx/js:library']).toMatchObject({
        linter: 'none',
        unitTestRunner: 'vitest',
      });
      expect(generators['@nx/react:library']).toMatchObject({
        linter: 'none',
        unitTestRunner: 'vitest',
      });
    });

    it('defaults the library bundler to none when none is provided', async () => {
      const { bundler: _omit, ...withoutBundler } = baseOptions;

      await initGenerator(tree, withoutBundler);

      const generators = readNxJson(tree)?.generators as Record<
        string,
        Record<string, unknown>
      >;

      expect(generators['@nx/js:library'].bundler).toBe('none');
      expect(generators['@nx/react:library'].bundler).toBe('none');
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

    it('stays idempotent on a legacy .eslintrc.json root even when detection reports flat config', async () => {
      // Reproduces the e2e regression: a workspace scaffolded against ESLint 8
      // keeps a legacy `.eslintrc.json`, but our plugin install bumps ESLint to
      // >= 9, flipping `@nx/eslint`'s `useFlatConfig()` to flat. The flat AST
      // utils then read a non-existent flat config and throw. We pin
      // `ESLINT_USE_FLAT_CONFIG=true` to stand in for the post-bump detection.
      tree.delete(ESLINT_CONFIG);
      tree.write(
        '.eslintrc.json',
        JSON.stringify({
          root: true,
          overrides: [
            {
              files: ['*.ts', '*.tsx', '*.js', '*.jsx'],
              rules: {
                '@nx/enforce-module-boundaries': [
                  'error',
                  { enforceBuildableLibDependency: true, depConstraints: [] },
                ],
              },
            },
          ],
        }),
      );

      const previous = process.env.ESLINT_USE_FLAT_CONFIG;
      process.env.ESLINT_USE_FLAT_CONFIG = 'true';

      try {
        await initGenerator(tree, baseOptions);

        await expect(initGenerator(tree, baseOptions)).resolves.toEqual(
          expect.any(Function),
        );

        // The legacy root config was updated in place, not abandoned.
        expect(tree.read('.eslintrc.json', 'utf-8') ?? '').toContain(
          'scope:shared',
        );
        // The caller's env value is left exactly as it was found.
        expect(process.env.ESLINT_USE_FLAT_CONFIG).toBe('true');
      } finally {
        if (previous === undefined) {
          delete process.env.ESLINT_USE_FLAT_CONFIG;
        } else {
          process.env.ESLINT_USE_FLAT_CONFIG = previous;
        }
      }
    });

    it('does not throw when no ESLint config is present', async () => {
      tree.delete(ESLINT_CONFIG);
      expect(tree.exists(ESLINT_CONFIG)).toBe(false);

      await expect(initGenerator(tree, baseOptions)).resolves.toEqual(
        expect.any(Function),
      );
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

  describe('dependency installation', () => {
    const devDeps = (): Record<string, string> =>
      readJson(tree, 'package.json').devDependencies ?? {};

    it('returns an install task', async () => {
      const task = await initGenerator(tree, baseOptions);

      expect(typeof task).toBe('function');
    });

    it('adds the core generator plugins as devDependencies', async () => {
      await initGenerator(tree, baseOptions);

      expect(devDeps()).toEqual(
        expect.objectContaining({
          '@nx/js': expect.any(String),
          '@nx/react': expect.any(String),
        }),
      );
    });

    it('adds the ESLint plugins when the linter is eslint', async () => {
      await initGenerator(tree, { ...baseOptions, linter: 'eslint' });

      expect(devDeps()).toEqual(
        expect.objectContaining({
          '@nx/eslint': expect.any(String),
          '@nx/eslint-plugin': expect.any(String),
        }),
      );
    });

    it('omits the ESLint plugins when the linter is none', async () => {
      // Use a pre-existing flat config so module boundaries are not the reason
      // ESLint is pulled in; with linter:none init must not add the plugins.
      await initGenerator(tree, { ...baseOptions, linter: 'none' });

      expect(devDeps()).not.toHaveProperty('@nx/eslint-plugin');
    });

    it('adds @nx/jest for the jest runner and @nx/vite for vitest', async () => {
      await initGenerator(tree, { ...baseOptions, unitTestRunner: 'jest' });
      expect(devDeps()).toHaveProperty('@nx/jest');

      tree = createTreeWithEmptyWorkspace();
      tree.write(ESLINT_CONFIG, ROOT_ESLINT_WITH_RULE);
      await initGenerator(tree, { ...baseOptions, unitTestRunner: 'vitest' });
      expect(devDeps()).toHaveProperty('@nx/vite');
    });

    it('does not downgrade a dependency that is already present', async () => {
      updateJson(tree, 'package.json', (json) => {
        json.devDependencies = {
          ...json.devDependencies,
          '@nx/js': '999.0.0',
        };
        return json;
      });

      await initGenerator(tree, baseOptions);

      expect(devDeps()['@nx/js']).toBe('999.0.0');
    });
  });
});
