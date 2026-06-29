import { execSync } from 'child_process';
import { join, dirname } from 'path';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';

/**
 * Major Nx version the e2e workspaces are created and pinned to, taken from the
 * `E2E_NX_VERSION` env var (defaults to `23`). The suite is run once per
 * supported major (see the `generators:e2e:*` scripts) so the generators are
 * verified against every Nx version the plugin claims to support.
 */
export const E2E_NX_VERSION = process.env.E2E_NX_VERSION ?? '23';

// `@nx/*` packages pinned to {@link E2E_NX_VERSION}. Installing the plugin pulls
// the newest version satisfying its `^22 || ^23` range (i.e. 23) and its peers
// can drag the whole workspace up with it, so we pin these back to the target
// major to keep the workspace faithfully on the version under test.
const PINNED_NX_PACKAGES = [
  'nx',
  '@nx/devkit',
  '@nx/js',
  '@nx/eslint',
  '@nx/eslint-plugin',
  '@nx/jest',
];

/**
 * Creates an isolated Nx workspace under `tmp/<projectName>-nx<major>` and
 * installs the locally-published `@tactical-ddd/nx` plugin into it.
 *
 * The plugin is served from the verdaccio registry started in the jest
 * `globalSetup` (`tools/scripts/start-local-registry.ts`) and published under
 * the `@e2e` dist-tag, so the install resolves the latest built source. The
 * workspace is created with — and pinned to — the {@link E2E_NX_VERSION} major.
 *
 * @param projectName Unique workspace name — also the temp sub-directory.
 *   Use a distinct name per spec file so suites running in band don't collide.
 * @returns Absolute path to the created workspace.
 */
export function createTestProject(projectName: string): string {
  // Suffix the workspace with the Nx major so the two version runs never share
  // a directory (and the version under test is obvious when debugging).
  const workspaceName = `${projectName}-nx${E2E_NX_VERSION}`;

  // Scaffold outside the repository's working tree: the repo `.gitignore`
  // ignores `tmp/`, and `create-nx-workspace`'s `git add` aborts on ignored
  // paths when it runs inside the parent git repo. The OS temp dir is neutral.
  const projectDirectory = join(tmpdir(), 'tactical-ddd-e2e', workspaceName);

  // Ensure the target directory is empty before scaffolding.
  rmSync(projectDirectory, { recursive: true, force: true });
  mkdirSync(dirname(projectDirectory), { recursive: true });

  execSync(
    `npx create-nx-workspace@${E2E_NX_VERSION} ${workspaceName} --preset apps --nxCloud=skip --no-interactive`,
    {
      cwd: dirname(projectDirectory),
      stdio: 'inherit',
      env: process.env,
    },
  );
  console.log(
    `Created test project in "${projectDirectory}" (Nx ${E2E_NX_VERSION})`,
  );

  // Install the plugin built from the latest source into the test repo.
  execSync(`npm install -D @tactical-ddd/nx@e2e`, {
    cwd: projectDirectory,
    stdio: 'inherit',
    env: process.env,
  });

  // Pin the Nx packages back to the major under test — the plugin install above
  // may otherwise have upgraded them past it.
  const pinned = PINNED_NX_PACKAGES.map(
    (pkg) => `${pkg}@${E2E_NX_VERSION}`,
  ).join(' ');
  execSync(`npm install -D --save-exact --legacy-peer-deps ${pinned}`, {
    cwd: projectDirectory,
    stdio: 'inherit',
    env: process.env,
  });

  return projectDirectory;
}

/**
 * Removes a test workspace directory. Safe to call from `afterAll` regardless of
 * whether {@link createTestProject} ran — a missing/empty path is a no-op.
 *
 * A workspace that ran generators may still have the Nx daemon (or a lingering
 * package-manager process) writing into the temp dir, so a single recursive
 * remove can race and throw `ENOTEMPTY`/`EBUSY` mid-traversal. `rmSync`'s
 * built-in retry loop is meant for exactly these transient errors.
 */
export function cleanupProject(projectDirectory: string | undefined): void {
  if (projectDirectory) {
    rmSync(projectDirectory, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 200,
    });
  }
}

/**
 * Root ESLint config file names a create-nx-workspace may emit — flat config
 * (newest) first, then the legacy `.eslintrc.*` formats. The generators detect
 * and update whichever is present via `@nx/eslint`'s AST utils.
 */
export const ESLINT_CONFIG_FILES = [
  'eslint.config.mjs',
  'eslint.config.js',
  'eslint.config.cjs',
  'eslint.config.ts',
  '.eslintrc.json',
  '.eslintrc.js',
  '.eslintrc.cjs',
  '.eslintrc',
];

/**
 * Bundles the file/lint assertions every e2e spec runs against a generated
 * workspace, bound to its root directory so callers pass only workspace-relative
 * paths.
 *
 * Specs read the generated files directly rather than going through `nx show
 * project`: right after generation the Nx daemon may still serve a graph
 * computed before the libraries existed, so the project list races and can come
 * back empty. The generated files are the source of truth.
 */
