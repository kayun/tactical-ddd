import { execSync } from 'child_process';
import { existsSync, readFileSync, rmSync } from 'fs';
import { join } from 'path';

import { createTestProject } from './test-utils';

// Booting a real Nx workspace, installing the plugin and running the generator
// is slow, so give the whole suite a generous time budget.
jest.setTimeout(600_000);

describe('@tactical-ddd/nx init generator (e2e)', () => {
  const PREFIX = '@e2e-org';
  const SHARED_DIR = 'libs/shared';
  const LAYERS = ['contracts', 'utils', 'infrastructure'] as const;

  // Root ESLint config file names a create-nx-workspace may emit — flat config
  // (newest) first, then the legacy `.eslintrc.*` formats. The init generator
  // detects and updates whichever is present via `@nx/eslint`'s AST utils.
  const ESLINT_CONFIG_FILES = [
    'eslint.config.mjs',
    'eslint.config.js',
    'eslint.config.cjs',
    'eslint.config.ts',
    '.eslintrc.json',
    '.eslintrc.js',
    '.eslintrc.cjs',
    '.eslintrc',
  ];

  let projectDirectory: string;

  const runGenerator = () =>
    execSync(
      `npx nx g @tactical-ddd/nx:init --prefix=${PREFIX} --sharedDirectory=${SHARED_DIR} --linter=eslint --unitTestRunner=jest --preset=react --no-interactive`,
      { cwd: projectDirectory, stdio: 'inherit', env: process.env },
    );

  const layerRoot = (layer: string) =>
    join(projectDirectory, SHARED_DIR, layer);

  // Assertions read generated files directly rather than going through
  // `nx show project`: right after generation the Nx daemon may still serve a
  // graph computed before the libraries existed, so the project list races and
  // can come back empty. The generated files are the source of truth.
  const readJson = (path: string) =>
    JSON.parse(readFileSync(join(projectDirectory, path), 'utf-8'));

  const readLibManifest = (layer: string) =>
    JSON.parse(readFileSync(join(layerRoot(layer), 'package.json'), 'utf-8'));

  const readEslintConfig = () => {
    const file = ESLINT_CONFIG_FILES.map((name) =>
      join(projectDirectory, name),
    ).find(existsSync);

    if (!file) {
      throw new Error('No root ESLint config found in the test workspace');
    }

    return readFileSync(file, 'utf-8');
  };

  beforeAll(() => {
    projectDirectory = createTestProject('test-project-init');
    runGenerator();
  });

  afterAll(() => {
    if (projectDirectory) {
      rmSync(projectDirectory, { recursive: true, force: true });
    }
  });

  describe('generator defaults', () => {
    it('records the shared-kernel defaults in nx.json', () => {
      const sharedKernelDefaults =
        readJson('nx.json').generators?.['@tactical-ddd/nx']?.['shared-kernel'];

      expect(sharedKernelDefaults).toMatchObject({
        prefix: PREFIX,
        linter: 'eslint',
        unitTestRunner: 'jest',
      });
    });

    it('records build/lint/test defaults for the built-in library generators', () => {
      const generators = readJson('nx.json').generators;

      expect(generators?.['@nx/js:library']).toMatchObject({
        bundler: 'none',
        linter: 'eslint',
        unitTestRunner: 'jest',
      });
      expect(generators?.['@nx/react:library']).toMatchObject({
        bundler: 'none',
        linter: 'eslint',
        unitTestRunner: 'jest',
      });
    });
  });

  describe('dependency installation', () => {
    it('adds the generator plugin packages to the workspace package.json', () => {
      const devDependencies = readJson('package.json').devDependencies ?? {};

      // Plugins the configured/invoked generators rely on; jest because the
      // workspace was bootstrapped with --unitTestRunner=jest.
      for (const pkg of [
        '@nx/js',
        '@nx/react',
        '@nx/eslint',
        '@nx/eslint-plugin',
        '@nx/jest',
      ]) {
        expect(devDependencies).toHaveProperty(pkg);
      }
    });

    it('installs the React runtime and bindings as production dependencies under the react preset', () => {
      const dependencies = readJson('package.json').dependencies ?? {};

      for (const pkg of ['react', 'react-dom', '@tactical-ddd/react']) {
        expect(dependencies).toHaveProperty(pkg);
      }
    });
  });

  describe('module boundaries', () => {
    it('wires the architecture dep-constraints into the root ESLint config', () => {
      const config = readEslintConfig();

      expect(config).toContain('scope:shared');
      expect(config).toContain('scope:domain');
      expect(config).toContain('type:contracts');
      expect(config).toContain('onlyDependOnLibsWithTags');
    });

    it('protects against cross-domain imports via the dynamic domain:* tag', () => {
      expect(readEslintConfig()).toContain('domain:*');
    });

    it('replaces the empty default depConstraints', () => {
      expect(readEslintConfig()).not.toMatch(/depConstraints:\s*\[\s*\]/);
    });
  });

  describe('shared kernel scaffolding', () => {
    it.each(LAYERS)('scaffolds the "%s" library under libs/shared', (layer) => {
      expect(existsSync(join(layerRoot(layer), 'src', 'index.ts'))).toBe(true);
    });

    it.each([
      ['contracts', 'type:contracts'],
      ['utils', 'type:utils'],
      ['infrastructure', 'type:infrastructure'],
    ])('tags the "%s" library with scope:shared and %s', (layer, typeTag) => {
      const tags: string[] = readLibManifest(layer).nx?.tags ?? [];

      expect(tags).toEqual(expect.arrayContaining(['scope:shared', typeTag]));
    });

    it.each(LAYERS)(
      'applies the configured prefix to the "%s" library name',
      (layer) => {
        expect(readLibManifest(layer).name).toBe(`${PREFIX}/shared-${layer}`);
      },
    );

    it('scaffolds the contracts interface source files', () => {
      const contractsSrc = join(layerRoot('contracts'), 'src');

      expect(
        existsSync(
          join(contractsSrc, 'lib', 'interfaces', 'http-client.interface.ts'),
        ),
      ).toBe(true);
      expect(
        existsSync(
          join(contractsSrc, 'lib', 'interfaces', 'store.interface.ts'),
        ),
      ).toBe(true);
    });
  });

  it('is idempotent — re-running the generator succeeds', () => {
    expect(() => runGenerator()).not.toThrow();

    for (const layer of LAYERS) {
      expect(existsSync(join(layerRoot(layer), 'src', 'index.ts'))).toBe(true);
    }
  });
});
