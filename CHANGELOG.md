## 0.2.0 (2026-08-12)

### 🚀 Features

- **core:** add core types for remote data, subscribable streams, and facades ([44da2a0](https://github.com/kayun/tactical-ddd/commit/44da2a0))
- **core:** add comprehensive tests for `Facade` behaviors and type safety ([9721c07](https://github.com/kayun/tactical-ddd/commit/9721c07))
- **core:** add `@tactical-ddd/source` export condition in `package.json` ([08d9ba4](https://github.com/kayun/tactical-ddd/commit/08d9ba4))
- **core:** introduce `Repository` and `KeyValueStore` interfaces ([c6566fe](https://github.com/kayun/tactical-ddd/commit/c6566fe))
- **core:** add `AggregateRoot` implementation with tests and export ([b2ac347](https://github.com/kayun/tactical-ddd/commit/b2ac347))
- **core:** add `EventBus` and `InMemoryEventBus` implementation ([5fb1563](https://github.com/kayun/tactical-ddd/commit/5fb1563))
- **core:** enhance `EventBus` with customizable transport and error handling ([07dced3](https://github.com/kayun/tactical-ddd/commit/07dced3))
- **core:** add `InMemoryEventTransport` implementation and tests ([6af7557](https://github.com/kayun/tactical-ddd/commit/6af7557))
- **domain:** update `<%= interfaceName %>` to use `@tactical-ddd` facade types ([c22cc59](https://github.com/kayun/tactical-ddd/commit/c22cc59))
- **domain:** add `query` and `watch` methods to `<%= interfaceName %>` facade ([798248b](https://github.com/kayun/tactical-ddd/commit/798248b))
- **domain:** declare runtime kernel dependencies for generated libraries ([55122bb](https://github.com/kayun/tactical-ddd/commit/55122bb))
- **domain:** update facade scaffolding to use runtime kernel types ([6cd5f45](https://github.com/kayun/tactical-ddd/commit/6cd5f45))
- **eslint:** improve module boundary rules for nested folder imports in Clean Architecture ([0c6f480](https://github.com/kayun/tactical-ddd/commit/0c6f480))
- **eslint:** add Vue support to external require exemption ([b9236b7](https://github.com/kayun/tactical-ddd/commit/b9236b7))
- **eslint:** extend ignored files to include generator templates ([9266773](https://github.com/kayun/tactical-ddd/commit/9266773))
- **init:** add Vue preset to workspace generator ([3424a0b](https://github.com/kayun/tactical-ddd/commit/3424a0b))
- **nx:** add `agents-context-sync` generator for tactical ddd ADR management ([a356a3c](https://github.com/kayun/tactical-ddd/commit/a356a3c))
- **nx:** add Tactical DDD architecture decision records and syncing mechanism ([84e89d6](https://github.com/kayun/tactical-ddd/commit/84e89d6))
- **nx:** enhance `sync-publish-package-json` and refactor `init` generator for ADR syncing ([abae8a1](https://github.com/kayun/tactical-ddd/commit/abae8a1))
- **nx:** document TD-0008, TD-0009, and TD-0010 in new ADRs for tactical DDD design ([b40f563](https://github.com/kayun/tactical-ddd/commit/b40f563))
- **nx:** strip `@tactical-ddd/source` condition from `exports` in publish package.json ([71227b3](https://github.com/kayun/tactical-ddd/commit/71227b3))
- **react:** add `useObserved` hook for subscribing to domain streams ([24e0cb1](https://github.com/kayun/tactical-ddd/commit/24e0cb1))
- **react:** add `@tactical-ddd/core` as peerDependency and external in Vite config ([ca50151](https://github.com/kayun/tactical-ddd/commit/ca50151))
- **react:** add `useWatch` hook for reactive watch state management ([e904c02](https://github.com/kayun/tactical-ddd/commit/e904c02))
- **scripts:** rewrite local dependencies to exact e2e version before release ([d610486](https://github.com/kayun/tactical-ddd/commit/d610486))
- **utils:** add core runtime dependency management utilities ([5e4566d](https://github.com/kayun/tactical-ddd/commit/5e4566d))
- **vue:** add Vue package with library setup and tooling ([8ce6d2a](https://github.com/kayun/tactical-ddd/commit/8ce6d2a))
- **vue:** add `useObserved` composable for domain stream subscriptions ([05b4e58](https://github.com/kayun/tactical-ddd/commit/05b4e58))
- **vue:** enhance package metadata, build config, and tooling ([40abfac](https://github.com/kayun/tactical-ddd/commit/40abfac))
- **vue:** add `useWatch` composable for reactive watch management ([edcbcc8](https://github.com/kayun/tactical-ddd/commit/edcbcc8))
- **vue:** add custom resolve conditions to support sibling package imports in tests ([07407fd](https://github.com/kayun/tactical-ddd/commit/07407fd))
- **vue:** integrate Vue preset into domain generator ([f547331](https://github.com/kayun/tactical-ddd/commit/f547331))

### ❤️ Thank You

- Artyom Kayun @kayun

## 0.1.5 (2026-08-05)

This was a version bump only, there were no code changes.

## 0.1.4 (2026-08-05)

### 🚀 Features

- **core:** add base `Entity` class and `EntityId` type with tests ([9dec73d](https://github.com/kayun/tactical-ddd/commit/9dec73d))
- **core:** add base `ValueObject` class with structural equality and tests ([11b44cd](https://github.com/kayun/tactical-ddd/commit/11b44cd))
- **core:** add `DomainError` base class and specific error types with tests ([bc92d68](https://github.com/kayun/tactical-ddd/commit/bc92d68))

### ❤️ Thank You

- Artyom Kayun @kayun

## 0.1.3 (2026-08-03)

### 🚀 Features

- **core:** initialize `@tactical-ddd/core` package with MIT license, README, and setup files ([ca02db7](https://github.com/kayun/tactical-ddd/commit/ca02db7))
- **core:** add `UseCase` interface with documentation and export ([331d4d9](https://github.com/kayun/tactical-ddd/commit/331d4d9))

### ❤️ Thank You

- Artyom Kayun @kayun

## 0.1.2 (2026-07-06)

### 🚀 Features

- add React Native preset support for `init` and `domain` generators ([babeb41](https://github.com/kayun/tactical-ddd/commit/babeb41))

### ❤️ Thank You

- Artyom Kayun @kayun

## 0.1.1 (2026-06-30)

This was a version bump only, there were no code changes.

## 0.1.0 (2026-06-30)

This was a version bump only, there were no code changes.

## 0.0.3 (2026-06-29)

This was a version bump only, there were no code changes.

## 0.0.2 (2026-06-29)

### 🚀 Features

- **domain:** add e2e tests and layer generation for `domain` generator ([70716f8](https://github.com/kayun/tactical-ddd/commit/70716f8))
- **domain:** enforce published-language pattern for cross-domain imports ([2ed1933](https://github.com/kayun/tactical-ddd/commit/2ed1933))
- **domain:** enforce Clean Architecture layering and enhance domain generator ([8397032](https://github.com/kayun/tactical-ddd/commit/8397032))
- **domain:** add scaffolding for Clean Architecture default folders with `.gitkeep` ([26f4ad6](https://github.com/kayun/tactical-ddd/commit/26f4ad6))
- **domain:** add facade scaffolding and lint validations for generated libraries ([b0cdf29](https://github.com/kayun/tactical-ddd/commit/b0cdf29))
- **domain:** centralize React runtime management for React preset domains ([c48aae1](https://github.com/kayun/tactical-ddd/commit/c48aae1))
- **e2e:** add support for multiple Nx major versions in e2e tests ([6c19bbc](https://github.com/kayun/tactical-ddd/commit/6c19bbc))
- **eslint:** add utilities for managing module boundaries in ESLint configs ([0c88efc](https://github.com/kayun/tactical-ddd/commit/0c88efc))
- **eslint:** add `@nx/react` to ignoredDependencies in module boundary rule ([01a0f16](https://github.com/kayun/tactical-ddd/commit/01a0f16))
- **init:** enhance React preset handling and improve cleanup utility ([2842426](https://github.com/kayun/tactical-ddd/commit/2842426))
- **logger:** introduce logger utility with tagged, colorized output ([02e31f8](https://github.com/kayun/tactical-ddd/commit/02e31f8))
- **nx:** enhance shared-kernel generator with configurable prefix, linter, test runner, and bundler options ([1f0118a](https://github.com/kayun/tactical-ddd/commit/1f0118a))
- **nx:** add resolveLibraryModuleFormat utility with unit tests detailing module format resolution logic ([11420a1](https://github.com/kayun/tactical-ddd/commit/11420a1))
- **nx:** extend shared-kernel generator with module format support and file generation updates ([dbeab2a](https://github.com/kayun/tactical-ddd/commit/dbeab2a))
- **nx:** add `init` generator for initializing new Nx workspace configurations ([cf97a10](https://github.com/kayun/tactical-ddd/commit/cf97a10))
- **nx:** enhance `init` generator to configure organization-wide defaults ([7c03774](https://github.com/kayun/tactical-ddd/commit/7c03774))
- **nx:** enforce Tactical DDD architecture via module boundaries in `init` generator ([6515f5a](https://github.com/kayun/tactical-ddd/commit/6515f5a))
- **nx:** extend `init` generator with shared kernel setup and configurable options ([a6892ee](https://github.com/kayun/tactical-ddd/commit/a6892ee))
- **nx:** propagate and persist default configs to built-in library generators ([4dc486d](https://github.com/kayun/tactical-ddd/commit/4dc486d))
- **nx:** ensure dependency installation in `init` generator ([f87be4d](https://github.com/kayun/tactical-ddd/commit/f87be4d))
- **nx:** add React preset support in `init` generator ([3e631cc](https://github.com/kayun/tactical-ddd/commit/3e631cc))
- **nx:** handle empty directories during shared kernel scaffolding ([028d81b](https://github.com/kayun/tactical-ddd/commit/028d81b))
- **nx:** add `domain` generator for Tactical DDD library scaffolding ([dd1f5c4](https://github.com/kayun/tactical-ddd/commit/dd1f5c4))
- **react:** add initial setup for @tactical-ddd/react library with Nx configuration, build tools, and testing setup ([1568bdb](https://github.com/kayun/tactical-ddd/commit/1568bdb))
- **react:** add MIT license, author details, and publish asset copying to @tactical-ddd/react configuration ([82d334c](https://github.com/kayun/tactical-ddd/commit/82d334c))
- **react:** add `createComposeProviders` utility with tests, documentation, and README updates ([59864bd](https://github.com/kayun/tactical-ddd/commit/59864bd))
- **shared-kernel:** add README templates and prefix support for generated libraries ([3fd0a7d](https://github.com/kayun/tactical-ddd/commit/3fd0a7d))
- **test-utils/e2e:** add workspace type support for Nx strategies in test utilities and specs ([0672e42](https://github.com/kayun/tactical-ddd/commit/0672e42))

### 🩹 Fixes

- **eslint:** add compatibility layer for loading ESLint config utils across Nx versions ([de1612e](https://github.com/kayun/tactical-ddd/commit/de1612e))

### ❤️ Thank You

- Artyom Kayun @kayun

## 0.0.2-alpha.3 (2026-06-29)

### 🚀 Features

- **init:** enhance React preset handling and improve cleanup utility ([2842426](https://github.com/kayun/tactical-ddd/commit/2842426))
- **shared-kernel:** add README templates and prefix support for generated libraries ([3fd0a7d](https://github.com/kayun/tactical-ddd/commit/3fd0a7d))
- **test-utils/e2e:** add workspace type support for Nx strategies in test utilities and specs ([0672e42](https://github.com/kayun/tactical-ddd/commit/0672e42))

### ❤️ Thank You

- Artyom Kayun @kayun

## 0.0.2-alpha.2 (2026-06-26)

### 🚀 Features

- **domain:** add e2e tests and layer generation for `domain` generator ([70716f8](https://github.com/kayun/tactical-ddd/commit/70716f8))
- **domain:** enforce published-language pattern for cross-domain imports ([2ed1933](https://github.com/kayun/tactical-ddd/commit/2ed1933))
- **domain:** enforce Clean Architecture layering and enhance domain generator ([8397032](https://github.com/kayun/tactical-ddd/commit/8397032))
- **domain:** add scaffolding for Clean Architecture default folders with `.gitkeep` ([26f4ad6](https://github.com/kayun/tactical-ddd/commit/26f4ad6))
- **domain:** add facade scaffolding and lint validations for generated libraries ([b0cdf29](https://github.com/kayun/tactical-ddd/commit/b0cdf29))
- **e2e:** add support for multiple Nx major versions in e2e tests ([6c19bbc](https://github.com/kayun/tactical-ddd/commit/6c19bbc))
- **eslint:** add utilities for managing module boundaries in ESLint configs ([0c88efc](https://github.com/kayun/tactical-ddd/commit/0c88efc))
- **eslint:** add `@nx/react` to ignoredDependencies in module boundary rule ([01a0f16](https://github.com/kayun/tactical-ddd/commit/01a0f16))
- **logger:** introduce logger utility with tagged, colorized output ([02e31f8](https://github.com/kayun/tactical-ddd/commit/02e31f8))
- **nx:** add `init` generator for initializing new Nx workspace configurations ([cf97a10](https://github.com/kayun/tactical-ddd/commit/cf97a10))
- **nx:** enhance `init` generator to configure organization-wide defaults ([7c03774](https://github.com/kayun/tactical-ddd/commit/7c03774))
- **nx:** enforce Tactical DDD architecture via module boundaries in `init` generator ([6515f5a](https://github.com/kayun/tactical-ddd/commit/6515f5a))
- **nx:** extend `init` generator with shared kernel setup and configurable options ([a6892ee](https://github.com/kayun/tactical-ddd/commit/a6892ee))
- **nx:** propagate and persist default configs to built-in library generators ([4dc486d](https://github.com/kayun/tactical-ddd/commit/4dc486d))
- **nx:** ensure dependency installation in `init` generator ([f87be4d](https://github.com/kayun/tactical-ddd/commit/f87be4d))
- **nx:** add React preset support in `init` generator ([3e631cc](https://github.com/kayun/tactical-ddd/commit/3e631cc))
- **nx:** handle empty directories during shared kernel scaffolding ([028d81b](https://github.com/kayun/tactical-ddd/commit/028d81b))
- **nx:** add `domain` generator for Tactical DDD library scaffolding ([dd1f5c4](https://github.com/kayun/tactical-ddd/commit/dd1f5c4))

### 🩹 Fixes

- **eslint:** add compatibility layer for loading ESLint config utils across Nx versions ([de1612e](https://github.com/kayun/tactical-ddd/commit/de1612e))

### ❤️ Thank You

- Artyom Kayun @kayun

## 0.0.2-alpha.1 (2026-06-26)

### 🚀 Features

- **domain:** add e2e tests and layer generation for `domain` generator ([70716f8](https://github.com/kayun/tactical-ddd/commit/70716f8))
- **domain:** enforce published-language pattern for cross-domain imports ([2ed1933](https://github.com/kayun/tactical-ddd/commit/2ed1933))
- **domain:** enforce Clean Architecture layering and enhance domain generator ([8397032](https://github.com/kayun/tactical-ddd/commit/8397032))
- **domain:** add scaffolding for Clean Architecture default folders with `.gitkeep` ([26f4ad6](https://github.com/kayun/tactical-ddd/commit/26f4ad6))
- **domain:** add facade scaffolding and lint validations for generated libraries ([b0cdf29](https://github.com/kayun/tactical-ddd/commit/b0cdf29))
- **eslint:** add utilities for managing module boundaries in ESLint configs ([0c88efc](https://github.com/kayun/tactical-ddd/commit/0c88efc))
- **eslint:** add `@nx/react` to ignoredDependencies in module boundary rule ([01a0f16](https://github.com/kayun/tactical-ddd/commit/01a0f16))
- **logger:** introduce logger utility with tagged, colorized output ([02e31f8](https://github.com/kayun/tactical-ddd/commit/02e31f8))
- **nx:** add `init` generator for initializing new Nx workspace configurations ([cf97a10](https://github.com/kayun/tactical-ddd/commit/cf97a10))
- **nx:** enhance `init` generator to configure organization-wide defaults ([7c03774](https://github.com/kayun/tactical-ddd/commit/7c03774))
- **nx:** enforce Tactical DDD architecture via module boundaries in `init` generator ([6515f5a](https://github.com/kayun/tactical-ddd/commit/6515f5a))
- **nx:** extend `init` generator with shared kernel setup and configurable options ([a6892ee](https://github.com/kayun/tactical-ddd/commit/a6892ee))
- **nx:** propagate and persist default configs to built-in library generators ([4dc486d](https://github.com/kayun/tactical-ddd/commit/4dc486d))
- **nx:** ensure dependency installation in `init` generator ([f87be4d](https://github.com/kayun/tactical-ddd/commit/f87be4d))
- **nx:** add React preset support in `init` generator ([3e631cc](https://github.com/kayun/tactical-ddd/commit/3e631cc))
- **nx:** handle empty directories during shared kernel scaffolding ([028d81b](https://github.com/kayun/tactical-ddd/commit/028d81b))
- **nx:** add `domain` generator for Tactical DDD library scaffolding ([dd1f5c4](https://github.com/kayun/tactical-ddd/commit/dd1f5c4))

### ❤️ Thank You

- Artyom Kayun @kayun

## 0.0.2-alpha.0 (2026-06-23)

### 🚀 Features

- **react:** add initial setup for @tactical-ddd/react library with Nx configuration, build tools, and testing setup ([1568bdb](https://github.com/kayun/tactical-ddd/commit/1568bdb))
- **react:** add MIT license, author details, and publish asset copying to @tactical-ddd/react configuration ([82d334c](https://github.com/kayun/tactical-ddd/commit/82d334c))
- **react:** add `createComposeProviders` utility with tests, documentation, and README updates ([59864bd](https://github.com/kayun/tactical-ddd/commit/59864bd))

### ❤️ Thank You

- Artyom Kayun @kayun

## 0.0.1-alpha.3 (2026-06-23)

### 🚀 Features

- **nx:** add resolveLibraryModuleFormat utility with unit tests detailing module format resolution logic ([11420a1](https://github.com/kayun/tactical-ddd/commit/11420a1))
- **nx:** extend shared-kernel generator with module format support and file generation updates ([dbeab2a](https://github.com/kayun/tactical-ddd/commit/dbeab2a))

### ❤️ Thank You

- Artyom Kayun @kayun

## 0.0.1-alpha.2 (2026-06-22)

### 🚀 Features

- **nx:** enhance shared-kernel generator with configurable prefix, linter, test runner, and bundler options ([1f0118a](https://github.com/kayun/tactical-ddd/commit/1f0118a))

### ❤️ Thank You

- Artyom Kayun @kayun

## 0.0.1-alpha.1 (2026-06-22)

This was a version bump only, there were no code changes.

## 0.0.1-alpha.0 (2026-06-22)

This was a version bump only, there were no code changes.
