import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';

import {
  cleanupProject,
  createTestProject,
  createWorkspaceReader,
  type WorkspaceReader,
} from './test-utils';

// Booting a real Nx workspace, installing the plugin and running the generator
// is slow, so give the whole suite a generous time budget.
jest.setTimeout(600_000);

describe('@tactical-ddd/nx init generator (e2e)', () => {
  const PREFIX = '@e2e-org';
  const SHARED_DIR = 'libs/shared';
  const LAYERS = ['contracts', 'utils', 'infrastructure'] as const;

  let projectDirectory: string;
  let ws: WorkspaceReader;

  const runGenerator = () =>
    execSync(
      `npx nx g @tactical-ddd/nx:init --prefix=${PREFIX} --sharedDirectory=${SHARED_DIR} --linter=eslint --unitTestRunner=jest --preset=react --no-interactive`,
      { cwd: projectDirectory, stdio: 'inherit', env: process.env },
    );

  // Workspace-relative dir of a shared layer (for the manifest/tag readers);
  // `layerRoot` is its absolute form, for reading source files on disk.
  const layerDir = (layer: string) => join(SHARED_DIR, layer);
  const layerRoot = (layer: string) =>
    join(projectDirectory, SHARED_DIR, layer);

  beforeAll(() => {
    projectDirectory = createTestProject('test-project-init');
    ws = createWorkspaceReader(projectDirectory);
    runGenerator();
  });

  afterAll(() => {
    cleanupProject(projectDirectory);
  });

  describe('generator defaults', () => {
    it('records the shared-kernel defaults in nx.json', () => {
      const sharedKernelDefaults =
        ws.readJson('nx.json').generators?.['@tactical-ddd/nx']?.[
          'shared-kernel'
        ];

      expect(sharedKernelDefaults).toMatchObject({
        prefix: PREFIX,
        linter: 'eslint',
        unitTestRunner: 'jest',
      });
    });

    it('records build/lint/test defaults for the built-in library generators', () => {
      const generators = ws.readJson('nx.json').generators;

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
      const devDependencies = ws.readJson('package.json').devDependencies ?? {};

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
      const dependencies = ws.readJson('package.json').dependencies ?? {};

      for (const pkg of ['react', 'react-dom', '@tactical-ddd/react']) {
        expect(dependencies).toHaveProperty(pkg);
      }
    });
  });

  describe('inferred tasks (Project Crystal)', () => {
    it('registers the inferred ESLint and Jest plugins in nx.json', () => {
      const plugins = (ws.readJson('nx.json').plugins ?? []).map(
        (plugin: string | { plugin: string }) =>
          typeof plugin === 'string' ? plugin : plugin.plugin,
      );

      expect(plugins).toEqual(
        expect.arrayContaining(['@nx/eslint/plugin', '@nx/jest/plugin']),
      );
    });

    it('emits no deprecated executor targets on the generated libraries', () => {
      // Tasks are inferred from config files by the plugins above, so the
      // libraries carry no explicit `lint`/`test`/`build` executor targets.
      for (const layer of LAYERS) {
        const { targets } = ws.readProjectConfig(layerDir(layer));
        expect(Object.keys(targets)).toEqual([]);
      }
    });
  });

  describe('module boundaries', () => {
    it('wires the architecture dep-constraints into the root ESLint config', () => {
      const config = ws.readEslintConfig();

      expect(config).toContain('scope:shared');
      expect(config).toContain('scope:domain');
      expect(config).toContain('type:contracts');
      expect(config).toContain('onlyDependOnLibsWithTags');
    });

    it('protects against cross-domain imports via the dynamic domain:* tag', () => {
      expect(ws.readEslintConfig()).toContain('domain:*');
    });

    it('replaces the empty default depConstraints', () => {
      expect(ws.readEslintConfig()).not.toMatch(/depConstraints:\s*\[\s*\]/);
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
      const tags = ws.readTags(layerDir(layer));

      expect(tags).toEqual(expect.arrayContaining(['scope:shared', typeTag]));
    });

    it.each(LAYERS)(
      'applies the configured prefix to the "%s" library name',
      (layer) => {
        expect(ws.readProjectConfig(layerDir(layer)).name).toBe(
          `${PREFIX}/shared-${layer}`,
        );
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
