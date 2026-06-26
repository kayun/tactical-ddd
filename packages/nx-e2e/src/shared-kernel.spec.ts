import { execSync } from 'child_process';
import { existsSync, readFileSync, readdirSync, rmSync } from 'fs';
import { join } from 'path';

import { createTestProject } from './test-utils';

// Booting a real Nx workspace, installing the plugin and running the generator
// is slow, so give the whole suite a generous time budget.
jest.setTimeout(600_000);

describe('@tactical-ddd/nx shared-kernel generator (e2e)', () => {
  const PREFIX = '@e2e-org';
  const SHARED_DIR = 'libs/shared';
  const LAYERS = ['contracts', 'utils', 'infrastructure'] as const;

  let projectDirectory: string;

  // `prefix` is a required option, so it is always passed. It only affects the
  // generated package names (e.g. `@e2e-org/shared-contracts`); the libraries
  // still live under `libs/shared/<layer>`, which is what the assertions read.
  const runGenerator = () =>
    execSync(
      `npx nx g @tactical-ddd/nx:shared-kernel --directory=libs/shared --prefix=${PREFIX} --linter=eslint --unitTestRunner=jest --no-interactive`,
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

  describe('generated source files', () => {
    const contractsSrc = (...segments: string[]) =>
      join(layerRoot('contracts'), 'src', ...segments);

    it('removes the default placeholder lib file from contracts', () => {
      expect(existsSync(contractsSrc('lib', 'shared-contracts.ts'))).toBe(
        false,
      );
    });

    it('scaffolds the contracts interface source files', () => {
      expect(
        existsSync(
          contractsSrc('lib', 'interfaces', 'http-client.interface.ts'),
        ),
      ).toBe(true);
      expect(
        existsSync(contractsSrc('lib', 'interfaces', 'store.interface.ts')),
      ).toBe(true);
    });

    it('barrel-exports both interfaces from the contracts index', () => {
      const index = readFileSync(contractsSrc('index.ts'), 'utf-8');

      expect(index).toContain('http-client.interface');
      expect(index).toContain('store.interface');
    });

    it('uses module-format-aware import extensions in the contracts index', () => {
      // The generator keys the `.js` extension off the library's resolved
      // module format, whose most direct signal is package.json `"type"`. The
      // barrel must agree with whatever create-nx-workspace emitted, so derive
      // the expectation from the manifest rather than hard-coding ESM or CJS.
      const isEsm = readLibManifest('contracts').type === 'module';
      const index = readFileSync(contractsSrc('index.ts'), 'utf-8');

      if (isEsm) {
        expect(index).toContain("'./lib/interfaces/http-client.interface.js'");
        expect(index).toContain("'./lib/interfaces/store.interface.js'");
      } else {
        expect(index).toContain("'./lib/interfaces/http-client.interface'");
        expect(index).not.toContain('.interface.js');
      }
    });

    it.each([
      ['utils', 'shared-utils'],
      ['infrastructure', 'shared-infrastructure'],
    ])(
      'leaves an empty barrel and no placeholder in the "%s" library',
      (layer, placeholder) => {
        const libDir = join(layerRoot(layer), 'src', 'lib');

        expect(existsSync(join(libDir, `${placeholder}.ts`))).toBe(false);
        expect(existsSync(join(libDir, `${placeholder}.spec.ts`))).toBe(false);
        expect(
          readFileSync(
            join(layerRoot(layer), 'src', 'index.ts'),
            'utf-8',
          ).trim(),
        ).toBe('');
      },
    );
  });

  it('is idempotent — re-running the generator succeeds', () => {
    expect(() => runGenerator()).not.toThrow();

    for (const layer of LAYERS) {
      expect(existsSync(join(layerRoot(layer), 'src', 'index.ts'))).toBe(true);
    }
  });
});
