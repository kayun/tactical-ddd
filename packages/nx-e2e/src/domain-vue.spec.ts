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

// Booting a real Nx workspace, installing the plugin (plus the Vue runtime and
// tooling) and running the generators is slow, so give the suite a generous
// budget.
jest.setTimeout(600_000);

/**
 * End-to-end coverage for the `vue` preset across the `init` and `domain`
 * generators.
 *
 * The preset must generate a domain's ui/features layers with `@nx/vue` instead
 * of `@nx/js`, and wire the matching runtime — `vue` plus the
 * `@tactical-ddd/vue` bindings, and none of the React ones. Unlike the React
 * paths the domain generator does *not* pass `skipPackageJson`, because
 * `@nx/vue` gates its own tooling (`@vitejs/plugin-vue`, `vue-tsc`,
 * `@vue/test-utils`) behind that flag; a successful run here is what proves that
 * tooling lands. `@nx/vue` is loaded lazily via `ensurePackage`, so this also
 * proves the plugin carries no hard dependency on it. The suite runs against
 * both project-linking strategies.
 */
describe.each(WORKSPACE_TYPES)(
  '@tactical-ddd/nx vue preset (e2e) (%s)',
  (workspaceType) => {
    const PREFIX = '@vue-org';
    const DOMAIN = 'cart';

    let projectDirectory: string;
    let ws: WorkspaceReader;

    const readJson = (path: string) =>
      JSON.parse(readFileSync(join(projectDirectory, path), 'utf-8'));

    // Vue libraries are tested with Vitest — `@nx/vue:library` has no jest path —
    // so the whole workspace is bootstrapped with vitest here.
    const runInit = () =>
      execSync(
        `npx nx g @tactical-ddd/nx:init --prefix=${PREFIX} --sharedDirectory=libs/shared --linter=eslint --unitTestRunner=vitest --preset=vue --no-interactive`,
        { cwd: projectDirectory, stdio: 'inherit', env: process.env },
      );

    // A full domain: contracts/core come from `@nx/js`, ui/features from
    // `@nx/vue`. A successful run proves the vue path drives that generator
    // correctly under a real install.
    const runDomain = () =>
      execSync(
        `npx nx g @tactical-ddd/nx:domain ${DOMAIN} --directory=libs/${DOMAIN} --prefix=${PREFIX} --layers=contracts --layers=core --layers=ui --layers=features --linter=eslint --unitTestRunner=vitest --bundler=tsc --preset=vue --no-interactive`,
        { cwd: projectDirectory, stdio: 'inherit', env: process.env },
      );

    const layerFile = (layer: string, ...segments: string[]) =>
      join(projectDirectory, 'libs', DOMAIN, layer, ...segments);

    beforeAll(() => {
      projectDirectory = createTestProject(
        'test-project-domain-vue',
        workspaceType,
      );
      ws = createWorkspaceReader(projectDirectory);

      // Must not throw: init installs @nx/vue + the Vue runtime, then the domain
      // generator scaffolds ui/features through it.
      runInit();
      runDomain();
    });

    afterAll(() => {
      cleanupProject(projectDirectory);
    });

    describe('dependency wiring', () => {
      it('installs @nx/vue as a dev-time generator plugin', () => {
        const devDependencies = readJson('package.json').devDependencies ?? {};

        expect(devDependencies).toHaveProperty('@nx/vue');
      });

      it('adds the vue runtime and the @tactical-ddd/vue bindings', () => {
        const dependencies = readJson('package.json').dependencies ?? {};

        expect(dependencies).toHaveProperty('vue');
        expect(dependencies).toHaveProperty('@tactical-ddd/vue');
      });

      it('never adds the React runtime or bindings', () => {
        const packageJson = readJson('package.json');
        const declared = {
          ...packageJson.devDependencies,
          ...packageJson.dependencies,
        };

        expect(declared).not.toHaveProperty('react');
        expect(declared).not.toHaveProperty('react-dom');
        expect(declared).not.toHaveProperty('@tactical-ddd/react');
      });

      it('installs the Vue tooling the generated libraries build and test with', () => {
        const devDependencies = readJson('package.json').devDependencies ?? {};

        // These come from `@nx/vue`'s own `ensureDependencies`, which it skips
        // when `skipPackageJson` is set — so their presence is what proves the
        // domain generator does not pass that flag on the vue path.
        expect(devDependencies).toHaveProperty('@vitejs/plugin-vue');
        expect(devDependencies).toHaveProperty('vue-tsc');
      });
    });

    describe('generator defaults', () => {
      it('registers @nx/vue:library defaults with vitest as the runner', () => {
        const generators = readJson('nx.json').generators ?? {};
        const vueLibraryDefaults = generators['@nx/vue:library'] ?? {};

        expect(vueLibraryDefaults).toMatchObject({
          linter: 'eslint',
          unitTestRunner: 'vitest',
        });
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
