import { execSync } from 'child_process';
import { join, dirname } from 'path';
import { mkdirSync, rmSync } from 'fs';
import { tmpdir } from 'os';

/**
 * Creates an isolated Nx workspace under `tmp/<projectName>` and installs the
 * locally-published `@tactical-ddd/nx` plugin into it.
 *
 * The plugin is served from the verdaccio registry started in the jest
 * `globalSetup` (`tools/scripts/start-local-registry.ts`) and published under
 * the `@e2e` dist-tag, so the install resolves the latest built source.
 *
 * @param projectName Unique workspace name — also the temp sub-directory.
 *   Use a distinct name per spec file so suites running in band don't collide.
 * @returns Absolute path to the created workspace.
 */
export function createTestProject(projectName: string): string {
  // Scaffold outside the repository's working tree: the repo `.gitignore`
  // ignores `tmp/`, and `create-nx-workspace`'s `git add` aborts on ignored
  // paths when it runs inside the parent git repo. The OS temp dir is neutral.
  const projectDirectory = join(tmpdir(), 'tactical-ddd-e2e', projectName);

  // Ensure the target directory is empty before scaffolding.
  rmSync(projectDirectory, { recursive: true, force: true });
  mkdirSync(dirname(projectDirectory), { recursive: true });

  execSync(
    `npx create-nx-workspace@latest ${projectName} --preset apps --nxCloud=skip --no-interactive`,
    {
      cwd: dirname(projectDirectory),
      stdio: 'inherit',
      env: process.env,
    },
  );
  console.log(`Created test project in "${projectDirectory}"`);

  // Install the plugin built from the latest source into the test repo.
  execSync(`npm install -D @tactical-ddd/nx@e2e`, {
    cwd: projectDirectory,
    stdio: 'inherit',
    env: process.env,
  });

  return projectDirectory;
}