export function createWorkspaceReader(projectDirectory: string) {
  /** Absolute path to a workspace-relative location. */
  const resolve = (...segments: string[]): string =>
    join(projectDirectory, ...segments);

  /** Parse a JSON file at a workspace-relative path. */
  const readJson = (relativePath: string) =>
    JSON.parse(readFileSync(resolve(relativePath), 'utf-8'));

  /** Parse a library's `package.json` (libDir is workspace-relative). */
  const readManifest = (libDir: string) =>
    readJson(join(libDir, 'package.json'));

  /**
   * A library's Nx project config, normalized across manifests: `@nx/js:library`
   * writes `project.json` in an integrated (tsconfig-paths) workspace, or the
   * `package.json` `nx` block under package-manager workspaces — and the
   * bundler-less integrated case leaves only `project.json` (no `package.json`
   * at all). `project.json` wins when both exist.
   */
  const readProjectConfig = (
    libDir: string,
  ): { name?: string; tags: string[]; targets: Record<string, unknown> } => {
    const projectJson = resolve(libDir, 'project.json');
    if (existsSync(projectJson)) {
      const json = JSON.parse(readFileSync(projectJson, 'utf-8'));
      return {
        name: json.name,
        tags: json.tags ?? [],
        targets: json.targets ?? {},
      };
    }
    const pkg = readManifest(libDir);
    return {
      name: pkg.name,
      tags: pkg.nx?.tags ?? [],
      targets: pkg.nx?.targets ?? {},
    };
  };

  /** A library's tags, from whichever manifest the workspace shape carries. */
  const readTags = (libDir: string): string[] => readProjectConfig(libDir).tags;

  // Walk a tsconfig's `extends` chain until `compilerOptions.module` is found.
  // tsconfigs may be JSONC, so strip comments/trailing commas before parsing.
  const readTsModuleOption = (
    tsConfigPath: string,
    visited = new Set<string>(),
  ): string | undefined => {
    if (visited.has(tsConfigPath) || !existsSync(tsConfigPath)) {
      return undefined;
    }
    visited.add(tsConfigPath);

    const config = JSON.parse(
      readFileSync(tsConfigPath, 'utf-8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|[^:])\/\/.*$/gm, '$1')
        .replace(/,(\s*[}\]])/g, '$1'),
    );

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
      const inherited = readTsModuleOption(
        join(dirname(tsConfigPath), parent),
        visited,
      );
      if (inherited) return inherited;
    }
    return undefined;
  };

  /**
   * The module format a generated library ships in. Mirrors the generator's
   * resolution so the assertion holds across workspace shapes: `package.json`
   * `"type"` first (when that manifest exists), then the `module` compiler
   * option from `tsconfig.lib.json`. An integrated workspace emits no per-lib
   * `package.json`, so the tsconfig signal is what carries the format there.
   */
  const moduleFormat = (libDir: string): 'esm' | 'cjs' => {
    const packageJson = resolve(libDir, 'package.json');
    if (existsSync(packageJson)) {
      const { type } = JSON.parse(readFileSync(packageJson, 'utf-8'));
      if (type === 'module') return 'esm';
      if (type === 'commonjs') return 'cjs';
    }

    const moduleOption = (
      readTsModuleOption(resolve(libDir, 'tsconfig.lib.json')) ?? ''
    ).toLowerCase();
    // commonjs/amd/umd/system are CJS-era module systems; esnext/es*/nodenext/
    // node*/preserve — and the integrated-workspace default — are ESM-oriented.
    return ['commonjs', 'amd', 'umd', 'system'].includes(moduleOption)
      ? 'cjs'
      : 'esm';
  };

  /** Contents of the workspace's root ESLint config (throws if none found). */
  const readEslintConfig = (): string => {
    const file = ESLINT_CONFIG_FILES.map((name) => resolve(name)).find(
      existsSync,
    );
    if (!file) {
      throw new Error('No root ESLint config found in the test workspace');
    }
    return readFileSync(file, 'utf-8');
  };

  // Runs `nx lint` for a project and returns its combined output. The daemon is
  // disabled so the project graph reflects the files we just wrote rather than a
  // stale snapshot. Returns '' when lint passes (non-zero exit ⇒ captured here).
  const lintOutput = (project: string): string => {
    try {
      execSync(`npx nx lint ${project} --skip-nx-cache`, {
        cwd: projectDirectory,
        stdio: 'pipe',
        env: { ...process.env, NX_DAEMON: 'false' },
      });
      return '';
    } catch (error) {
      const e = error as { stdout?: Buffer; stderr?: Buffer };
      return `${e.stdout?.toString() ?? ''}${e.stderr?.toString() ?? ''}`;
    }
  };

  return {
    resolve,
    readJson,
    readManifest,
    readProjectConfig,
    readTags,
    moduleFormat,
    readEslintConfig,
    lintOutput,
  };
}

/** The file/lint assertions an e2e spec runs against a generated workspace. */
export type WorkspaceReader = ReturnType<typeof createWorkspaceReader>;
