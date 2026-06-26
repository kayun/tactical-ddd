import {
  ensurePackage,
  formatFiles,
  generateFiles,
  NX_VERSION,
  runTasksInSerial,
  type GeneratorCallback,
  type Tree,
  updateJson,
} from '@nx/devkit';
import { libraryGenerator as jsLibraryGenerator } from '@nx/js';
import { resolve } from 'path';

import type { DomainGeneratorSchema } from './schema';
import { libraryExists } from '../../utils/library-exist';
import {
  applyCleanArchitectureBoundaries,
  applyDepConstraints,
} from '../../utils/eslint-module-boundaries';
import { warning } from '../../utils/logger';
import { LibraryScope, LibraryType } from '../../types';

/** Conventional location of the shared kernel's contracts library. */
const SHARED_CONTRACTS_ROOT = 'libs/shared/contracts';

export async function domainGenerator(
  tree: Tree,
  options: DomainGeneratorSchema,
): Promise<GeneratorCallback> {
  // Implicit existence check (CLAUDE.md 7.3.1): domain libraries depend on the
  // shared kernel, so warn if it has not been generated yet rather than
  // producing libraries whose boundary constraints reference tags nothing
  // carries.
  if (!libraryExists(tree, SHARED_CONTRACTS_ROOT)) {
    warning(
      `Shared kernel not found at ${SHARED_CONTRACTS_ROOT}. Run \`nx g @tactical-ddd/nx:init\` (or the \`shared-kernel\` generator) first so domain libraries can depend on the shared contracts.`,
    );
  }

  const contractsRoot = `${options.directory}/contracts`;
  const coreRoot = `${options.directory}/core`;
  const uiRoot = `${options.directory}/ui`;
  const featuresRoot = `${options.directory}/features`;
  const domainTag = `domain:${options.name}`;

  // Install callbacks from the delegated library generators — returned to Nx so
  // the packages backing the inferred plugins (`@nx/eslint`, `@nx/jest`) the
  // libraries register via `addPlugin` get installed.
  const tasks: GeneratorCallback[] = [];

  if (
    !libraryExists(tree, contractsRoot) &&
    options.layers.includes('contracts')
  ) {
    tasks.push(
      await jsLibraryGenerator(tree, {
        name: layerName(options, 'contracts'),
        directory: contractsRoot,
        useProjectJson: false,
        addPlugin: true,
        unitTestRunner: 'none',
        bundler: options.bundler,
        linter: options.linter,
        tags: `${LibraryScope.Domain},${domainTag},${LibraryType.Contracts}`,
      }),
    );
    tree.delete(`${contractsRoot}/src/lib/${options.name}-contracts.ts`);
    tree.write(`${contractsRoot}/src/index.ts`, '');
  }

  if (!libraryExists(tree, coreRoot) && options.layers.includes('core')) {
    tasks.push(
      await jsLibraryGenerator(tree, {
        name: layerName(options, 'core'),
        directory: coreRoot,
        useProjectJson: false,
        addPlugin: true,
        unitTestRunner: options.unitTestRunner,
        bundler: options.bundler,
        linter: options.linter,
        tags: `${LibraryScope.Domain},${domainTag},${LibraryType.Core}`,
      }),
    );
    tree.delete(`${coreRoot}/src/lib/${options.name}-core.ts`);
    tree.delete(`${coreRoot}/src/lib/${options.name}-core.spec.ts`);
    tree.write(`${coreRoot}/src/index.ts`, '');

    // Scaffold the default Clean Architecture layer folders (domain,
    // application, infrastructure — each kept in git via a `.gitkeep`) and lock
    // down imports between them: domain ⊀ application/infrastructure, and
    // application ⊀ infrastructure (the implementation is wired via DI at the
    // composition root, not imported across layers).
    generateFiles(tree, resolve(__dirname, 'files/core'), coreRoot, {});
    applyCleanArchitectureBoundaries(tree, coreRoot, options.prefix);
  }

  if (!libraryExists(tree, uiRoot) && options.layers.includes('ui')) {
    tasks.push(
      await generateLayerLibrary(tree, options, {
        root: uiRoot,
        name: layerName(options, 'ui'),
        tags: `${LibraryScope.Domain},${domainTag},${LibraryType.Ui}`,
      }),
    );
  }

  if (
    !libraryExists(tree, featuresRoot) &&
    options.layers.includes('features')
  ) {
    tasks.push(
      await generateLayerLibrary(tree, options, {
        root: featuresRoot,
        name: layerName(options, 'features'),
        tags: `${LibraryScope.Domain},${domainTag},${LibraryType.Features}`,
      }),
    );
  }

  // Silo this domain: per-domain constraints are what actually prevent
  // cross-domain imports (a static `domain:*` rule cannot — Nx glob-matches the
  // target tags, so it would let `domain:auth` import `domain:payments`).
  //
  // A `domain:<name>` library may depend on its own domain, the shared kernel,
  // and the *public contracts* of any other domain (`type:contracts`) — the
  // published-language pattern: a domain depends on another domain's
  // abstraction, never its implementation (`core`/`ui`/`features`/
  // `infrastructure`), which stays hidden behind DI wired up in the composition
  // root. No-op (with a warning) when there is no ESLint config.
  applyDepConstraints(tree, [
    {
      sourceTag: domainTag,
      onlyDependOnLibsWithTags: [
        domainTag,
        LibraryScope.Shared,
        LibraryType.Contracts,
      ],
    },
  ]);

  await formatFiles(tree);

  return runTasksInSerial(...tasks);
}

