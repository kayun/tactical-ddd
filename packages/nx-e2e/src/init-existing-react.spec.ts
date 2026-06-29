import { execSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

import {
  cleanupProject,
  createTestProject,
  WORKSPACE_TYPES,
} from './test-utils';

// Booting a real Nx workspace, installing the plugin and running the generator
// is slow, so give the whole suite a generous time budget.
jest.setTimeout(600_000);

/**
 * Regression guard for the React-runtime handling in the `init` *and* `domain`
 * generators.
 *
 * A real React workspace already ships its own `react`/`react-dom`, often with
 * an exactly pinned `react`. Declaring our own range on top of that adds nothing
 * but forces the package manager to re-resolve — which previously surfaced a
 * latent peer conflict (an exact `react` a newer `react-dom` patch no longer
 * satisfies) and aborted `npm install`, failing the whole generator. `init`
 * declared the runtime directly; the `domain` generator hit the same through
 * `@nx/react`, which adds a floating `react-dom` when scaffolding a `features`
 * layer.
 *
 * So neither generator may touch the React runtime when the workspace already
 * manages it. This suite pre-installs `react`/`react-dom` at exact versions,
 * runs `init` and then a react-preset `domain`, and asserts both complete and
 * never re-resolve or overwrite them.
 */
describe.each(WORKSPACE_TYPES)(
  '@tactical-ddd/nx init + domain generators — existing React runtime (e2e) (%s)',
  (workspaceType) => {
    const PREFIX = '@e2e-org';
    const SHARED_DIR = 'libs/shared';

    // Pinned exactly, mirroring how an app locks its framework version. The two
    // halves are kept compatible so the *baseline* install succeeds; the point of
    // the test is that init does not re-resolve or overwrite them afterwards.
    const REACT_PINNED = '19.0.0';

    let projectDirectory: string;

    const readJson = (path: string) =>
      JSON.parse(readFileSync(join(projectDirectory, path), 'utf-8'));

    const runGenerator = () =>
      execSync(
        `npx nx g @tactical-ddd/nx:init --prefix=${PREFIX} --sharedDirectory=${SHARED_DIR} --linter=eslint --unitTestRunner=jest --preset=react --no-interactive`,
        { cwd: projectDirectory, stdio: 'inherit', env: process.env },
      );

    beforeAll(() => {
      projectDirectory = createTestProject(
        'test-project-init-existing-react',
        workspaceType,
      );

      // Seed the workspace with a pre-existing, exactly pinned React runtime
      // before running the generator.
      execSync(
        `npm install --save-exact --legacy-peer-deps react@${REACT_PINNED} react-dom@${REACT_PINNED}`,
        { cwd: projectDirectory, stdio: 'inherit', env: process.env },
      );

      // Must not throw: with the runtime already present, init has nothing to
      // re-resolve and the install completes cleanly.
      runGenerator();
    });

    afterAll(() => {
      cleanupProject(projectDirectory);
    });

    it('leaves the pre-existing react/react-dom versions untouched', () => {
      const dependencies = readJson('package.json').dependencies ?? {};

      expect(dependencies['react']).toBe(REACT_PINNED);
      expect(dependencies['react-dom']).toBe(REACT_PINNED);
    });

    it('does not relocate the runtime into devDependencies or duplicate it', () => {
      const devDependencies = readJson('package.json').devDependencies ?? {};

      expect(devDependencies).not.toHaveProperty('react');
      expect(devDependencies).not.toHaveProperty('react-dom');
    });

    it('still installs the @tactical-ddd/react bindings', () => {
      // Deferring to the workspace's React must not skip our own bindings.
      const dependencies = readJson('package.json').dependencies ?? {};

      expect(dependencies).toHaveProperty('@tactical-ddd/react');
    });

    it('still wires up the dev-time generator plugins', () => {
      const devDependencies = readJson('package.json').devDependencies ?? {};

      for (const pkg of ['@nx/js', '@nx/react', '@nx/eslint', '@nx/jest']) {
        expect(devDependencies).toHaveProperty(pkg);
      }
    });

    // The `init`-prepared workspace already manages React, so generating a
    // react-preset domain with a `features` layer must not bolt on a skewed
    // `react-dom` via `@nx/react`. This describe builds on the same workspace.
    describe('after a react-preset domain generator runs', () => {
      const DOMAIN = 'billing';

      const runDomain = () =>
        execSync(
          `npx nx g @tactical-ddd/nx:domain ${DOMAIN} --directory=libs/${DOMAIN} --prefix=${PREFIX} --layers=contracts --layers=core --layers=features --linter=eslint --unitTestRunner=jest --bundler=tsc --preset=react --no-interactive`,
          { cwd: projectDirectory, stdio: 'inherit', env: process.env },
        );

      beforeAll(() => {
        // Must not throw: with the workspace already managing React, the domain
        // generator defers to it instead of letting `@nx/react` add a floating
        // `react-dom` the pinned `react` no longer satisfies (an ERESOLVE).
        runDomain();
      });

      it('scaffolds the domain features library', () => {
        expect(
          existsSync(
            join(
              projectDirectory,
              'libs',
              DOMAIN,
              'features',
              'src',
              'index.ts',
            ),
          ),
        ).toBe(true);
      });

      it('leaves the pinned react/react-dom untouched (adds no skewed react-dom)', () => {
        const dependencies = readJson('package.json').dependencies ?? {};

        expect(dependencies['react']).toBe(REACT_PINNED);
        expect(dependencies['react-dom']).toBe(REACT_PINNED);
      });

      it('does not duplicate the React runtime into devDependencies', () => {
        const devDependencies = readJson('package.json').devDependencies ?? {};

        expect(devDependencies).not.toHaveProperty('react');
        expect(devDependencies).not.toHaveProperty('react-dom');
      });
    });
  },
);
