import { execSync } from 'child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';

import { createTestProject } from './test-utils';

// Booting a real Nx workspace, installing the plugin, running the generators
// and linting is slow, so give the whole suite a generous time budget.
jest.setTimeout(600_000);

describe('@tactical-ddd/nx domain generator (e2e)', () => {
  const PREFIX = '@proj';

  // Root ESLint config file names create-nx-workspace may emit — flat config
  // (newest) first, then the legacy `.eslintrc.*` formats.
  const ESLINT_CONFIG_FILES = [
    'eslint.config.mjs',
    'eslint.config.js',
    'eslint.config.cjs',
    'eslint.config.ts',
    '.eslintrc.json',
    '.eslintrc.js',
    '.eslintrc.cjs',
    '.eslintrc',
  ];

  let projectDirectory: string;

  const runInit = () =>
    execSync(
      `npx nx g @tactical-ddd/nx:init --prefix=${PREFIX} --sharedDirectory=libs/shared --linter=eslint --unitTestRunner=jest --preset=none --no-interactive`,
      { cwd: projectDirectory, stdio: 'inherit', env: process.env },
    );

  // `--preset=none` means @nx/react is never installed in this workspace, so a
  // successful run here also proves the domain generator loads without a hard
  // dependency on @nx/react.
  const runDomain = (name: string) =>
    execSync(
      `npx nx g @tactical-ddd/nx:domain ${name} --directory=libs/${name} --prefix=${PREFIX} --layers=contracts --layers=core --linter=eslint --unitTestRunner=jest --bundler=tsc --preset=none --no-interactive`,
      { cwd: projectDirectory, stdio: 'inherit', env: process.env },
    );

  const libRoot = (...segments: string[]) =>
    join(projectDirectory, 'libs', ...segments);

  const readJson = (path: string) =>
    JSON.parse(readFileSync(join(projectDirectory, path), 'utf-8'));

  const readEslintConfig = (): string => {
    const file = ESLINT_CONFIG_FILES.map((name) =>
      join(projectDirectory, name),
    ).find((candidate) => {
      try {
        readFileSync(candidate);
        return true;
      } catch {
        return false;
      }
    });

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

  beforeAll(() => {
    projectDirectory = createTestProject('test-project-domain');

    // Establish the shared kernel + root module-boundary constraints, then two
    // isolated business domains.
    runInit();
    runDomain('auth');
    runDomain('payments');

    // Introduce an illegal cross-domain import: auth/core reaches into
    // payments/core. Both are `scope:domain` (so the scope rule alone permits
    // it) — only the per-domain `domain:auth` constraint should reject it.
    writeFileSync(
      join(libRoot('payments', 'core'), 'src', 'index.ts'),
      'export const paymentsValue = 42;\n',
    );

    const crossDomainFile = join(
      libRoot('auth', 'core'),
      'src',
      'lib',
      'uses-payments.ts',
    );
    mkdirSync(dirname(crossDomainFile), { recursive: true });
    writeFileSync(
      crossDomainFile,
      `import { paymentsValue } from '${PREFIX}/payments-core';\n\nexport const usesPayments = paymentsValue;\n`,
    );
  });

  afterAll(() => {
    if (projectDirectory) {
      rmSync(projectDirectory, { recursive: true, force: true });
    }
  });

  describe('layer scaffolding', () => {
    it.each(['contracts', 'core'])(
      'scaffolds the "%s" layer for each domain',
      (layer) => {
        for (const domain of ['auth', 'payments']) {
          const manifest = readJson(`libs/${domain}/${layer}/package.json`);
          expect(manifest.name).toBe(`${PREFIX}/${domain}-${layer}`);
        }
      },
    );

    it('tags each domain library with scope:domain, its domain tag and type', () => {
      const tags: string[] =
        readJson('libs/auth/core/package.json').nx?.tags ?? [];

      expect(tags).toEqual(
        expect.arrayContaining(['scope:domain', 'domain:auth', 'type:core']),
      );
    });
  });

  describe('cross-domain isolation', () => {
    it('records a per-domain constraint for every generated domain', () => {
      const config = readEslintConfig();

      expect(config).toContain('domain:auth');
      expect(config).toContain('domain:payments');
    });

    it('fails lint when one domain imports another', () => {
      const output = lintOutput(`${PREFIX}/auth-core`);

      // The module-boundary rule must be what rejects the import — not merely
      // that lint happened to fail for some unrelated reason.
      expect(output).toContain('@nx/enforce-module-boundaries');
      expect(output).toContain('domain:auth');
    });
  });
});
