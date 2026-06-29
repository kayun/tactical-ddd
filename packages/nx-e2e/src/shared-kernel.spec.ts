import { execSync } from 'child_process';
import { existsSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';

import {
  cleanupProject,
  createTestProject,
  createWorkspaceReader,
  WORKSPACE_TYPES,
  type WorkspaceReader,
} from './test-utils';

// Booting a real Nx workspace, installing the plugin and running the generator
// is slow, so give the whole suite a generous time budget.
jest.setTimeout(600_000);

// The generator must behave identically whether the workspace links projects
// through package-manager workspaces (TS solution) or tsconfig paths, so run
// the whole suite against both.
describe.each(WORKSPACE_TYPES)(
  '@tactical-ddd/nx shared-kernel generator (e2e) (%s)',
  (workspaceType) => {
    const PREFIX = '@e2e-org';
    const SHARED_DIR = 'libs/shared';
    const LAYERS = ['contracts', 'utils', 'infrastructure'] as const;

    let projectDirectory: string;
    let ws: WorkspaceReader;

    // `prefix` is a required option, so it is always passed. It only affects the
    // generated package names (e.g. `@e2e-org/shared-contracts`); the libraries
    // still live under `libs/shared/<layer>`, which is what the assertions read.
    const runGenerator = () =>
      execSync(
        `npx nx g @tactical-ddd/nx:shared-kernel --directory=libs/shared --prefix=${PREFIX} --linter=eslint --unitTestRunner=jest --no-interactive`,
        { cwd: projectDirectory, stdio: 'inherit', env: process.env },
      );

    // Workspace-relative dir of a shared layer (for the manifest/tag readers);
    // `layerRoot` is its absolute form, for reading source files on disk.
    const layerDir = (layer: string) => join(SHARED_DIR, layer);
    const layerRoot = (layer: string) =>
      join(projectDirectory, SHARED_DIR, layer);

    beforeAll(() => {
      projectDirectory = createTestProject(
        'test-project-shared-kernel',
        workspaceType,
      );
      ws = createWorkspaceReader(projectDirectory);
      runGenerator();
    });

    afterAll(() => {
      cleanupProject(projectDirectory);
    });

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

    it('does not register a domain scope on any shared library', () => {
      for (const layer of LAYERS) {
        const tags = ws.readTags(layerDir(layer));
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
        // module format. The barrel must agree with whatever create-nx-workspace
        // emitted, so derive the expectation the same way the generator does
        // (package.json `"type"`, else the tsconfig `module` option) rather than
        // hard-coding ESM or CJS — the two workspace shapes differ here.
        const isEsm = ws.moduleFormat(layerDir('contracts')) === 'esm';
        const index = readFileSync(contractsSrc('index.ts'), 'utf-8');

        if (isEsm) {
          expect(index).toContain(
            "'./lib/interfaces/http-client.interface.js'",
          );
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
          expect(existsSync(join(libDir, `${placeholder}.spec.ts`))).toBe(
            false,
          );
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
        expect(existsSync(join(layerRoot(layer), 'src', 'index.ts'))).toBe(
          true,
        );
      }
    });
  },
);
