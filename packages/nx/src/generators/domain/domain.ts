import {
  addDependenciesToPackageJson,
  ensurePackage,
  formatFiles,
  generateFiles,
  names,
  NX_VERSION,
  OverwriteStrategy,
  readJson,
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
import { LibraryScope, LibraryType, ModuleFormat } from '../../types';
import { resolveLibraryModuleFormat } from '../../utils/resolve-module-format';
import {
  reactNativeRuntimeDependencies,
  reactRuntimeDependencies,
} from '../../utils/react-runtime';

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
  const facadeDomainInterfaceVariants = names(`${options.name}Facade`);

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
        addPlugin: true,
        unitTestRunner: 'none',
        bundler: options.bundler,
        linter: options.linter,
        tags: `${LibraryScope.Domain},${domainTag},${LibraryType.Contracts}`,
      }),
    );

    const type = resolveLibraryModuleFormat(tree, contractsRoot);

    tree.delete(`${contractsRoot}/src/lib/${options.name}-contracts.ts`);
    tree.write(`${contractsRoot}/src/index.ts`, '');
    generateFiles(
      tree,
      resolve(__dirname, 'files/contracts'),
      contractsRoot,
      {
        name: options.name,
        interfaceName: facadeDomainInterfaceVariants.className,
        esm: type === ModuleFormat.EsModule,
      },
      { overwriteStrategy: OverwriteStrategy.Overwrite },
    );
  }

  if (!libraryExists(tree, coreRoot) && options.layers.includes('core')) {
    tasks.push(
      await jsLibraryGenerator(tree, {
        name: layerName(options, 'core'),
        directory: coreRoot,
        addPlugin: true,
        unitTestRunner: options.unitTestRunner,
        bundler: options.bundler,
        linter: options.linter,
        tags: `${LibraryScope.Domain},${domainTag},${LibraryType.Core}`,
      }),
    );

    const type = resolveLibraryModuleFormat(tree, coreRoot);
    const contractsPackage = layerName(options, 'contracts');

    tree.delete(`${coreRoot}/src/lib/${options.name}-core.ts`);
    tree.delete(`${coreRoot}/src/lib/${options.name}-core.spec.ts`);
    tree.write(`${coreRoot}/src/index.ts`, '');

    // Scaffold the default Clean Architecture layer folders (domain,
    // application, infrastructure — each kept in git via a `.gitkeep`) and lock
    // down imports between them: domain ⊀ application/infrastructure, and
    // application ⊀ infrastructure (the implementation is wired via DI at the
    // composition root, not imported across layers).
    generateFiles(
      tree,
      resolve(__dirname, 'files/core'),
      coreRoot,
      {
        name: options.name,
        interfaceName: facadeDomainInterfaceVariants.className,
        // Full package name of this domain's contracts library, so the facade's
        // import resolves with or without an organization prefix.
        contractsPackage,
        esm: type === ModuleFormat.EsModule,
      },
      { overwriteStrategy: OverwriteStrategy.Overwrite },
    );

    // The generated facade imports the domain's contracts package, so declare it
    // as a dependency — otherwise `@nx/dependency-checks` flags the core library
    // for using a package missing from its `package.json`.
    if (tree.exists(`${contractsRoot}/package.json`)) {
      const contractsVersion =
        readJson(tree, `${contractsRoot}/package.json`).version ?? '*';
      updateJson(tree, `${coreRoot}/package.json`, (pkg) => {
        pkg.dependencies = {
          ...pkg.dependencies,
          [contractsPackage]: contractsVersion,
        };
        return pkg;
      });
    }

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

  // A framework layer (ui/features) needs its runtime present. For the React
  // presets we add it centrally — every half at one specifier, and only when the
  // workspace manages none yet — mirroring the `init` generator; the delegated
  // library generator was told to skip it above so it can't introduce a skewed
  // runtime. React web pulls in `react`/`react-dom`; React Native pulls in
  // `react`/`react-native` (no `react-dom` — it renders to native views, not the
  // DOM).
  //
  // The `vue` preset is absent on purpose: `@nx/vue:library` runs without
  // `skipPackageJson` (see `generateLayerLibrary`) and declares `vue` itself,
  // keeping an existing version, so adding it here would be redundant.
  if (options.layers.includes('ui') || options.layers.includes('features')) {
    const runtime =
      options.preset === 'react'
        ? reactRuntimeDependencies(tree)
        : options.preset === 'react-native'
          ? reactNativeRuntimeDependencies(tree)
          : {};

    if (Object.keys(runtime).length > 0) {
      tasks.push(addDependenciesToPackageJson(tree, runtime, {}));
    }
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
 * callback. All framework generators are loaded lazily via `ensurePackage` so
 * the domain generator never hard-depends on a framework plugin in a workspace
 * that doesn't use it.
 *
 * - `react`: `@nx/react`'s generator (web — renders to the DOM).
 * - `react-native`: `@nx/react-native`'s generator (native views, no DOM).
 * - `vue`: `@nx/vue`'s generator (web — SFCs, Vitest).
 * - `none`: `@nx/js` plus the DOM lib in the library `tsconfig` so browser
 *   globals type-check.
 *
 * Every path passes `addPlugin: true` so the library gets inferred tasks
 * (Project Crystal) rather than the deprecated executor targets the generators'
 * public wrappers default to.
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

    // `skipPackageJson` stops `@nx/react` from adding `react`/`react-dom` to the
    // workspace itself: it would add `react-dom` at a floating range that can
    // resolve to a patch the workspace's already-pinned `react` no longer
    // satisfies (an `ERESOLVE` on install). The React runtime is instead added
    // centrally and skew-free via `reactRuntimeDependencies` in the main
    // generator, only when the workspace manages none yet.
    return await reactLibraryGenerator(tree, {
      name: layer.name,
      directory: layer.root,
      addPlugin: true,
      unitTestRunner: options.unitTestRunner,
      bundler: options.bundler,
      linter: options.linter,
      style: 'none',
      tags: layer.tags,
      skipPackageJson: true,
    });
  }

  if (options.preset === 'react-native') {
    const { reactNativeLibraryGenerator } = ensurePackage<
      typeof import('@nx/react-native')
    >('@nx/react-native', NX_VERSION);

    // `skipPackageJson` for the same reason as the React web path: the runtime
    // (`react`/`react-native`) is added centrally and skew-free via
    // `reactNativeRuntimeDependencies`, never at a floating range here.
    //
    // `@nx/react-native:library` supports only `jest`/`none` (not `vitest`), so
    // anything that isn't `jest` falls back to `none` rather than being passed
    // through and rejected. Unlike the React web generator it has no `bundler`
    // (Metro is fixed) or `style` option. `skipFormat` is left to the shared
    // `formatFiles` at the end of the generator.
    return await reactNativeLibraryGenerator(tree, {
      name: layer.name,
      directory: layer.root,
      addPlugin: true,
      unitTestRunner: options.unitTestRunner === 'jest' ? 'jest' : 'none',
      linter: options.linter,
      tags: layer.tags,
      skipTsConfig: false,
      skipFormat: false,
      skipPackageJson: true,
    });
  }

  if (options.preset === 'vue') {
    const { libraryGenerator: vueLibraryGenerator } = ensurePackage<
      typeof import('@nx/vue')
    >('@nx/vue', NX_VERSION);

    // No `skipPackageJson` here, unlike the React paths. There it stops a
    // skewed `react`/`react-dom` pair from being added at a floating range; Vue
    // ships compiler and runtime in the one package, and `@nx/vue` declares it
    // with `keepExistingVersions`, so there is no skew to guard against. The
    // flag would instead skip the Vue tooling the generated library needs to
    // build and test at all (`@vitejs/plugin-vue`, `vue-tsc`,
    // `@vue/test-utils`), which `@nx/vue` gates behind the same option.
    //
    // `@nx/vue:library` accepts only `vitest`/`none` as a test runner and
    // `vite`/`none` as a bundler, so anything else is coerced rather than
    // passed through and rejected.
    return await vueLibraryGenerator(tree, {
      name: layer.name,
      directory: layer.root,
      addPlugin: true,
      unitTestRunner: options.unitTestRunner === 'vitest' ? 'vitest' : 'none',
      bundler: options.bundler === 'vite' ? 'vite' : 'none',
      linter: options.linter,
      tags: layer.tags,
    });
  }

  const task = await jsLibraryGenerator(tree, {
    name: layer.name,
    directory: layer.root,
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
