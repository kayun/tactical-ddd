import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { join } from 'path';

import { cleanupProject, createTestProject } from './test-utils';

// Booting a real Nx workspace, installing the plugin and running the generator
// is slow, so give the whole suite a generous time budget.
jest.setTimeout(600_000);

/**
 * Regression guard for the React-runtime handling in the `init` generator.
 *
 * A real React workspace already ships its own `react`/`react-dom`, often with
 * an exactly pinned `react`. Declaring our own range on top of that adds nothing
 * but forces the package manager to re-resolve — which previously surfaced a
 * latent peer conflict (an exact `react` a newer `react-dom` patch no longer
 * satisfies) and aborted `npm install`, failing the whole generator.
 *
 * So `init` must leave the React runtime entirely alone when the workspace
 * already manages it. This suite pre-installs `react`/`react-dom` at exact
 * versions and asserts the generator completes and never touches them.
 */
describe('@tactical-ddd/nx init generator — existing React runtime (e2e)', () => {
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
    projectDirectory = createTestProject('test-project-init-existing-react');

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
});
