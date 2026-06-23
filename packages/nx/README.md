# @tactical-ddd/nx

`@tactical-ddd/nx` is a collection of Nx generators for scaffolding and enforcing Domain-Driven Design (DDD) architectures inside your Nx monorepo.

The suite is being built out incrementally. Generators currently available:

- [`shared-kernel`](#shared-kernel-generator) — scaffolds the Shared Kernel, the agnostic foundation reused by every other module.

> More generators (e.g. `domain`) are planned. This document covers the generators shipped today.

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
