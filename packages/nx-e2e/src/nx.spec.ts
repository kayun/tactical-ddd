import { execSync } from 'child_process';
import { rmSync } from 'fs';

import { createTestProject } from './test-utils';

// Scaffolding a workspace and installing the plugin is slow.
jest.setTimeout(600_000);

describe('@tactical-ddd/nx', () => {
  let projectDirectory: string;

  beforeAll(() => {
    // createTestProject builds the workspace and installs @tactical-ddd/nx@e2e
    // from the local registry started in the jest globalSetup.
    projectDirectory = createTestProject('test-project');
  });

  afterAll(() => {
    if (projectDirectory) {
      // Cleanup the test project
      rmSync(projectDirectory, {
        recursive: true,
        force: true,
      });
    }
  });

  it('should be installed', () => {
    // npm ls will fail if the package is not installed properly
    execSync('npm ls @tactical-ddd/nx', {
      cwd: projectDirectory,
      stdio: 'inherit',
    });
  });
});
