import {
  ensurePackage,
  formatFiles,
  NX_VERSION,
  type Tree,
  updateJson,
} from '@nx/devkit';
import { libraryGenerator as jsLibraryGenerator } from '@nx/js';

import type { DomainGeneratorSchema } from './schema';
import { libraryExists } from '../../utils/library-exist';
import {
  applyDepConstraints,
  withAlignedEslintConfigDetectionAsync,
} from '../../utils/eslint-module-boundaries';
import { LibraryScope, LibraryType } from '../../types';

/** Conventional location of the shared kernel's contracts library. */
const SHARED_CONTRACTS_ROOT = 'libs/shared/contracts';

export async function domainGenerator(
  tree: Tree,
  options: DomainGeneratorSchema,
) {
  // Implicit existence check (CLAUDE.md 7.3.1): domain libraries depend on the
  // shared kernel, so warn if it has not been generated yet rather than
  // producing libraries whose boundary constraints reference tags nothing
  // carries.
  if (!libraryExists(tree, SHARED_CONTRACTS_ROOT)) {
    console.warn(
      `Shared kernel not found at ${SHARED_CONTRACTS_ROOT}. Run \`nx g @tactical-ddd/nx:shared-kernel\` (or the \`init\` generator) first so domain libraries can depend on the shared contracts.`,
    );
  }

  const contractsRoot = `${options.directory}/contracts`;
  const coreRoot = `${options.directory}/core`;
  const uiRoot = `${options.directory}/ui`;
  const featuresRoot = `${options.directory}/features`;
  const domainTag = `domain:${options.name}`;

  // Keep `@nx/eslint`'s flat-vs-legacy detection pinned to the root config
  // format for the whole of generation, so the per-project ESLint configs the
  // library generators emit match the workspace root. Otherwise a workspace
  // whose ESLint was bumped to >= 9 after setup gets flat lib configs that try
  // to extend a legacy root and `nx lint` later fails ("baseConfig is not
  // iterable").
  await withAlignedEslintConfigDetectionAsync(tree, async () => {
    if (
      !libraryExists(tree, contractsRoot) &&
      options.layers.includes('contracts')
    ) {
      await jsLibraryGenerator(tree, {
        name: layerName(options, 'contracts'),
        directory: contractsRoot,
        useProjectJson: false,
        unitTestRunner: 'none',
        bundler: options.bundler,
        linter: options.linter,
        tags: `${LibraryScope.Domain},${domainTag},${LibraryType.Contracts}`,
      });
      tree.delete(`${contractsRoot}/src/lib/${options.name}-contracts.ts`);
      tree.write(`${contractsRoot}/src/index.ts`, '');
    }

    if (!libraryExists(tree, coreRoot) && options.layers.includes('core')) {
      await jsLibraryGenerator(tree, {
        name: layerName(options, 'core'),
        directory: coreRoot,
        useProjectJson: false,
        unitTestRunner: options.unitTestRunner,
        bundler: options.bundler,
        linter: options.linter,
        tags: `${LibraryScope.Domain},${domainTag},${LibraryType.Core}`,
      });
      tree.delete(`${coreRoot}/src/lib/${options.name}-core.ts`);
      tree.delete(`${coreRoot}/src/lib/${options.name}-core.spec.ts`);
      tree.write(`${coreRoot}/src/index.ts`, '');
    }

    if (!libraryExists(tree, uiRoot) && options.layers.includes('ui')) {
      await generateLayerLibrary(tree, options, {
        root: uiRoot,
        name: layerName(options, 'ui'),
        tags: `${LibraryScope.Domain},${domainTag},${LibraryType.Ui}`,
      });
    }

    if (
      !libraryExists(tree, featuresRoot) &&
      options.layers.includes('features')
    ) {
      await generateLayerLibrary(tree, options, {
        root: featuresRoot,
        name: layerName(options, 'features'),
        tags: `${LibraryScope.Domain},${domainTag},${LibraryType.Features}`,
      });
    }

    // Silo this domain: per-domain constraints are what actually prevent
    // cross-domain imports (a static `domain:*` rule cannot — Nx glob-matches
    // the target tags, so it would let `domain:auth` import `domain:payments`).
    //
    // A `domain:<name>` library may depend on its own domain, the shared
    // kernel, and the *public contracts* of any other domain (`type:contracts`)
    // — the published-language pattern: a domain depends on another domain's
    // abstraction, never its implementation (`core`/`ui`/`features`/
    // `infrastructure`), which stays hidden behind DI wired up in the
    // composition root. No-op (with a warning) when there is no ESLint config.
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
  });

  await formatFiles(tree);
}

/** Composes a layer library name, applying the optional organization prefix. */
function layerName(options: DomainGeneratorSchema, layer: string): string {
  const base = `${options.name}-${layer}`;
  return options.prefix ? `${options.prefix}/${base}` : base;
}

/**
 * Generates a presentational/feature layer library. Under the `react` preset it
 * uses `@nx/react`'s generator (loaded lazily via `ensurePackage` so the domain
 * generator never hard-depends on `@nx/react` in non-React workspaces); under
 * `none` it uses `@nx/js` and adds the DOM lib to the library `tsconfig` so
 * browser globals type-check.
 */
async function generateLayerLibrary(
  tree: Tree,
  options: DomainGeneratorSchema,
  layer: { root: string; name: string; tags: string },
) {
  if (options.preset === 'react') {
    const { libraryGenerator: reactLibraryGenerator } = ensurePackage<
      typeof import('@nx/react')
    >('@nx/react', NX_VERSION);

    await reactLibraryGenerator(tree, {
      name: layer.name,
      directory: layer.root,
      useProjectJson: false,
      unitTestRunner: options.unitTestRunner,
      bundler: options.bundler,
      linter: options.linter,
      style: 'none',
      tags: layer.tags,
    });
    return;
  }

  await jsLibraryGenerator(tree, {
    name: layer.name,
    directory: layer.root,
    useProjectJson: false,
    unitTestRunner: options.unitTestRunner,
    bundler: options.bundler,
    linter: options.linter,
    tags: layer.tags,
  });
  addDomLibToTsConfig(tree, layer.root);
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