/** Composes a layer library name, applying the optional organization prefix. */
function layerName(options: DomainGeneratorSchema, layer: string): string {
  const base = `${options.name}-${layer}`;
  return options.prefix ? `${options.prefix}/${base}` : base;
}

/**
 * Generates a presentational/feature layer library and returns its install
 * callback. Under the `react` preset it uses `@nx/react`'s generator (loaded
 * lazily via `ensurePackage` so the domain generator never hard-depends on
 * `@nx/react` in non-React workspaces); under `none` it uses `@nx/js` and adds
 * the DOM lib to the library `tsconfig` so browser globals type-check.
 *
 * Both pass `addPlugin: true` so the library gets inferred tasks (Project
 * Crystal) rather than the deprecated executor targets the generators' public
 * wrappers default to.
 */
async function generateLayerLibrary(
  tree: Tree,
  options: DomainGeneratorSchema,
  layer: { root: string; name: string; tags: string },
): Promise<GeneratorCallback> {
  if (options.preset === 'react') {
    const { libraryGenerator: reactLibraryGenerator } = ensurePackage<
      typeof import('@nx/react')
    >('@nx/react', NX_VERSION);

    return await reactLibraryGenerator(tree, {
      name: layer.name,
      directory: layer.root,
      useProjectJson: false,
      addPlugin: true,
      unitTestRunner: options.unitTestRunner,
      bundler: options.bundler,
      linter: options.linter,
      style: 'none',
      tags: layer.tags,
    });
  }

  const task = await jsLibraryGenerator(tree, {
    name: layer.name,
    directory: layer.root,
    useProjectJson: false,
    addPlugin: true,
    unitTestRunner: options.unitTestRunner,
    bundler: options.bundler,
    linter: options.linter,
    tags: layer.tags,
  });
  addDomLibToTsConfig(tree, layer.root);
  return task;
}

/** Adds the `DOM` lib to a library's `tsconfig.lib.json` (idempotent). */
function addDomLibToTsConfig(tree: Tree, root: string) {
  updateJson(tree, `${root}/tsconfig.lib.json`, (json) => {
    json.compilerOptions ??= {};
    if (!json.compilerOptions.lib) {
      json.compilerOptions.lib = ['ESNext', 'DOM'];
    } else if (!json.compilerOptions.lib.includes('DOM')) {
      json.compilerOptions.lib.push('DOM');
    }
    return json;
  });
}

export default domainGenerator;
