import { type Tree, readJson, joinPathFragments } from '@nx/devkit';
import { dirname } from 'path';

import { ModuleFormat } from '../types';

/**
 * Determine which module system a generated library ships in.
 *
 * The signals are inspected in priority order, from the most direct to the
 * most circumstantial. The first signal that yields a definitive answer wins;
 * an indeterminate signal falls through to the next one.
 *
 *   1. `package.json` `"type"`        — the most direct signal.
 *   2. `tsconfig.lib.json` `"module"` — follows the `extends` chain.
 *   3. build target executor          — bundler-dependent, best effort.
 *
 * Returns {@link ModuleFormat.Unknown} when nothing resolves.
 */
export function resolveLibraryModuleFormat(
  tree: Tree,
  projectRoot: string,
): ModuleFormat {
  const resolvers = [
    fromPackageJsonType,
    fromTsConfigModule,
    fromBuildTarget,
  ] as const;

  for (const resolve of resolvers) {
    const format = resolve(tree, projectRoot);
    if (format !== ModuleFormat.Unknown) {
      return format;
    }
  }

  return ModuleFormat.Unknown;
}

/**
 * 1. `package.json` `"type"` — `commonjs` → CJS, `module` → ESM. Absence is
 * not treated as Node's implicit `commonjs` default here; we defer to the
 * stronger TypeScript signal instead.
 */
function fromPackageJsonType(tree: Tree, projectRoot: string): ModuleFormat {
  const packageJsonPath = joinPathFragments(projectRoot, 'package.json');

  if (!tree.exists(packageJsonPath)) {
    return ModuleFormat.Unknown;
  }

  const { type } = readJson<{ type?: string }>(tree, packageJsonPath);

  if (type === 'commonjs') return ModuleFormat.CommonJs;
  if (type === 'module') return ModuleFormat.EsModule;

  return ModuleFormat.Unknown;
}

/**
 * 2. `tsconfig.lib.json` `"module"`. `commonjs` → CJS; `esnext`, `nodenext`,
 * `node16` and the rest of the ES-oriented family → ESM. The option is often
 * inherited, so the `extends` chain is walked until a value is found.
 */
function fromTsConfigModule(tree: Tree, projectRoot: string): ModuleFormat {
  const moduleOption = readInheritedModuleOption(
    tree,
    joinPathFragments(projectRoot, 'tsconfig.lib.json'),
  );

  return classifyTsModule(moduleOption);
}

/**
 * 3. Build target executor. `@nx/js:tsc`/`@nx/js:swc` ultimately defer to the
 * compiler config, so they only decide here when they carry an explicit
 * `format`. Bundlers (`rollup`/`vite`/`esbuild`) expose a `format` array —
 * the presence of `esm`/`cjs` is the signal. Indeterminate → Unknown.
 */
function fromBuildTarget(tree: Tree, projectRoot: string): ModuleFormat {
  const build = readBuildTarget(tree, projectRoot);

  if (!build) return ModuleFormat.Unknown;

  const raw = build.options?.format;
  const formats = (Array.isArray(raw) ? raw : raw ? [raw] : []).map((value) =>
    String(value).toLowerCase(),
  );

  if (formats.includes('esm')) return ModuleFormat.EsModule;
  if (formats.includes('cjs')) return ModuleFormat.CommonJs;

  return ModuleFormat.Unknown;
}

/** Walk the `extends` chain of a tsconfig until `compilerOptions.module` is found. */
function readInheritedModuleOption(
  tree: Tree,
  tsConfigPath: string,
  visited: Set<string> = new Set(),
): string | undefined {
  if (visited.has(tsConfigPath) || !tree.exists(tsConfigPath)) {
    return undefined;
  }
  visited.add(tsConfigPath);

  const config = readJson<{
    compilerOptions?: { module?: string };
    extends?: string | string[];
  }>(tree, tsConfigPath);

  const localModule = config.compilerOptions?.module;
  if (typeof localModule === 'string') {
    return localModule;
  }

  // TS resolves multiple `extends` left-to-right with later entries winning,
  // so search them in reverse for the effective value.
  const parents = Array.isArray(config.extends)
    ? [...config.extends].reverse()
    : config.extends
      ? [config.extends]
      : [];

  for (const parent of parents) {
    const resolved = joinPathFragments(dirname(tsConfigPath), parent);
    const inherited = readInheritedModuleOption(tree, resolved, visited);
    if (inherited) return inherited;
  }

  return undefined;
}

function classifyTsModule(moduleOption: string | undefined): ModuleFormat {
  if (!moduleOption) return ModuleFormat.Unknown;

  const normalized = moduleOption.toLowerCase();

  if (normalized === 'commonjs') return ModuleFormat.CommonJs;

  // esnext / es2015+ / nodenext / node16 / node18 / preserve → ESM-oriented.
  if (
    normalized.startsWith('es') ||
    normalized.startsWith('node') ||
    normalized === 'preserve'
  ) {
    return ModuleFormat.EsModule;
  }

  // amd / umd / system and friends are CJS-era module systems.
  return ModuleFormat.CommonJs;
}

/** Read the `build` target from either `project.json` or `package.json` `nx.targets`. */
function readBuildTarget(
  tree: Tree,
  projectRoot: string,
): { options?: { format?: unknown } } | undefined {
  const projectJsonPath = joinPathFragments(projectRoot, 'project.json');
  if (tree.exists(projectJsonPath)) {
    const { targets } = readJson<{
      targets?: Record<string, { options?: { format?: unknown } }>;
    }>(tree, projectJsonPath);
    if (targets?.['build']) return targets['build'];
  }

  const packageJsonPath = joinPathFragments(projectRoot, 'package.json');
  if (tree.exists(packageJsonPath)) {
    const { nx } = readJson<{
      nx?: { targets?: Record<string, { options?: { format?: unknown } }> };
    }>(tree, packageJsonPath);
    if (nx?.targets?.['build']) return nx.targets['build'];
  }

  return undefined;
}
