[![npm version](https://img.shields.io/npm/v/@tactical-ddd/core)](https://www.npmjs.com/package/@tactical-ddd/core)
[![npm downloads](https://img.shields.io/npm/dm/@tactical-ddd/core)](https://www.npmjs.com/package/@tactical-ddd/core)
[![license](https://img.shields.io/npm/l/@tactical-ddd/core)](https://github.com/kayun/tactical-ddd/blob/main/LICENSE)
[![CI](https://github.com/kayun/tactical-ddd/actions/workflows/ci.yml/badge.svg)](https://github.com/kayun/tactical-ddd/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/kayun/tactical-ddd/branch/main/graph/badge.svg)](https://codecov.io/gh/kayun/tactical-ddd)

# @tactical-ddd/core

`@tactical-ddd/core` is the runtime kernel of the `@tactical-ddd` ecosystem — the framework-agnostic base classes and contracts that domain logic is written against in workspaces structured around Domain-Driven Design (DDD) and Clean Architecture.

It has no dependency on any UI framework, HTTP client, or build tool: the building blocks here are meant to live in the `libs/[domain]/core` layer, which must stay pure.

## Philosophy

- **Runtime, not dev-time.** This package is a regular `dependency` of the consuming app. The generators that scaffold the architecture live separately in [`@tactical-ddd/nx`](https://www.npmjs.com/package/@tactical-ddd/nx) as a `devDependency`.
- **Framework-agnostic.** Nothing here imports React, Angular, or Node APIs, so the same primitives are shared by web, native, and server code.
- **Contracts first.** The primitives describe the shape of a domain (use cases, entities, errors) without dictating how they are wired — dependency injection and state management stay in the feature layer.

The suite is being built out incrementally. Primitives currently available:

- [`UseCase`](#usecase) — the single-entry-point contract for application use cases.

> Entities, value objects, aggregate roots, and domain errors are planned. This document covers what ships today.

## Installation

```bash
npm install @tactical-ddd/core
```

## Primitives

### UseCase

A use case is one unit of application behaviour with exactly one entry point — `execute`. Typing it through a shared contract keeps every use case in the workspace uniform and makes them trivially interchangeable behind a facade or a DI container.

```ts
export interface UseCase<TArgs extends unknown[], TResult> {
  execute(...args: TArgs): TResult;
}
```

`TArgs` is the tuple of call arguments and `TResult` is the return type, which may be synchronous or a `Promise`.

```ts
import type { UseCase } from '@tactical-ddd/core';

export class SignInUseCase implements UseCase<
  [credentials: Credentials],
  Promise<Session>
> {
  constructor(private readonly authRepository: AuthRepository) {}

  async execute(credentials: Credentials): Promise<Session> {
    return this.authRepository.signIn(credentials);
  }
}
```

Because the contract is a plain interface, it disappears at runtime — no base class to extend and no constructor to call `super()` on.

## Running unit tests

Run `nx test @tactical-ddd/core` to execute the unit tests via [Jest](https://jestjs.io/).
