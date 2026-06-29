import { execSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';

import {
  createTestProject,
  createWorkspaceReader,
  type WorkspaceReader,
} from './test-utils';

// Booting a real Nx workspace, installing the plugin, running the generators
// and linting is slow, so give the whole suite a generous time budget.
jest.setTimeout(600_000);

describe('@tactical-ddd/nx domain generator (e2e)', () => {
  const PREFIX = '@proj';

  let projectDirectory: string;
  let ws: WorkspaceReader;

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

  beforeAll(() => {
    projectDirectory = createTestProject('test-project-domain');
    ws = createWorkspaceReader(projectDirectory);

    // Establish the shared kernel + root module-boundary constraints, then the
    // business domains: auth/payments exercise cross-domain isolation, billing
    // exercises the Clean Architecture layering inside a single core library.
    runInit();
    runDomain('auth');
    runDomain('payments');
    runDomain('billing');
    // `catalog` is left exactly as generated (no test files written into it) so
    // its libraries can be linted in their default, out-of-the-box state.
    runDomain('catalog');

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
          const { name } = ws.readProjectConfig(`libs/${domain}/${layer}`);
          expect(name).toBe(`${PREFIX}/${domain}-${layer}`);
        }
      },
    );

    it('tags each domain library with scope:domain, its domain tag and type', () => {
      const tags = ws.readTags('libs/auth/core');

      expect(tags).toEqual(
        expect.arrayContaining(['scope:domain', 'domain:auth', 'type:core']),
      );
    });

    it('scaffolds the default clean-architecture layers in every core library', () => {
      for (const domain of ['auth', 'payments', 'billing']) {
        const coreLib = (...segments: string[]) =>
          join(libRoot(domain, 'core'), 'src', 'lib', ...segments);

        // Empty layers are kept in git with a `.gitkeep`; the application layer
        // instead ships the generated facade implementation.
        expect(existsSync(coreLib('domain', '.gitkeep'))).toBe(true);
        expect(existsSync(coreLib('infrastructure', '.gitkeep'))).toBe(true);
        expect(existsSync(coreLib('application', `${domain}.facade.ts`))).toBe(
          true,
        );
      }
    });

    it('generates the facade interface and implementation for each domain', () => {
      for (const domain of ['auth', 'payments', 'billing']) {
        // `names('<domain>Facade').className`, e.g. auth → AuthFacade.
        const facade = `${domain[0].toUpperCase()}${domain.slice(1)}Facade`;

        const iface = readFileSync(
          join(
            libRoot(domain, 'contracts'),
            'src',
            'lib',
            'interfaces',
            `${domain}-facade.interface.ts`,
          ),
          'utf-8',
        );
        expect(iface).toContain(`export interface ${facade}`);

        const impl = readFileSync(
          join(
            libRoot(domain, 'core'),
            'src',
            'lib',
            'application',
            `${domain}.facade.ts`,
          ),
          'utf-8',
        );
        expect(impl).toContain(`class Core${facade} implements ${facade}`);
        expect(impl).toContain(`${PREFIX}/${domain}-contracts`);
      }
    });
  });

  describe('cross-domain isolation (published-language)', () => {
    it('records a per-domain constraint for every generated domain', () => {
      const config = ws.readEslintConfig();

      expect(config).toContain('domain:auth');
      expect(config).toContain('domain:payments');
    });

    it('allows a domain to import another domain’s public contracts', () => {
      // auth/core depends on payments/contracts (an abstraction) — permitted.
      const output = ws.lintOutput(`${PREFIX}/auth-core`);

      expect(output).not.toContain('@nx/enforce-module-boundaries');
    });

    it('blocks a domain from importing another domain’s implementation', () => {
      // payments/core depends on auth/core (an implementation) — rejected by the
      // per-domain constraint, not by some unrelated lint failure.
      const output = ws.lintOutput(`${PREFIX}/payments-core`);

      expect(output).toContain('@nx/enforce-module-boundaries');
      expect(output).toContain('domain:payments');
    });
  });

  describe('default lint cleanliness', () => {
    it('lints the generated contracts library with no errors', () => {
      // `catalog` is generated and left untouched, so a clean lint proves the
      // scaffolded facade interface is valid out of the box.
      expect(ws.lintOutput(`${PREFIX}/catalog-contracts`)).toBe('');
    });

    it('lints the generated core library with no errors', () => {
      // The generated facade imports its own domain's contracts — an allowed
      // dependency — and sits in the application layer, breaking no
      // clean-architecture or module-boundary rule.
      expect(ws.lintOutput(`${PREFIX}/catalog-core`)).toBe('');
    });
  });

  describe('clean architecture layering (within core)', () => {
    it('blocks the domain layer from importing the infrastructure layer', () => {
      // billing/core/src/lib/domain/leaky.ts reaches into ../infrastructure.
      const output = ws.lintOutput(`${PREFIX}/billing-core`);

      expect(output).toContain('no-restricted-imports');
      expect(output).toContain('Domain layer must be independent');
    });

    it('permits the inward application → domain dependency', () => {
      // The same lint run sees application/create-order.ts importing ../domain;
      // that direction is allowed, so it raises no application-layer violation.
      const output = ws.lintOutput(`${PREFIX}/billing-core`);

      expect(output).not.toContain('Application layer cannot import');
    });
  });
});
