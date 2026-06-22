import { execSync } from 'child_process';
import { existsSync, readFileSync, readdirSync, rmSync } from 'fs';
import { join } from 'path';

import { createTestProject } from './test-utils';

// Booting a real Nx workspace, installing the plugin and running the generator
// is slow, so give the whole suite a generous time budget.
jest.setTimeout(600_000);

describe('@tactical-ddd/nx shared-kernel generator (e2e)', () => {
  const SHARED_DIR = 'libs/shared';
  const LAYERS = ['contracts', 'utils', 'infrastructure'] as const;

  let projectDirectory: string;

  const runGenerator = () =>
    execSync(
      'npx nx g @tactical-ddd/nx:shared-kernel --directory=libs/shared --no-interactive',
      { cwd: projectDirectory, stdio: 'inherit', env: process.env },
    );

  const layerRoot = (layer: string) =>
    join(projectDirectory, SHARED_DIR, layer);

  // Assertions read the generated files directly rather than going through
  // `nx show project`: right after generation the Nx daemon may still serve a
  // graph computed before the libraries existed, so the project list races and
  // can come back empty. The generated package.json is the source of truth.
  const readLibManifest = (layer: string) =>
    JSON.parse(readFileSync(join(layerRoot(layer), 'package.json'), 'utf-8'));

  beforeAll(() => {
    projectDirectory = createTestProject('test-project-shared-kernel');
    runGenerator();
  });

  afterAll(() => {
    if (projectDirectory) {
      rmSync(projectDirectory, { recursive: true, force: true });
    }
  });

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

  it('does not register a domain scope on any shared library', () => {
    for (const layer of LAYERS) {
      const tags: string[] = readLibManifest(layer).nx?.tags ?? [];
      expect(tags).not.toContain('scope:domain');
    }
  });

  it('generates the contracts library without a unit test setup', () => {
    // `unitTestRunner: 'none'` means no test runner config is emitted —
    // regardless of the extension the workspace would otherwise use
    // (jest.config.ts/.cts/.js, vite.config.*, tsconfig.spec.json).
    const entries = readdirSync(layerRoot('contracts'));
    const testConfig = entries.filter(
      (file) =>
        /^(jest|vite)\.config\.[mc]?[jt]s$/.test(file) ||
        file === 'tsconfig.spec.json',
    );

    expect(testConfig).toEqual([]);
  });

  it('is idempotent — re-running the generator succeeds', () => {
    expect(() => runGenerator()).not.toThrow();

    for (const layer of LAYERS) {
      expect(existsSync(join(layerRoot(layer), 'src', 'index.ts'))).toBe(true);
    }
  });
});
