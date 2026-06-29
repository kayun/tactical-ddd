# @tactical-ddd

[![CI](https://github.com/kayun/tactical-ddd/actions/workflows/ci.yml/badge.svg)](https://github.com/kayun/tactical-ddd/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/kayun/tactical-ddd/branch/main/graph/badge.svg)](https://codecov.io/gh/kayun/tactical-ddd)
[![license](https://img.shields.io/npm/l/@tactical-ddd/nx)](https://github.com/kayun/tactical-ddd/blob/main/LICENSE)

A suite of tools for generating and enforcing **Domain-Driven Design (DDD)** architectures inside [Nx](https://nx.dev) monorepos.

The ecosystem deliberately separates two concerns:

- **Dev-time** — Nx generators that scaffold a bounded, tag-isolated library structure and wire up module-boundary rules. Installed as a `devDependency`.
- **Run-time** — framework-agnostic building blocks (Entities, Value Objects, Aggregates, Domain Errors, …) and framework bindings, consumed as regular `dependencies`.

The goal: a single command lays down a consistent `libs/` hierarchy (shared kernel + bounded domains), tags every project, and enforces who is allowed to import whom — so the architecture stays clean as the codebase grows.

## 📦 Packages

| Package                                           | Description                                                                                                                               | Status       |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| [`@tactical-ddd/nx`](packages/nx/README.md)       | Nx generators for scaffolding and enforcing DDD architecture (workspace bootstrap, shared kernel, bounded domains, module boundaries).    | ✅ Available |
| [`@tactical-ddd/react`](packages/react/README.md) | Shared, domain-agnostic React building blocks (components, hooks, utilities) for DDD / Clean Architecture apps — works in web and native. | ✅ Available |

> **Roadmap.** More run-time packages are planned: `@tactical-ddd/core` (framework-agnostic DDD primitives) and the `@tactical-ddd/angular` framework binding. They are not published yet.

## 🚀 Getting Started

```bash
# Install dependencies
npm install

# Build all publishable packages (produces a publish-ready dist/ per package)
npx nx run-many -t build

# Run unit tests
npx nx run-many -t test

# Lint all projects
npx nx run-many -t lint

# Run the end-to-end suite (publishes to a local registry, then exercises
# the generators inside a freshly created Nx workspace)
npx nx run @tactical-ddd/nx-e2e:e2e

# Visualize the project graph
npx nx graph
```

Using the published generators in your own workspace:

```bash
npm install -D @tactical-ddd/nx

# Recommended: bootstrap the whole workspace in one step — generator defaults,
# module-boundary lint rules, and the Shared Kernel (libs/shared/*). Add
# --preset=react to also install @tactical-ddd/react and the React tooling.
nx g @tactical-ddd/nx:init --prefix=@my-org --linter=eslint --unitTestRunner=jest

# Scaffold a bounded business domain (libs/payments/{contracts,core,...}).
# Cross-domain imports are restricted to other domains' public contracts.
nx g @tactical-ddd/nx:domain payments --directory=libs/payments

# …or scaffold just the Shared Kernel on its own:
nx g @tactical-ddd/nx:shared-kernel
```

Add the run-time React building blocks where you need them:

```bash
npm install @tactical-ddd/react
```

See the [`@tactical-ddd/nx` README](packages/nx/README.md) for the full generator catalog and the target workspace structure it produces, and the [`@tactical-ddd/react` README](packages/react/README.md) for the available React utilities.

## 📁 Repository Structure

```
├── packages/
│   ├── nx/        @tactical-ddd/nx      — Nx generators (publishable, dev-time)
│   ├── react/     @tactical-ddd/react   — shared React building blocks (publishable, run-time)
│   └── nx-e2e/    @tactical-ddd/nx-e2e  — end-to-end tests for the generators (private)
├── tools/scripts/ — build & local-registry helpers
├── nx.json        — Nx configuration and release setup
└── tsconfig.base.json
```

## 🤝 Contributing

- Every generator ships with unit tests (`createTreeWithEmptyWorkspace`) and is covered by the e2e suite running against a real Nx workspace.
- Generators must use the modern Nx API (the virtual `Tree`, inferred tasks, ESLint flat config) and keep dev-time and run-time dependencies strictly separated.

## 🔗 Learn More

- [Nx Documentation](https://nx.dev)
- [Enforce Module Boundaries](https://nx.dev/features/enforce-module-boundaries)
- [Nx Generators](https://nx.dev/extending-nx/recipes/local-generators)
- [Manage Releases](https://nx.dev/features/manage-releases)
