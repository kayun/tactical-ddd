import { execSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
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

    // Establish the shared kernel + root module-boundary constraints, then the
    // business domains: auth/payments exercise cross-domain isolation, billing
    // exercises the Clean Architecture layering inside a single core library.
    runInit();
    runDomain('auth');
    runDomain('payments');
    runDomain('billing');

    // Set up two cross-domain edges to exercise the published-language rule:
    //
    //  1. ALLOWED — auth/core depends on payments' public *contract* (an
    //     abstraction). Domains may depend on each other's `type:contracts`.
    //  2. BLOCKED — payments/core depends on auth/core, another domain's
    //     *implementation*. This must be rejected by the boundary rule.
    writeFileSync(
      join(libRoot('payments', 'contracts'), 'src', 'index.ts'),
      "export const PAYMENTS_PORT = 'PAYMENTS_PORT';\n",
    );
    writeFileSync(
      join(libRoot('payments', 'core'), 'src', 'index.ts'),
      'export const paymentsImpl = 1;\n',
    );
    writeFileSync(
      join(libRoot('auth', 'core'), 'src', 'index.ts'),
      'export const authImpl = 2;\n',
    );

    // (1) ALLOWED: auth/core imports payments' contract.
    const contractImport = join(
      libRoot('auth', 'core'),
      'src',
      'lib',
      'uses-payment-contract.ts',
    );
    mkdirSync(dirname(contractImport), { recursive: true });
    writeFileSync(
      contractImport,
      `import { PAYMENTS_PORT } from '${PREFIX}/payments-contracts';\n\nexport const usesPaymentsPort = PAYMENTS_PORT;\n`,
    );

    // (2) BLOCKED: payments/core imports auth's implementation.
    const implImport = join(
      libRoot('payments', 'core'),
      'src',
      'lib',
      'uses-auth-impl.ts',
    );
    mkdirSync(dirname(implImport), { recursive: true });
    writeFileSync(
      implImport,
      `import { authImpl } from '${PREFIX}/auth-core';\n\nexport const usesAuthImpl = authImpl;\n`,
    );

    // Clean Architecture layering inside billing/core. The generator scaffolds
    // src/lib/{domain,application,infrastructure}; populate them with:
    //  - a clean domain entity,
    //  - an ALLOWED inward dependency (application → domain),
    //  - infrastructure, plus
    //  - a FORBIDDEN outward dependency (domain → infrastructure).
    const coreLib = (...segments: string[]) =>
      join(libRoot('billing', 'core'), 'src', 'lib', ...segments);

    writeFileSync(coreLib('domain', 'order.ts'), 'export class Order {}\n');
    writeFileSync(
      coreLib('application', 'create-order.ts'),
      "import { Order } from '../domain/order';\n\nexport const createOrder = () => new Order();\n",
    );
    writeFileSync(
      coreLib('infrastructure', 'db.ts'),
      'export const db = {};\n',
    );
    writeFileSync(
      coreLib('domain', 'leaky.ts'),
      "import { db } from '../infrastructure/db';\n\nexport const leaked = db;\n",
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

    it('scaffolds the default clean-architecture folders in every core library', () => {
      for (const domain of ['auth', 'payments', 'billing']) {
        for (const layer of ['domain', 'application', 'infrastructure']) {
          expect(
            existsSync(
              join(libRoot(domain, 'core'), 'src', 'lib', layer, '.gitkeep'),
            ),
          ).toBe(true);
        }
      }
    });
  });

  describe('cross-domain isolation (published-language)', () => {
    it('records a per-domain constraint for every generated domain', () => {
      const config = readEslintConfig();

      expect(config).toContain('domain:auth');
      expect(config).toContain('domain:payments');
    });

    it('allows a domain to import another domain’s public contracts', () => {
      // auth/core depends on payments/contracts (an abstraction) — permitted.
      const output = lintOutput(`${PREFIX}/auth-core`);

      expect(output).not.toContain('@nx/enforce-module-boundaries');
    });

    it('blocks a domain from importing another domain’s implementation', () => {
      // payments/core depends on auth/core (an implementation) — rejected by the
      // per-domain constraint, not by some unrelated lint failure.
      const output = lintOutput(`${PREFIX}/payments-core`);

      expect(output).toContain('@nx/enforce-module-boundaries');
      expect(output).toContain('domain:payments');
    });
  });

  describe('clean architecture layering (within core)', () => {
    it('blocks the domain layer from importing the infrastructure layer', () => {
      // billing/core/src/lib/domain/leaky.ts reaches into ../infrastructure.
      const output = lintOutput(`${PREFIX}/billing-core`);

      expect(output).toContain('no-restricted-imports');
      expect(output).toContain('Domain layer must be independent');
    });

    it('permits the inward application → domain dependency', () => {
      // The same lint run sees application/create-order.ts importing ../domain;
      // that direction is allowed, so it raises no application-layer violation.
      const output = lintOutput(`${PREFIX}/billing-core`);

      expect(output).not.toContain('Application layer cannot import');
    });
  });
});
