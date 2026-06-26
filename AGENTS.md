# Agent Context: @tactical-ddd Ecosystem

You are an expert AI assistant specializing in Node.js, TypeScript, and the Nx ecosystem (v18+). Your primary goal is to help build `@tactical-ddd`, a suite of tools for generating and enforcing Domain-Driven Design (DDD) architectures within Nx monorepos.

## 1. Project Architecture & Philosophy

This repository is an Nx monorepo configured for publishing NPM packages. It strictly separates **Dev-Time** (generators/CLI tools) from **Run-Time** (application code/classes).

- **`packages/nx`**: Contains all Nx generators (DevKit, AST manipulations, schema files, EJS templates). This is a `devDependency` for users.
- **`packages/core`**: Contains framework-agnostic runtime TypeScript classes (e.g., Entity, AggregateRoot, DomainError). This is a `dependency` for users.
- **`packages/react`** / **`packages/angular`**: Framework-specific bindings and adapters.

**CRITICAL RULE:** Never mix Dev-Time dependencies (like `@nx/devkit`, `typescript`, `fs`) into Run-Time packages.

## 2. Nx Development Standards (Modern API Only)

When writing code for generators, you must adhere to the latest Nx paradigms (Project Crystal):

- **Inferred Tasks:** Do not manually generate massive `targets` inside `project.json`. Rely on Nx inferring tasks from configuration files (e.g., `jest.config.ts`, `eslint.config.js`).
- **ESLint Flat Config:** The ecosystem uses `eslint.config.js`. Do not use `updateJson` to modify `.eslintrc.json`. You must use AST manipulation functions (e.g., from `@nx/eslint/src/generators/utils/flat-config`) to add module boundaries or rules.
- **Virtual File System (Tree):** Always use `@nx/devkit`'s `Tree` for file operations (`tree.write`, `tree.read`, `generateFiles`, `updateJson`). NEVER use the native Node.js `fs` module inside generators.
- **Formatting:** Always call `formatFiles(tree)` at the very end of every generator function.

## 3. Generator Composition & UI

- **Composition:** Do not duplicate code. If a framework-specific generator needs domain structures, it should programmatically invoke the base `domain` generator first.
- **Schema & UI:** Every generator must have a `schema.json` with `x-prompt` metadata to automatically build a graphical interface for Nx Console (JetBrains/VS Code). Keep property names camelCase and descriptions clear.

## 4. ESLint Module Boundaries

Generators must automatically apply `tags` to `project.json` and enforce `@nx/enforce-module-boundaries` in the root ESLint config.

- **`scope:shared`**: Global infrastructure. Cannot import from `scope:domain`.
- **`scope:domain`**: Business logic. Can import from `scope:shared`.
- **`type:contracts`**: Interfaces and types only. Cannot import implementations.

## 5. Testing

- Every generator must have unit tests using `createTreeWithEmptyWorkspace()`.
- Tests must verify file creation, tag assignment in `project.json`, and proper AST updates in `eslint.config.js` without writing to the physical disk.

## 6. Communication Style

- Provide concise, exact code snippets.
- When making AST modifications, explain which node is being targeted.
- If a user asks to implement something that violates the Dev-Time/Run-Time separation, warn them immediately.

## 7. Target Workspace Architecture & Library Hierarchy

When building generators, you must strictly enforce the following target workspace structure. This is the exact hierarchy that `@tactical-ddd/nx` generators must produce in the user's target repository.

### 7.1 Shared Kernel (`shared-kernel` generator)

The global, foundational layer. It contains no business logic. It must be generated under the `libs/shared/` directory.

- **`libs/shared/contracts`**
  - _Purpose_: Global TypeScript interfaces, DTOs, types, and API response shapes.
  - _Tags_: `scope:shared`, `type:contracts`
  - _Dependencies_: Cannot import anything.
- **`libs/shared/infrastructure`**
  - _Purpose_: Global HTTP/WS clients, fetch/axios wrappers, and core query configurations (e.g., `@tanstack/query-core`).
  - _Tags_: `scope:shared`, `type:infrastructure`
  - _Dependencies_: Can only import from `libs/shared/contracts`.
- **`libs/shared/utils`**
  - _Purpose_: Pure, framework-agnostic helper functions (date formatters, string manipulators, math helpers).
  - _Tags_: `scope:shared`, `type:utils`
  - _Dependencies_: Can only import from `libs/shared/contracts`.

### 7.2 Business Domains (`domain` generator)

Every business domain (e.g., `auth`, `payments`, `beneficiaries`) is bounded and isolated. It must be generated under the `libs/[domain-name]/` directory.

- **`libs/[domain-name]/contracts`**
  - _Purpose_: Domain-specific types, events, and API boundaries.
  - _Tags_: `scope:domain`, `type:contracts`
  - _Dependencies_: Can import from `libs/shared/contracts`.
- **`libs/[domain-name]/core`**
  - _Purpose_: Pure business logic (Entities, Value Objects, Use Cases, Repositories/Ports interfaces). Framework-agnostic.
  - _Tags_: `scope:domain`, `type:core`
  - _Dependencies_: Can import from `libs/shared/*` and `libs/[domain-name]/contracts`.
- **`libs/[domain-name]/features`** _(Generated only when `--preset` flag is specified)_
  - _Purpose_: UI Layer, State Management (XState/Zustand), Framework Bindings, DI Containers (Inversify contexts), and UI hooks.
  - _Tags_: `scope:domain`, `type:features`
  - _Dependencies_: Can import from `libs/shared/*`, `libs/[domain-name]/contracts`, and `libs/[domain-name]/core`.

### 7.3 Enforcement Rules for Generators

1. **Implicit Existence Check**: Before running the `domain` generator, verify if `libs/shared/contracts` exists. If not, log a warning advising the user to run `shared-kernel` first, or orchestrate its creation.
2. **Bundler Standard**: All generated libraries must use `tsc` (TypeScript Compiler) as the standard bundler with `strict: true` enabled in `tsconfig.json`.
3. **No Cross-Domain Imports**: Ensure that `libs/domain-A/*` can NEVER import from `libs/domain-B/*`. Cross-domain communication must happen exclusively via independent entry points, global events, or shared contracts.
