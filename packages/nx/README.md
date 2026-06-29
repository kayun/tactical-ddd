[![npm version](https://img.shields.io/npm/v/@tactical-ddd/nx)](https://www.npmjs.com/package/@tactical-ddd/nx)
[![npm downloads](https://img.shields.io/npm/dm/@tactical-ddd/nx)](https://www.npmjs.com/package/@tactical-ddd/nx)
[![license](https://img.shields.io/npm/l/@tactical-ddd/nx)](https://github.com/kayun/tactical-ddd/blob/main/LICENSE)

# @tactical-ddd/nx

`@tactical-ddd/nx` is a collection of Nx generators for scaffolding and enforcing Domain-Driven Design (DDD) architectures inside your Nx monorepo.

The suite is being built out incrementally. Generators currently available:

- [`init`](#init-generator) — the recommended starting point: bootstraps the whole workspace (generator defaults, module-boundary lint rules, the Shared Kernel, and an optional framework preset such as React) in one step.
- [`shared-kernel`](#shared-kernel-generator) — scaffolds the Shared Kernel, the agnostic foundation reused by every other module.
- [`domain`](#domain-generator) — scaffolds a bounded business domain (its `contracts`/`core`/`ui`/`features` layers) and wires up cross-domain isolation.

## Init Generator

The `init` generator is the **one-shot bootstrap** for a Tactical DDD workspace. Run it once, right after creating your Nx workspace, and it wires up everything the rest of the ecosystem relies on. It is a composing generator — it does not duplicate logic, but orchestrates the lower-level pieces:

1. **Workspace generator defaults** — persists shared options into `nx.json` so they are configured **once** and Nx injects them automatically into later generator invocations, so you never have to retype them. Two groups are written: the organization `prefix` plus `linter`/`unitTestRunner` for our own `@tactical-ddd/nx` generators, and the same `bundler`/`linter`/`unitTestRunner` choices for the built-in `@nx/js:library` generator — so even a hand-rolled `nx g @nx/js:library` already matches the conventions. The matching `@nx/react:library` defaults are added only under the `react` preset:

   ```jsonc
   // nx.json
   {
     "generators": {
       "@tactical-ddd/nx": {
         "shared-kernel": {
           "prefix": "@my-org",
           "linter": "eslint",
           "unitTestRunner": "jest",
         },
       },
       "@nx/js:library": {
         "bundler": "none",
         "linter": "eslint",
         "unitTestRunner": "jest",
       },
       // Added only with `--preset=react`:
       "@nx/react:library": {
         "bundler": "none",
         "linter": "eslint",
         "unitTestRunner": "jest",
       },
     },
   }
   ```

2. **Module-boundary lint rules** — populates `@nx/enforce-module-boundaries` in the root ESLint config with the full Tactical DDD dependency graph (`depConstraints`). This enforces the allowed dependency directions between scopes/layers _and_ the absence of circular dependencies. Both flat config (`eslint.config.*`) and legacy `.eslintrc.*` are detected and updated via AST manipulation. See [Module Boundaries & Isolation Rules](#module-boundaries--isolation-rules).

3. **Shared Kernel** — invokes the [`shared-kernel`](#shared-kernel-generator) generator to scaffold `libs/shared/{contracts,utils,infrastructure}`.

4. **Framework preset** _(optional)_ — with `--preset=react`, the workspace is additionally set up for React: the `@nx/react:library` generator defaults above are written, the `@nx/react` generator plugin is added, and the React runtime — `react`, `react-dom` and the [`@tactical-ddd/react`](https://www.npmjs.com/package/@tactical-ddd/react) bindings — is installed as a production dependency. With the default `--preset=none` the workspace stays framework-agnostic and none of the React tooling is pulled in.

5. **Dependency check & install** — ensures the packages the configured and invoked generators rely on are present in the workspace `package.json`, installing any that are missing (via `addDependenciesToPackageJson`). Nx plugin versions are pinned to the workspace's Nx version. The set is scoped to your choices: `@nx/js` always; `@nx/eslint` + `@nx/eslint-plugin` when `linter: eslint`; `@nx/jest` or `@nx/vite` to match `unitTestRunner`; and the React packages above when `preset: react`. Already-installed packages are left untouched (never downgraded).

> Order matters and is handled for you: the Shared Kernel is generated first (in a fresh workspace the root ESLint config only exists after the first library is created), then the module-boundary rules are applied to it.

### Usage

```bash
nx g @tactical-ddd/nx:init --prefix=@my-org --linter=eslint --unitTestRunner=jest
```

For a React workspace, add the preset to also install `@tactical-ddd/react` and the React tooling:

```bash
nx g @tactical-ddd/nx:init --prefix=@my-org --linter=eslint --unitTestRunner=jest --preset=react
```

When run interactively (or via Nx Console), the generator prompts for any required option that is not passed on the command line.

### Options

| Option            | Type     | Default       | Required | Description                                                                                                                             |
| ----------------- | -------- | ------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `prefix`          | `string` | —             | Yes      | Organization prefix used for the generated library names, e.g. `@my-org`. Set once, reused by all generators.                           |
| `sharedDirectory` | `string` | `libs/shared` | No       | Root folder the Shared Kernel libraries are generated into.                                                                             |
| `linter`          | `string` | —             | Yes      | Linter to configure for the generated libraries. One of `eslint`, `none`.                                                               |
| `unitTestRunner`  | `string` | —             | Yes      | Unit test runner to set up. One of `jest`, `vitest`, `none`.                                                                            |
| `bundler`         | `string` | `none`        | No       | Bundler used to build the libraries. One of `none`, `swc`, `tsc`, `rollup`, `vite`, `esbuild`.                                          |
| `preset`          | `string` | `none`        | No       | Framework preset. `react` also installs `@tactical-ddd/react`, the React runtime, and React generator defaults. One of `none`, `react`. |

> The generator is idempotent: re-running it refreshes the `nx.json` defaults and module-boundary rules and safely skips Shared Kernel libraries that already exist.
>
> If the linter is set to `none` (no ESLint config in the workspace), the module-boundary step is skipped with a warning — there is no linter to enforce the graph.

## Shared Kernel Generator

The `shared-kernel` generator is designed to automatically deploy the **Shared Kernel** within your Nx monorepo. This forms the absolute foundation of the entire application architecture, containing completely agnostic (not tied to any specific business domain) code that is reused across all other modules in the system.

## Usage

To run the generator, execute the following command in the root of your workspace:

```bash
nx g @tactical-ddd/nx:shared-kernel
```

The generator checks for the existence of libraries before creating them, making it safe to run multiple times to restore missing kernel layers.

## Options

| Option           | Type     | Default       | Required | Description                                                                                       |
| ---------------- | -------- | ------------- | -------- | ------------------------------------------------------------------------------------------------- |
| `directory`      | `string` | `libs/shared` | Yes      | Root folder the shared kernel libraries are generated into. Keeping `libs/shared` is recommended. |
| `prefix`         | `string` | —             | No       | Organization prefix used for the generated import paths, e.g. `@my-org`.                          |
| `linter`         | `string` | —             | Yes      | Linter to configure for the generated libraries. One of `eslint`, `none`.                         |
| `unitTestRunner` | `string` | —             | Yes      | Unit test runner to set up. One of `jest`, `vitest`, `none`.                                      |
| `bundler`        | `string` | `none`        | No       | Bundler used to build the libraries. One of `none`, `swc`, `tsc`, `rollup`, `vite`, `esbuild`.    |

When run interactively (or via Nx Console), the generator prompts for any required option that is not passed on the command line. Example with explicit flags:

```bash
nx g @tactical-ddd/nx:shared-kernel \
  --directory=libs/shared \
  --prefix=@my-org \
  --linter=eslint \
  --unitTestRunner=jest \
  --bundler=none
```

> Note: the `contracts` library is always generated without a unit test runner — it holds only compile-time types — regardless of the `unitTestRunner` value, which applies to `utils` and `infrastructure`.

## Architecture & Folder Structure

The generator creates three core libraries inside the `libs/shared/` directory:

```
libs/shared/
├── contracts/       # Global types, DTOs, and interfaces (no implementation)
├── utils/           # Pure helpers and utility functions
└── infrastructure/  # API clients, storage adapters, and loggers
```

### 1. 📦 contracts

**Nx Tags:** `scope:shared`, `type:contracts`

This is the lowest and most abstract layer of the application. It establishes the "social contracts" between different parts of the system and the backend.

- **What's inside:** Global TypeScript interfaces, data types, validation schemas (Zod/Yup), API response shapes (DTOs), and global domain event structures.
- **Default Interfaces:** Ships with two foundational infrastructure contracts — `HttpClient` and `Store` (see [Default Contracts](#default-contracts) below).
- **Features:** This library is generated without a unit test runner (`unitTestRunner: 'none'`) because it contains strictly compile-time types and interfaces that carry no executable logic.
- **Import Rule:** It is strictly forbidden to import anything into this library from any other modules in the workspace.

#### Default Contracts

The `contracts` library is not generated empty — it is seeded with two foundational infrastructure contracts that the rest of the architecture (notably `libs/shared/infrastructure`) is expected to implement. Each interface is paired with a DI token (`Symbol.for(...)`), so it can be bound and resolved through a dependency-injection container (e.g. Inversify) without leaking the concrete implementation. Both are re-exported from the library barrel (`index.ts`):

```ts
import { HttpClient, HttpClientOptions, Store } from '@my-org/shared-contracts';
```

| Interface    | DI Token       | Purpose                                                                         |
| ------------ | -------------- | ------------------------------------------------------------------------------- |
| `HttpClient` | `HttpClient.$` | Transport-agnostic HTTP contract (`get` / `post` / `put` / `patch` / `delete`). |
| `Store`      | `Store.$`      | Async key/value persistence contract (`set` / `get` / `delete`).                |

##### `HttpClient`

A framework- and library-agnostic HTTP boundary. Concrete implementations (Axios, Fetch, etc.) live in `libs/shared/infrastructure`; consumers depend only on this interface. The companion `HttpClientOptions` type carries per-request settings (e.g. `timeout`).

```ts
export type HttpClientOptions = {
  timeout: number;
};

export interface HttpClient {
  get<T>(url: string, options?: HttpClientOptions): Promise<T>;
  post<T, K = unknown>(
    url: string,
    data?: K,
    options?: HttpClientOptions,
  ): Promise<T>;
  put<T, K = unknown>(
    url: string,
    data?: K,
    options?: HttpClientOptions,
  ): Promise<T>;
  patch<T, K = unknown>(
    url: string,
    data?: K,
    options?: HttpClientOptions,
  ): Promise<T>;
  delete<T>(url: string, options?: HttpClientOptions): Promise<T>;
}

// DI token — bind your concrete client to this symbol.
export const HttpClient = {
  $: Symbol.for('HttpClient'),
};
```

##### `Store`

A generic, async key/value persistence boundary. Back it with `localStorage`, `IndexedDB`, an in-memory map, or any remote store — the contract stays the same.

```ts
export interface Store {
  set<T>(key: string, value: T): Promise<boolean>;
  get<T>(key: string): Promise<T | null>;
  delete(service: string): Promise<boolean>;
}

// DI token — bind your concrete store to this symbol.
export const Store = {
  $: Symbol.for('Store'),
};
```

### 2. 🛠 utils

**Nx Tags:** `scope:shared`, `type:utils`

A layer of general-purpose utilities designed to solve purely technical computation and data transformation tasks.

- **What's inside:** Pure functions for strings, arrays, date formatting, mathematical calculations, and custom domain-agnostic RxJS operators.
- **Features:** Functions in this library must not have side effects and must remain decoupled from the application state.
- **Import Rule:** Can only import types from `libs/shared/contracts`.

### 3. 🌐 infrastructure

**Nx Tags:** `scope:shared`, `type:infrastructure`

The I/O (Input/Output) implementation layer that integrates your system with the outside world. This is the technical heart of your application's infrastructure.

- **What's inside:**
  - HTTP/WebSocket client configurations (Axios instances, Fetch wrappers).
  - Base wrappers for browser storage (localStorage, IndexedDB).
  - Third-party service integrations (Sentry clients for logging, analytics trackers).
  - State management configurations (`@tanstack/query-core` / base cache providers).
- **Import Rule:** Can freely import contracts from `libs/shared/contracts` and pure helpers from `libs/shared/utils`.

## Module Boundaries & Isolation Rules

The generator automatically tags these projects with `scope:shared`. In your root linter configuration (`eslint.config.js`), strict boundaries are enforced for these tags:

1. **Isolation from Business Logic:** Code inside `libs/shared/*` never and under no circumstances can import code from business domains (`libs/auth/*`, `libs/payments/*`, etc.). The shared kernel is completely isolated from business logic.
2. **Linear Layer Dependencies:** A strict hierarchy is maintained within the kernel itself:
   - `contracts` knows about no one.
   - `utils` only knows about `contracts`.
   - `infrastructure` knows about both `contracts` and `utils`.

## Domain Generator

The `domain` generator scaffolds a single **bounded business domain** (e.g. `auth`, `payments`, `beneficiaries`) under `libs/[domain-name]/`. Each domain is isolated from every other domain and depends only on the Shared Kernel and — for collaboration — the **public contracts** of other domains.

It generates one library per selected layer, tags each with `scope:domain` plus its layer type and a domain tag (`domain:<name>`), and registers a per-domain module-boundary constraint that enforces the isolation described below.

### Layers

The `--layers` option selects which layers to generate (default: `contracts,core`):

| Layer       | Tags                             | Purpose                                                                                   |
| ----------- | -------------------------------- | ----------------------------------------------------------------------------------------- |
| `contracts` | `scope:domain`, `type:contracts` | Domain-specific types, events, and ports/API boundaries. The domain's **public surface**. |
| `core`      | `scope:domain`, `type:core`      | Pure business logic — entities, value objects, use cases, repository interfaces.          |
| `ui`        | `scope:domain`, `type:ui`        | Presentational components (a DOM lib is added to `tsconfig` for browser globals).         |
| `features`  | `scope:domain`, `type:features`  | UI + state, framework bindings, DI containers — the topmost layer.                        |

> Under `--preset=react`, the `ui` and `features` layers are generated as React libraries (via `@nx/react`, loaded only when the preset is set); otherwise they are framework-agnostic `@nx/js` libraries.

### Cross-domain isolation (published-language)

The generator injects a per-domain `@nx/enforce-module-boundaries` constraint so that a `domain:<name>` library may depend only on:

- its **own** domain (`domain:<name>`),
- the **Shared Kernel** (`scope:shared`),
- and the **public contracts of any other domain** (`type:contracts`).

This is the **published-language** pattern: a domain may depend on another domain's _abstraction_ (its contracts), but never on its _implementation_ (`core`/`ui`/`features`/`infrastructure`). The implementation stays hidden inside the domain and is provided across boundaries via dependency injection wired up in the composition root. Importing another domain's `core` fails the lint boundary check.

### Usage

```bash
nx g @tactical-ddd/nx:domain payments --directory=libs/payments
```

`prefix`, `linter`, `unitTestRunner` and `preset` are inherited from the `nx.json` defaults written by [`init`](#init-generator), so in a bootstrapped workspace only the domain name (and directory) are needed. Example with explicit flags:

```bash
nx g @tactical-ddd/nx:domain payments \
  --directory=libs/payments \
  --prefix=@my-org \
  --layers=contracts,core,features \
  --preset=react \
  --linter=eslint \
  --unitTestRunner=jest \
  --bundler=tsc
```

### Options

| Option           | Type       | Default          | Required | Description                                                                                                 |
| ---------------- | ---------- | ---------------- | -------- | ----------------------------------------------------------------------------------------------------------- |
| `name`           | `string`   | —                | Yes      | Domain name, also the `domain:<name>` tag. Passed as the first positional argument.                         |
| `directory`      | `string`   | —                | Yes      | Root folder the domain libraries are generated into, e.g. `libs/payments`.                                  |
| `layers`         | `string[]` | `contracts,core` | Yes      | Architectural layers to generate. Any of `contracts`, `core`, `ui`, `features`.                             |
| `prefix`         | `string`   | —                | No       | Organization prefix used for the generated library names, e.g. `@my-org`.                                   |
| `preset`         | `string`   | `none`           | No       | Framework preset for the `ui`/`features` layers. One of `none`, `react`.                                    |
| `linter`         | `string`   | —                | Yes      | Linter to configure for the generated libraries. One of `eslint`, `none`.                                   |
| `unitTestRunner` | `string`   | —                | No       | Unit test runner to set up. One of `jest`, `vitest`, `none`. (`contracts` is always generated without one.) |
| `bundler`        | `string`   | `tsc`            | No       | Bundler used to build the libraries. One of `none`, `swc`, `tsc`, `rollup`, `vite`, `esbuild`.              |

> The generator is idempotent: it checks for each layer's library before creating it, so re-running it safely fills in only the layers that are missing.
>
> If `libs/shared/contracts` does not exist yet, the generator warns you to run [`init`](#init-generator) (or [`shared-kernel`](#shared-kernel-generator)) first, since domain libraries depend on the Shared Kernel.
