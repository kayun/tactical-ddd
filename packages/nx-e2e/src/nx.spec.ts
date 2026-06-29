import { execSync } from 'child_process';

import {
  cleanupProject,
  createTestProject,
  WORKSPACE_TYPES,
} from './test-utils';

// Scaffolding a workspace and installing the plugin is slow.
jest.setTimeout(600_000);

// Run against both linking strategies (TS solution + tsconfig paths) so the
// plugin install is verified in each kind of workspace it may land in.
describe.each(WORKSPACE_TYPES)('@tactical-ddd/nx (%s)', (workspaceType) => {
  let projectDirectory: string;

  beforeAll(() => {
    // createTestProject builds the workspace and installs @tactical-ddd/nx@e2e
    // from the local registry started in the jest globalSetup.
    projectDirectory = createTestProject('test-project', workspaceType);
  });

  afterAll(() => {
    cleanupProject(projectDirectory);
  });

  it('should be installed', () => {
    // npm ls will fail if the package is not installed properly
    execSync('npm ls @tactical-ddd/nx', {
      cwd: projectDirectory,
      stdio: 'inherit',
    });
  });
});
