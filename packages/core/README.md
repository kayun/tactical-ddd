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
- [`Subscribable`](#subscribable) — the minimal shape of a stream, with no stream library attached.
- [`Remote`](#remote) — the state of remotely held data: its value and its freshness together.
- [`Facade`](#facade) — a domain's public surface, with reads and writes separated by type.

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

### Subscribable

Some ports do not answer once — they keep answering. A repository that reads a local database has to report every later write to it, and the port that says so needs a type for "a stream of values". Taking that type from rxjs would put a stream library in the domain layer; declaring an ad-hoc callback shape in every port makes them all subtly different.

`Subscribable` is the structural minimum both problems avoid. An rxjs `Observable`, an XState actor, and a hand-written emitter all satisfy it as they are — no adapter, no import.

```ts
export type Unsubscribe = () => void;

export type Subscription = Readonly<{ unsubscribe: Unsubscribe }>;

export type Observer<T> = Readonly<{
  next: (value: T) => void;
  error?: (error: unknown) => void;
  complete?: () => void;
}>;

export interface Subscribable<T> {
  subscribe(observer: Observer<T>): Subscription;
  subscribe(
    next: (value: T) => void,
    error?: (error: unknown) => void,
    complete?: () => void,
  ): Subscription;
}
```

```ts
import type { Subscribable } from '@tactical-ddd/core';

export interface BeneficiaryRepository {
  observeAll(): Subscribable<Beneficiary[]>;
}
```

Worth knowing:

- **Both `subscribe` overloads are part of the contract**, because rxjs supports both call styles and narrowing to one would reject `Observable` as an implementation.
- **Operators stay outside.** The type carries no `pipe`: whoever needs `map` or `catchError` keeps rxjs as its own dependency, while the port stays library-free.
- **`Unsubscribe` is useful on its own** for ports that hand back a teardown function instead of a subscription object.

### Remote

Data that lives behind a network has no single "current value" — only a value plus how much it can be trusted right now. Modelling the two as separate fields (`value`, `isLoading`, `error`) allows combinations that mean nothing, and every screen re-derives what to show from them.

`Remote` is that state as one closed union, so the caller has to handle each case it can actually be in.

```ts
export type Remote<T> =
  | Readonly<{ status: 'loading' }>
  | Readonly<{ status: 'ready'; value: T; stale: boolean }>
  | Readonly<{ status: 'failed'; reason: RemoteFailure; value?: T }>;
```

```ts
import type { Remote } from '@tactical-ddd/core';

const label = <T>(state: Remote<T>): string => {
  switch (state.status) {
    case 'loading':
      return 'Loading…';
    case 'ready':
      return state.stale ? 'Refreshing…' : 'Up to date';
    case 'failed':
      // Old data is better than an empty screen.
      return state.value === undefined ? 'Unavailable' : 'Showing last known';
  }
};
```

Worth knowing:

- **`stale` means "a refresh is in flight"**, not "past its TTL". A screen that has data should keep showing it rather than flash a spinner, so the flag exists to soften the display, not to hide the value.
- **`failed` may still carry a value** — the last one known, when there was one. A refresh that fails does not make the data on screen disappear.
- **`RemoteFailure.kind` says what to do next.** `transport` (no response at all) and `server` are worth retrying, `request` (rejected: forbidden, missing, conflicting) is not, and `unknown` is the honest fallback. The `cause` keeps the original error for logs without letting its type leak into the domain.

### Facade

A facade is the one surface a domain shows the outside world, and its methods are not all of one kind. Some read, some write, and among the reads some answer once while others keep answering. Left to a flat interface, which is which is something a reader infers from the return type of each method — and something nothing stops from being inconsistent.

`Facade` takes that decision into the declaration. A spec names three groups, each constrained to a return shape, and the result is flattened back into plain methods:

```ts
export type Query<TResult> = Promise<TResult>; // the value as of now
export type Watch<TValue> = Subscribable<Remote<TValue>>; // and every later one
export type Command<TOutcome extends AnyOutcome | void = void> =
  Promise<TOutcome>; // a write
```

```ts
import type {
  Command,
  Facade,
  Outcome,
  Query,
  Watch,
} from '@tactical-ddd/core';

export type BeneficiariesSpec = {
  queries: {
    findOne(id: string): Query<Beneficiary | null>;
  };
  watches: {
    observeAll(): Watch<Beneficiary[]>;
  };
  commands: {
    rename(id: string, name: string): Command;
    verify(id: string, code: string): Command<Verified | Rejected>;
  };
};

export type Verified = Outcome<'verified'>;
export type Rejected = Outcome<'rejected', { attemptsRemaining: number }>;

export type BeneficiariesFacade = Facade<BeneficiariesSpec>;
```

```ts
// Callers see plain methods; the grouping left no trace.
await facade.rename('1', 'Alicia');
const state = useObserved(facade.observeAll());
```

Worth knowing:

- **A query and a watch are not interchangeable.** A watch hands a new subscriber the current state immediately, which is why it suits a screen or a state machine; a query answers once and rejects on failure, which is what a use case in another domain wants. Reaching for `firstValueFrom` around a facade means the method should have been a query.
- **`Remote` appears only on watches**, because only a stream has freshness to report. A query's failure is a rejection, so the caller never unwraps a union to get at a value.
- **The result is an alias, not an interface.** There is no body to declare a fourth, ungrouped method in, and an invented group name (`events`) is rejected rather than silently dropped — notifications belong on an event bus, not on a facade.
- **`QueriesOf`, `WatchesOf`, and `CommandsOf`** narrow a facade to one slice, so a component that must not write can be handed the reads alone.
- **A command resolves to nothing, or to an `Outcome`** — never to domain data. `Command<Beneficiary>`, `Command<Beneficiary[]>`, and `Command<string>` are all compile errors, because what the command changed is read back through a query or a watch, from the one source of truth. Returning it as well would create a second, diverging path to the same data.
- **An `Outcome` is a tag plus primitive detail**, so wrapping data to sneak it out (`Outcome<'created', { created: Beneficiary }>`) does not compile either. Outcomes describe the attempt — "rejected, two tries left" — which is the one thing no query can answer, because it is about the call rather than about the domain.
- **A command's refusal is still an exception.** `Outcome` is for expected results a caller must branch on; a broken invariant is a [`DomainError`](#domainerror).

The grouping is not fully machine-checked in one direction: a `Command` may sit in `queries` without complaint, since both are promises. The reverse — a data-returning read filed under `commands` — is rejected, and that is the direction where the damage would be.

## Entity or value object?

| Question                                             | Entity                         | Value object                                 |
| ---------------------------------------------------- | ------------------------------ | -------------------------------------------- |
| Does it stay itself when its fields change?          | Yes — identity is separate     | No — a different value is a different object |
| Are two instances with equal fields interchangeable? | No                             | Yes                                          |
| Compared by                                          | `id`                           | all own attributes                           |
| Typical example                                      | account, order, PIN credential | PIN, money, date range, policy               |

## Running unit tests

Run `nx test @tactical-ddd/core` to execute the unit tests via [Jest](https://jestjs.io/).
