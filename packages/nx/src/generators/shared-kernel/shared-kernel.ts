import {
  formatFiles,
  generateFiles,
  OverwriteStrategy,
  runTasksInSerial,
  type GeneratorCallback,
  type Tree,
} from '@nx/devkit';
import { libraryGenerator } from '@nx/js';
import { resolve } from 'path';

import type { SharedKernelGeneratorSchema } from './schema';
import { LibraryScope, LibraryType, ModuleFormat } from '../../types';
import { resolveLibraryModuleFormat } from '../../utils/resolve-module-format';
import { libraryExists } from '../../utils/library-exist';
import { info } from '../../utils/logger';

export async function sharedKernelGenerator(
  tree: Tree,
  options: SharedKernelGeneratorSchema,
): Promise<GeneratorCallback> {
  const sharedDirectory = options.directory;
  const contractsRoot = `${sharedDirectory}/contracts`;
  const utilsRoot = `${sharedDirectory}/utils`;
  const infrastructureRoot = `${sharedDirectory}/infrastructure`;

  // Install callbacks returned by the delegated `@nx/js:library` generator.
  // They must be returned to Nx so the packages backing the inferred plugins
  // registered via `addPlugin` — `@nx/eslint`, `@nx/jest` — actually get
  // installed; otherwise nx.json references plugins Nx cannot load on the next
  // command. Every library also passes `addPlugin: true`: the `@nx/js` public
  // wrapper defaults it to `false`, which makes the delegated generators emit
  // deprecated executor targets instead of inferred tasks (Project Crystal).
  const tasks: GeneratorCallback[] = [];

  if (!libraryExists(tree, contractsRoot)) {
    info(`Creating contracts library at ${contractsRoot}...`);

    tasks.push(
      await libraryGenerator(tree, {
        name: options.prefix
          ? `${options.prefix}/shared-contracts`
          : 'shared-contracts',
        directory: contractsRoot,
        addPlugin: true,
        unitTestRunner: 'none',
        bundler: options.bundler,
        linter: options.linter,
        tags: `${LibraryScope.Shared},${LibraryType.Contracts}`,
      }),
    );

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
    info(`Contracts library already exists at ${contractsRoot}`);
  }

  if (!libraryExists(tree, utilsRoot)) {
    info(`Creating utils library at ${utilsRoot}...`);

    tasks.push(
      await libraryGenerator(tree, {
        name: options.prefix
          ? `${options.prefix}/shared-utils`
          : 'shared-utils',
        directory: utilsRoot,
        addPlugin: true,
        unitTestRunner: options.unitTestRunner,
        bundler: options.bundler,
        linter: options.linter,
        tags: `${LibraryScope.Shared},${LibraryType.Utils}`,
      }),
    );

    tree.delete(`${utilsRoot}/src/lib/shared-utils.ts`);
    tree.delete(`${utilsRoot}/src/lib/shared-utils.spec.ts`);
    tree.write(`${utilsRoot}/src/index.ts`, '');
  } else {
    info(`Utils library already exists at ${utilsRoot}`);
  }

  if (!libraryExists(tree, infrastructureRoot)) {
    info(`Creating infrastructure library at ${infrastructureRoot}...`);

    tasks.push(
      await libraryGenerator(tree, {
        name: options.prefix
          ? `${options.prefix}/shared-infrastructure`
          : 'shared-infrastructure',
        directory: infrastructureRoot,
        addPlugin: true,
        unitTestRunner: options.unitTestRunner,
        bundler: options.bundler,
        linter: options.linter,
        tags: `${LibraryScope.Shared},${LibraryType.Infrastructure}`,
      }),
    );

    tree.delete(`${infrastructureRoot}/src/lib/shared-infrastructure.ts`);
    tree.delete(`${infrastructureRoot}/src/lib/shared-infrastructure.spec.ts`);
    tree.write(`${infrastructureRoot}/src/index.ts`, '');
  } else {
    info(`Infrastructure library already exists at ${infrastructureRoot}`);
  }

  await formatFiles(tree);

  return runTasksInSerial(...tasks);
}

export default sharedKernelGenerator;
