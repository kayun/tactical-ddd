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
- **Features:** This library is generated without a unit test runner (`unitTestRunner: 'none'`) because it contains strictly compile-time types and interfaces that carry no executable logic.
- **Import Rule:** It is strictly forbidden to import anything into this library from any other modules in the workspace.

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
