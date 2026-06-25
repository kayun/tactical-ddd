import { addProjectConfiguration, formatFiles, type Tree } from '@nx/devkit';
import type { DomainGeneratorSchema } from './schema';

export async function domainGenerator(
  tree: Tree,
  options: DomainGeneratorSchema,
) {
  const projectRoot = `libs/${options.name}`;
  addProjectConfiguration(tree, options.name, {
    root: projectRoot,
    projectType: 'library',
    sourceRoot: `${projectRoot}/src`,
    targets: {},
  });
  await formatFiles(tree);
}

export default domainGenerator;
