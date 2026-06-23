import {
  formatFiles,
  generateFiles,
  OverwriteStrategy,
  type Tree,
} from '@nx/devkit';
import { libraryGenerator } from '@nx/js';
import { resolve } from 'path';

import type { SharedKernelGeneratorSchema } from './schema';
import { LibraryScope, LibraryType, ModuleFormat } from '../../types';
import { resolveLibraryModuleFormat } from '../../utils/resolve-module-format';

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
      minimal: true,
    });

    const type = resolveLibraryModuleFormat(tree, contractsRoot);

    tree.delete(`${contractsRoot}/src/lib/shared-contracts.ts`);
    generateFiles(
      tree,
      resolve(__dirname, 'files/contracts'),
      contractsRoot,
      { esm: type === ModuleFormat.EsModule },
      { overwriteStrategy: OverwriteStrategy.Overwrite },
    );
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
      minimal: true,
    });

    tree.delete(`${utilsRoot}/src/lib/shared-utils.ts`);
    tree.delete(`${utilsRoot}/src/lib/shared-utils.spec.ts`);
    tree.write(`${utilsRoot}/src/index.ts`, '');
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
      minimal: true,
    });

    tree.delete(`${infrastructureRoot}/src/lib/shared-infrastructure.ts`);
    tree.delete(`${infrastructureRoot}/src/lib/shared-infrastructure.spec.ts`);
    tree.write(`${infrastructureRoot}/src/index.ts`, '');
  } else {
    console.log(
      `Infrastructure library already exists at ${infrastructureRoot}`,
    );
  }

  await formatFiles(tree);
}

export default sharedKernelGenerator;
