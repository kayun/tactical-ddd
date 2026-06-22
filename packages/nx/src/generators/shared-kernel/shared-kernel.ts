import { formatFiles, type Tree } from '@nx/devkit';
import { libraryGenerator } from '@nx/js';

import type { SharedKernelGeneratorSchema } from './schema';
import { LibraryScope, LibraryType } from '../../types';

export async function sharedKernelGenerator(
  tree: Tree,
  options: SharedKernelGeneratorSchema,
) {
  const sharedDirectory = options.directory;
  const contractsRoot = `${sharedDirectory}/contracts`;
  const utilsRoot = `${sharedDirectory}/utils`;
  const infrastructureRoot = `${sharedDirectory}/infrastructure`;

  if (!tree.exists(contractsRoot)) {
    console.log(`Creating contracts library at ${contractsRoot}...`);

    await libraryGenerator(tree, {
      name: options.prefix
        ? `${options.prefix}/shared-contracts`
        : 'shared-contracts',
      directory: contractsRoot,
      useProjectJson: false,
      unitTestRunner: 'none',
      bundler: options.bundler,
      linter: options.linter,
      tags: `${LibraryScope.Shared},${LibraryType.Contracts}`,
    });
  } else {
    console.log(`Contracts library already exists at ${contractsRoot}`);
  }

  if (!tree.exists(utilsRoot)) {
    console.log(`Creating utils library at ${utilsRoot}...`);

    await libraryGenerator(tree, {
      name: options.prefix ? `${options.prefix}/shared-utils` : 'shared-utils',
      directory: utilsRoot,
      useProjectJson: false,
      unitTestRunner: options.unitTestRunner,
      bundler: options.bundler,
      linter: options.linter,
      tags: `${LibraryScope.Shared},${LibraryType.Utils}`,
    });
  } else {
    console.log(`Utils library already exists at ${utilsRoot}`);
  }

  if (!tree.exists(infrastructureRoot)) {
    console.log(`Creating infrastructure library at ${infrastructureRoot}...`);

    await libraryGenerator(tree, {
      name: options.prefix
        ? `${options.prefix}/shared-infrastructure`
        : 'shared-infrastructure',
      directory: infrastructureRoot,
      useProjectJson: false,
      unitTestRunner: options.unitTestRunner,
      bundler: options.bundler,
      linter: options.linter,
      tags: `${LibraryScope.Shared},${LibraryType.Infrastructure}`,
    });
  } else {
    console.log(
      `Infrastructure library already exists at ${infrastructureRoot}`,
    );
  }

  await formatFiles(tree);
}

export default sharedKernelGenerator;
