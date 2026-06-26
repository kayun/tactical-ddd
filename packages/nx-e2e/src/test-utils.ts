import { execSync } from 'child_process';
import { join, dirname } from 'path';
import { mkdirSync, rmSync } from 'fs';
import { tmpdir } from 'os';

/**
 * Major Nx version the e2e workspaces are created and pinned to, taken from the
 * `E2E_NX_VERSION` env var (defaults to `23`). The suite is run once per
 * supported major (see the `generators:e2e:*` scripts) so the generators are
 * verified against every Nx version the plugin claims to support.
 */
export const E2E_NX_VERSION = process.env.E2E_NX_VERSION ?? '23';

// `@nx/*` packages pinned to {@link E2E_NX_VERSION}. Installing the plugin pulls
// the newest version satisfying its `^22 || ^23` range (i.e. 23) and its peers
// can drag the whole workspace up with it, so we pin these back to the target
// major to keep the workspace faithfully on the version under test.
const PINNED_NX_PACKAGES = [
  'nx',
  '@nx/devkit',
  '@nx/js',
  '@nx/eslint',
  '@nx/eslint-plugin',
  '@nx/jest',
];

/**
 * Creates an isolated Nx workspace under `tmp/<projectName>-nx<major>` and
 * installs the locally-published `@tactical-ddd/nx` plugin into it.
 *
 * The plugin is served from the verdaccio registry started in the jest
 * `globalSetup` (`tools/scripts/start-local-registry.ts`) and published under
 * the `@e2e` dist-tag, so the install resolves the latest built source. The
 * workspace is created with — and pinned to — the {@link E2E_NX_VERSION} major.
 *
 * @param projectName Unique workspace name — also the temp sub-directory.
 *   Use a distinct name per spec file so suites running in band don't collide.
 * @returns Absolute path to the created workspace.
 */
export function createTestProject(projectName: string): string {
  // Suffix the workspace with the Nx major so the two version runs never share
  // a directory (and the version under test is obvious when debugging).
  const workspaceName = `${projectName}-nx${E2E_NX_VERSION}`;

  // Scaffold outside the repository's working tree: the repo `.gitignore`
  // ignores `tmp/`, and `create-nx-workspace`'s `git add` aborts on ignored
  // paths when it runs inside the parent git repo. The OS temp dir is neutral.
  const projectDirectory = join(tmpdir(), 'tactical-ddd-e2e', workspaceName);

  // Ensure the target directory is empty before scaffolding.
  rmSync(projectDirectory, { recursive: true, force: true });
  mkdirSync(dirname(projectDirectory), { recursive: true });

  execSync(
    `npx create-nx-workspace@${E2E_NX_VERSION} ${workspaceName} --preset apps --nxCloud=skip --no-interactive`,
    {
      cwd: dirname(projectDirectory),
      stdio: 'inherit',
      env: process.env,
    },
  );
  console.log(
    `Created test project in "${projectDirectory}" (Nx ${E2E_NX_VERSION})`,
  );

  // Install the plugin built from the latest source into the test repo.
  execSync(`npm install -D @tactical-ddd/nx@e2e`, {
    cwd: projectDirectory,
    stdio: 'inherit',
    env: process.env,
  });

  // Pin the Nx packages back to the major under test — the plugin install above
  // may otherwise have upgraded them past it.
  const pinned = PINNED_NX_PACKAGES.map(
    (pkg) => `${pkg}@${E2E_NX_VERSION}`,
  ).join(' ');
  execSync(`npm install -D --save-exact --legacy-peer-deps ${pinned}`, {
    cwd: projectDirectory,
    stdio: 'inherit',
    env: process.env,
  });

  return projectDirectory;
}
