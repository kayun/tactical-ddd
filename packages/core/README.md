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

- [`Entity`](#entity) — an object defined by its identity.
- [`ValueObject`](#valueobject) — an object defined by its attributes.
- [`DomainError`](#domainerror) — an invariant violation, distinguishable from an infrastructure failure.
- [`UseCase`](#usecase) — the single-entry-point contract for application use cases.

> Aggregate roots and domain events are planned. This document covers what ships today.

## Installation

```bash
npm install @tactical-ddd/core
```

## Primitives

### Entity

An entity is an object that is defined by **who it is**, not by what it currently holds. Two entities of the same type with the same `id` are the same thing even if every other field differs — a PIN credential whose failed-attempt counter changed is still the credential of that account.

```ts
export abstract class Entity<TId extends EntityId = string> {
  protected constructor(identity: TId);
  get id(): TId;
  equals(other?: Entity<TId> | null): boolean;
}
```

```ts
import { Entity } from '@tactical-ddd/core';

export class PinCredential extends Entity {
  private constructor(
    sub: string,
    readonly attempts: number,
  ) {
    super(sub);
  }

  static create(sub: string): PinCredential {
    return new PinCredential(sub, 0);
  }

  registerFailure(): PinCredential {
    // Same identity, new state.
    return new PinCredential(this.id, this.attempts + 1);
  }
}

const credential = PinCredential.create('user-1');
credential.registerFailure().equals(credential); // true
```

Worth knowing:

- **Mutability is your choice.** The base class says nothing about it: identity is carried by `id`, not by the state, so immutable entities that return a new instance on every change are as valid as mutable ones.
- **Different types are never equal**, even with matching ids. The check compares constructor identity rather than class names, so it also survives minification. A subclass instance is therefore not equal to a base-class instance — override `equals` if a hierarchy needs a looser rule.
- **Identity may be a value object.** `EntityId` accepts primitives (`string`, `number`, `bigint`, `symbol`) and anything that implements `equals`, in which case comparison is delegated to it instead of comparing references.

### ValueObject

A value object is defined by **what it holds**. Any two instances of the same type with equal attributes are interchangeable — `Pin.create('1234')` can replace any other `Pin.create('1234')`, whereas an entity stays itself across attribute changes.

```ts
export abstract class ValueObject {
  equals(other?: ValueObject | null): boolean;
}
```

```ts
import { ValueObject } from '@tactical-ddd/core';

export class Pin extends ValueObject {
  private constructor(readonly value: string) {
    super();
  }

  static create(raw: string): Pin {
    if (!/^\d{4,}$/.test(raw)) {
      throw new Error('PIN must be at least four digits');
    }

    return new Pin(raw);
  }

  /** Derived from the attributes, so not part of equality. */
  get length(): number {
    return this.value.length;
  }
}

Pin.create('1234').equals(Pin.create('1234')); // true
```

Worth knowing:

- **No `props` bag required.** Equality walks the instance's own properties, so the idiomatic style — `readonly` constructor parameters — works as is, and existing classes can adopt the base without being restructured.
- **Getters stay out of equality.** They live on the prototype and are derived from the attributes; including them would compare the same data twice.
- **Nested value objects compare themselves.** Any attribute that implements `equals` is asked directly, so a value object composed of value objects behaves correctly. `Date` values are compared by time, arrays element by element (order matters), and plain objects recursively by key.
- **Different types are never equal**, even with identical attributes — same constructor-identity check as `Entity`.
- **Keep them immutable.** Create a new instance instead of mutating one, otherwise equality silently changes meaning over time.

### DomainError

A domain error marks a **broken invariant** — "this is not allowed" — as opposed to an infrastructure failure such as an unreachable network or an unreadable keychain entry, which means "this did not work right now". Callers can tell the two apart with a single `instanceof` check and decide whether to show a message or retry.

```ts
export abstract class DomainError extends Error {
  protected constructor(name: string, message: string);
}
```

```ts
import { DomainError } from '@tactical-ddd/core';

export class InvalidPinError extends DomainError {
  constructor(message: string) {
    super('InvalidPinError', message);
  }
}

try {
  Pin.create('12');
} catch (error) {
  if (error instanceof DomainError) {
    // A rule was violated — report it to the user as is.
  }
}
```

Worth knowing:

- **The name is passed explicitly** rather than read from `new.target.name`, because class names are mangled by production minifiers and `error.name` would end up as noise in logs.
- **The prototype chain is restored** in the constructor, so `instanceof` keeps working even when the class is transpiled down to ES5.

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

## Entity or value object?

| Question                                             | Entity                         | Value object                                 |
| ---------------------------------------------------- | ------------------------------ | -------------------------------------------- |
| Does it stay itself when its fields change?          | Yes — identity is separate     | No — a different value is a different object |
| Are two instances with equal fields interchangeable? | No                             | Yes                                          |
| Compared by                                          | `id`                           | all own attributes                           |
| Typical example                                      | account, order, PIN credential | PIN, money, date range, policy               |

## Running unit tests

Run `nx test @tactical-ddd/core` to execute the unit tests via [Jest](https://jestjs.io/).
