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
- [`AggregateRoot`](#aggregateroot) — an entity that owns a consistency boundary and the events crossing it.
- [`ValueObject`](#valueobject) — an object defined by its attributes.
- [`DomainError`](#domainerror) — an invariant violation, distinguishable from an infrastructure failure.
- [`UseCase`](#usecase) — the single-entry-point contract for application use cases.
- [`Subscribable`](#subscribable) — the minimal shape of a stream, with no stream library attached.
- [`Loadable`](#loadable) — a value together with the state of getting it, whatever the source.
- [`Facade`](#facade) — a domain's public surface, with reads and writes separated by type.
- [`Repository` / `KeyValueStore`](#repository-and-keyvaluestore) — the two ways to keep things, told apart by the compiler.
- [`EventBus`](#eventbus) — facts between domains, with the delivery contract written down.

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

### AggregateRoot

Some rules span several objects: an order's total must equal the sum of its lines, a policy must always have at least one active clause. Such a rule has no home on any single entity, and enforcing it from a use case means enforcing it everywhere the objects are touched — that is, eventually not enforcing it.

An **aggregate** is the cluster those objects form, and the **root** is the one entity the outside world addresses. Everything inside the boundary is consistent after every save; everything outside catches up later, through an event.

```ts
export abstract class AggregateRoot<
  TId extends EntityId = string,
  TEvent extends DomainEvent = DomainEvent,
> extends Entity<TId> {
  protected recordEvent(event: TEvent): void;
  pullEvents(): readonly TEvent[];
  get hasRecordedEvents(): boolean;
}

export type DomainEvent<
  TType extends string = string,
  TPayload extends object = Record<never, never>,
> = Readonly<{ type: TType } & TPayload>;
```

```ts
import { AggregateRoot, type DomainEvent } from '@tactical-ddd/core';

type OrderEvent =
  | DomainEvent<'OrderLineAdded', { orderId: string }>
  | DomainEvent<'OrderPlaced', { orderId: string }>;

class Order extends AggregateRoot<string, OrderEvent> {
  private readonly lines: OrderLine[] = [];

  addLine(line: OrderLine): void {
    if (this.lines.length >= MAX_LINES) {
      throw new TooManyLinesError('An order takes at most 100 lines');
    }

    this.lines.push(line);
    this.recordEvent({ type: 'OrderLineAdded', orderId: this.id });
  }
}
```

```ts
// The use case stores first and announces second.
await this.orders.save(order);
this.bus.publishAll(order.pullEvents());
```

Worth knowing:

- **The root records; the caller publishes.** Emitting from inside a domain method would announce a change that has not been stored and cannot be retracted if the save fails.
- **`pullEvents` drains.** A second call returns nothing, so a retried publish cannot emit the same fact twice, and the returned array is detached — pushing into it does not touch the aggregate.
- **`recordEvent` is `protected`.** Only the aggregate decides that something happened; from the outside there is nothing to record, because there was no decision.
- **Events are typed per aggregate.** Declaring the union in `AggregateRoot<TId, TEvent>` makes a foreign event type a compile error rather than a runtime surprise for subscribers.
- **Reference other aggregates by id**, never by object, and change one aggregate per transaction — otherwise the boundary is decorative.
- **Smaller is better.** A boundary drawn wide makes unrelated edits collide and every write large; in offline-first workspaces it also decides what is merged as one thing on sync.

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

### Loadable

Data a screen does not hold itself has no single "current value" — only a value plus how much it can be trusted right now. Modelling the two as separate fields (`value`, `isLoading`, `error`) allows combinations that mean nothing, and every screen re-derives what to show from them.

`Loadable` is that state as one closed union, so the caller has to handle each case it can actually be in. Nothing in it names a source: a local database is loaded, refreshed, and unreadable in the same three ways a server is.

```ts
export enum LoadStatus {
  Loading = 'loading',
  Ready = 'ready',
  Failed = 'failed',
}

export type Loadable<T> =
  | Readonly<{ status: LoadStatus.Loading }>
  | Readonly<{ status: LoadStatus.Ready; value: T; stale: boolean }>
  | Readonly<{ status: LoadStatus.Failed; reason: LoadFailure; value?: T }>;

export enum LoadFailureKind {
  Unavailable = 'unavailable', // no answer at all
  Retryable = 'retryable', // the source broke
  Rejected = 'rejected', // refused; retrying will not help
  Unknown = 'unknown',
}
```

```ts
import { type Loadable, LoadStatus } from '@tactical-ddd/core';

const label = <T>(state: Loadable<T>): string => {
  switch (state.status) {
    case LoadStatus.Loading:
      return 'Loading…';
    case LoadStatus.Ready:
      return state.stale ? 'Refreshing…' : 'Up to date';
    case LoadStatus.Failed:
      // Old data is better than an empty screen.
      return state.value === undefined ? 'Unavailable' : 'Showing last known';
  }
};
```

Worth knowing:

- **`stale` means "a refresh is in flight"**, not "past its TTL". A screen that has data should keep showing it rather than flash a spinner, so the flag exists to soften the display, not to hide the value.
- **`failed` may still carry a value** — the last one known, when there was one. A refresh that fails does not make the data on screen disappear.
- **`LoadFailureKind` names failures by what the caller can do**, not by where they broke. `Unavailable` (no answer: no connectivity, an unreadable store, a timeout) and `Retryable` are worth another attempt, `Rejected` (forbidden, missing, conflicting) is not, and `Unknown` is the honest fallback. Naming them by remedy is what lets one vocabulary cover a socket and a SQLite file.
- **`cause` keeps the original error** for logs, without letting its type leak into the domain.

### Facade

A facade is the one surface a domain shows the outside world, and its methods are not all of one kind. Some read, some write, and among the reads some answer once while others keep answering. Left to a flat interface, which is which is something a reader infers from the return type of each method — and something nothing stops from being inconsistent.

`Facade` takes that decision into the declaration. A spec names three groups, each constrained to a return shape, and the result is flattened back into plain methods:

```ts
export type Query<TResult> = Promise<TResult>; // the value as of now
export type Watch<TValue> = Subscribable<Loadable<TValue>>; // and every later one
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

export enum VerifyStatus {
  Verified = 'verified',
  Rejected = 'rejected',
}

export type Verified = Outcome<VerifyStatus.Verified>;
export type Rejected = Outcome<
  VerifyStatus.Rejected,
  { attemptsRemaining: number }
>;

export type BeneficiariesFacade = Facade<BeneficiariesSpec>;
```

```ts
// Callers see plain methods; the grouping left no trace.
await facade.rename('1', 'Alicia');
const state = useObserved(facade.observeAll());
```

Worth knowing:

- **A query and a watch are not interchangeable.** A watch hands a new subscriber the current state immediately, which is why it suits a screen or a state machine; a query answers once and rejects on failure, which is what a use case in another domain wants. Reaching for `firstValueFrom` around a facade means the method should have been a query.
- **`Loadable` appears only on watches**, because only a stream has freshness to report. A query's failure is a rejection, so the caller never unwraps a union to get at a value.
- **The result is an alias, not an interface.** There is no body to declare a fourth, ungrouped method in, and an invented group name (`events`) is rejected rather than silently dropped — notifications belong on an event bus, not on a facade.
- **`QueriesOf`, `WatchesOf`, and `CommandsOf`** narrow a facade to one slice, so a component that must not write can be handed the reads alone.
- **A command resolves to nothing, or to an `Outcome`** — never to domain data. `Command<Beneficiary>`, `Command<Beneficiary[]>`, and `Command<string>` are all compile errors, because what the command changed is read back through a query or a watch, from the one source of truth. Returning it as well would create a second, diverging path to the same data.
- **An `Outcome` is a tag plus primitive detail**, so wrapping data to sneak it out (`Outcome<Created, { created: Beneficiary }>`) does not compile either. Outcomes describe the attempt — "rejected, two tries left" — which is the one thing no query can answer, because it is about the call rather than about the domain.
- **A command's refusal is still an exception.** `Outcome` is for expected results a caller must branch on; a broken invariant is a [`DomainError`](#domainerror).

The grouping is not fully machine-checked in one direction: a `Command` may sit in `queries` without complaint, since both are promises. The reverse — a data-returning read filed under `commands` — is rejected, and that is the direction where the damage would be.

### Repository and KeyValueStore

Every workspace grows two kinds of storage port, and they are routinely confused: one keeps domain objects, the other keeps values under a key. Told apart in prose, the distinction survives until the first deadline. These types make it a compile error instead.

The difference is in the data, not in taste. **A repository's objects carry their own identity**, so saving takes one argument. **A store's values do not**, so the key is passed alongside:

```ts
export interface Repository<
  TEntity extends Entity<TId>,
  TId extends EntityId = string,
>
  extends FindsById<TEntity, TId>, Saves<TEntity>, Removes<TId> {}

export interface KeyValueStore<TValue, TKey extends string = string> {
  get(key: TKey): Promise<TValue | null>;
  set(key: TKey, value: TValue): Promise<void>;
  remove(key: TKey): Promise<void>;
}
```

```ts
// An entity: identity lives inside it.
export interface OrderRepositoryPort extends Repository<Order> {
  findOverdue(): Promise<Order[]>; // queries are named by the domain
}

// A DTO: identity lives outside it.
export type TokenStorePort = KeyValueStore<TokenSetDto>;

// @ts-expect-error — a DTO has no identity, so it cannot live in a repository
export type Wrong = Repository<TokenSetDto>;
```

| Question                                    |        Repository        |    KeyValueStore    |
| ------------------------------------------- | :----------------------: | :-----------------: |
| Does the stored thing know which one it is? |           yes            |         no          |
| How does `save`/`set` take the key?         |    inside the entity     |   as an argument    |
| Extends `Entity`?                           |         required         |     irrelevant      |
| Domain-specific queries?                    | yes, named by the domain | no — it is a bucket |

Worth knowing:

- **Pick the parts you need.** A log that is written and read but never deleted extends `FindsById` and `Saves` and simply omits `Removes` — no operation is forced on a domain that must not offer it.
- **The bound is the teaching mechanism.** `Repository<TokenSetDto>` does not compile, and the only thing that does compile is the store — so the choice is made by the compiler rather than by convention.
- **Domain queries belong on the port**, not on the base type: `findOverdue()` is added by the interface that extends `Repository`, because only the domain can name it.
- **A read-only view is `Pick<KeyValueStore<T>, 'get'>`** rather than another named type.
- **Neither is for a single value with no key** (a session, the active account) or for a question about the present (`getCurrentIdentity()`) — those are state and query ports, and calling them repositories is what blurs the word.

### EventBus

Domains that must not know about each other still have to react to each other. A bus carries the facts one of them states, to whoever is listening — with no reply, no correlation id and no timeout, because a caller that needs an answer is asking a question and should call a facade instead.

```ts
export interface EventBus<TEvent extends DomainEvent = DomainEvent> {
  publish(event: TEvent): void;
  publishAll(events: readonly TEvent[]): void;
  on<TType extends TEvent['type']>(
    type: TType,
    handler: EventHandler<Extract<TEvent, { type: TType }>>,
  ): Unsubscribe;
}
```

```ts
import { InMemoryEventBus, type DomainEvent } from '@tactical-ddd/core';

type BeneficiaryEvent =
  | DomainEvent<'BeneficiaryAdded', { id: string }>
  | DomainEvent<'BeneficiaryRemoved', { id: string }>;

const bus = new InMemoryEventBus<BeneficiaryEvent>(reportToLogger);

const stop = bus.on('BeneficiaryRemoved', async (event) => {
  // `event` is narrowed — no cast, and `event.id` is typed.
  await payments.cancelDraftsFor(event.id);
});

// After the write succeeded, never before it.
await repository.save(beneficiary);
bus.publishAll(beneficiary.pullEvents());

stop(); // subscriptions are owned by whoever made them
```

The delivery contract is part of the type, not folklore:

- **A failing subscriber cannot take the bus down.** Thrown errors and rejected promises go to `onError`; the other handlers still run, `publish` does not throw, and a handler that failed **stays subscribed**. Left unconfigured, `onError` rethrows in a microtask so the platform reports it rather than the bus swallowing it.
- **Delivery is synchronous, re-entrant publishing is queued.** Handlers run inside `publish` in subscription order; an event published _by_ a handler is delivered after the current one, so the sequence matches what happened and a chain cannot grow the stack.
- **Subscribing returns `Unsubscribe`**, safe to call twice. Unsubscribing during delivery takes effect immediately; subscribing during delivery does not join the round in progress.
- **The test double is this class.** No timing differs between test and production, which is what prevents a bus that works in one and not the other.
- **Registration is an explicit call** — no decorators and no `reflect-metadata`, which need a polyfill in React Native and hide registration from the reader.

Cross-process delivery — a worker, a micro-frontend, a socket — is another implementation of the same port.

## Entity or value object?

| Question                                             | Entity                         | Value object                                 |
| ---------------------------------------------------- | ------------------------------ | -------------------------------------------- |
| Does it stay itself when its fields change?          | Yes — identity is separate     | No — a different value is a different object |
| Are two instances with equal fields interchangeable? | No                             | Yes                                          |
| Compared by                                          | `id`                           | all own attributes                           |
| Typical example                                      | account, order, PIN credential | PIN, money, date range, policy               |

## Running unit tests

Run `nx test @tactical-ddd/core` to execute the unit tests via [Jest](https://jestjs.io/).
