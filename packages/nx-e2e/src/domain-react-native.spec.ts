import { execSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

import {
  cleanupProject,
  createTestProject,
  createWorkspaceReader,
  WORKSPACE_TYPES,
  type WorkspaceReader,
} from './test-utils';

// Booting a real Nx workspace, installing the plugin (plus the React Native
// runtime) and running the generators is slow, so give the suite a generous
// budget.
jest.setTimeout(600_000);

/**
 * End-to-end coverage for the `react-native` preset across the `init` and
 * `domain` generators.
 *
 * The preset must generate a domain's ui/features layers with
 * `@nx/react-native` (native views) instead of `@nx/react` (web), and wire the
 * matching runtime — `react` + `react-native`, but crucially *no* `react-dom`
 * (React Native does not render to the DOM) and none of the `@tactical-ddd/react`
 * web bindings. Both generators load `@nx/react-native` lazily via
 * `ensurePackage`, so a successful run here also proves the plugin carries no
 * hard dependency on it. The suite runs against both project-linking strategies.
 */
describe.each(WORKSPACE_TYPES)(
  '@tactical-ddd/nx react-native preset (e2e) (%s)',
  (workspaceType) => {
    const PREFIX = '@rn-org';
    const DOMAIN = 'chat';

    let projectDirectory: string;
    let ws: WorkspaceReader;

    const readJson = (path: string) =>
      JSON.parse(readFileSync(join(projectDirectory, path), 'utf-8'));

    const runInit = () =>
      execSync(
        `npx nx g @tactical-ddd/nx:init --prefix=${PREFIX} --sharedDirectory=libs/shared --linter=eslint --unitTestRunner=jest --preset=react-native --no-interactive`,
        { cwd: projectDirectory, stdio: 'inherit', env: process.env },
      );

    // A full domain: contracts/core come from `@nx/js`, ui/features from
    // `@nx/react-native`. A successful run proves the react-native path drives
    // that generator correctly under a real install.
    const runDomain = () =>
      execSync(
        `npx nx g @tactical-ddd/nx:domain ${DOMAIN} --directory=libs/${DOMAIN} --prefix=${PREFIX} --layers=contracts --layers=core --layers=ui --layers=features --linter=eslint --unitTestRunner=jest --bundler=tsc --preset=react-native --no-interactive`,
        { cwd: projectDirectory, stdio: 'inherit', env: process.env },
      );

    const layerFile = (layer: string, ...segments: string[]) =>
      join(projectDirectory, 'libs', DOMAIN, layer, ...segments);

    beforeAll(() => {
      projectDirectory = createTestProject(
        'test-project-domain-rn',
        workspaceType,
      );
      ws = createWorkspaceReader(projectDirectory);

      // Must not throw: init installs @nx/react-native + the RN runtime, then the
      // domain generator scaffolds ui/features through it.
      runInit();
      runDomain();
    });

    afterAll(() => {
      cleanupProject(projectDirectory);
    });

    describe('dependency wiring', () => {
      it('installs @nx/react-native as a dev-time generator plugin', () => {
        const devDependencies = readJson('package.json').devDependencies ?? {};

        expect(devDependencies).toHaveProperty('@nx/react-native');
      });

      it('adds the react and react-native runtime as production dependencies', () => {
        const dependencies = readJson('package.json').dependencies ?? {};

        expect(dependencies).toHaveProperty('react');
        expect(dependencies).toHaveProperty('react-native');
      });

      it('never adds react-dom — React Native renders to native views', () => {
        const dependencies = readJson('package.json').dependencies ?? {};

        expect(dependencies).not.toHaveProperty('react-dom');
      });

      it('still installs the @tactical-ddd/react bindings', () => {
        const dependencies = readJson('package.json').dependencies ?? {};

        expect(dependencies).toHaveProperty('@tactical-ddd/react');
      });

      it('does not duplicate the runtime into devDependencies', () => {
        const devDependencies = readJson('package.json').devDependencies ?? {};

        expect(devDependencies).not.toHaveProperty('react');
        expect(devDependencies).not.toHaveProperty('react-native');
      });
    });

    describe('generator defaults', () => {
      it('registers @nx/react-native:library defaults without a bundler', () => {
        const generators = readJson('nx.json').generators ?? {};
        const rnLibraryDefaults = generators['@nx/react-native:library'] ?? {};

        expect(rnLibraryDefaults).toMatchObject({
          linter: 'eslint',
          unitTestRunner: 'jest',
        });
        // Metro is the fixed bundler — no `bundler` default is advertised.
        expect(rnLibraryDefaults).not.toHaveProperty('bundler');
      });
    });

    describe('layer scaffolding', () => {
      it('scaffolds the ui and features libraries', () => {
        expect(existsSync(layerFile('ui', 'src', 'index.ts'))).toBe(true);
        expect(existsSync(layerFile('features', 'src', 'index.ts'))).toBe(true);
      });

      it('scaffolds the framework-agnostic contracts and core libraries too', () => {
        expect(existsSync(layerFile('contracts', 'src', 'index.ts'))).toBe(
          true,
        );
        expect(existsSync(layerFile('core', 'src', 'index.ts'))).toBe(true);
      });

      it('tags the ui library with scope:domain, the domain tag and type:ui', () => {
        expect(ws.readTags(`libs/${DOMAIN}/ui`)).toEqual(
          expect.arrayContaining([
            'scope:domain',
            `domain:${DOMAIN}`,
            'type:ui',
          ]),
        );
      });

      it('tags the features library type:features, never type:ui', () => {
        const tags = ws.readTags(`libs/${DOMAIN}/features`);

        expect(tags).toEqual(
          expect.arrayContaining([
            'scope:domain',
            `domain:${DOMAIN}`,
            'type:features',
          ]),
        );
        expect(tags).not.toContain('type:ui');
      });
    });
  },
);
