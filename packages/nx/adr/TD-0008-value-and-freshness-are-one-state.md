# TD-0008 — Value and freshness are one state

- **Status:** accepted
- **Date:** 2026-08-11
- **Scope:** facade methods declared in `<domain>/contracts`, and the `ui`/`features` code that consumes them

## Context

A screen showing data held elsewhere never has just a value. It has a value and
how much that value can be trusted right now: nothing yet, something being
refreshed, something whose refresh just failed. The UI has to render all of it.

Expressed as independent fields — `value`, `isLoading`, `error` — that state
allows combinations that cannot happen (loading and failed at once, an error with
no request in flight) and leaves the interesting ones unnamed: "there is data and
a refresh is running" is a pair of booleans no type mentions. Every screen
re-derives the rules from scratch, and they drift: one flashes a spinner over
data it already has, the next blanks the list when a refresh fails, a third
renders `value!` in a branch where it happens to be defined today.

Leaving the state out of the facade entirely has a worse outcome. A read typed
`Promise<T>` that throws on failure can express neither "still loading" nor
"stale" nor "failed but here is the last value", so the UI rebuilds all of it
around the call — in practice by reaching for the cache library's own hook. The
library's result type then becomes the domain's de facto contract, and swapping
the library means editing every screen.

But not every read wants this. A use case in another domain asking "is a PIN
set?" needs a value, once; handing it a stream forces subscribe-read-unsubscribe
around a single answer, and handing it a union forces it to unwrap freshness it
has no use for. Reads split by nature — continuous versus point-in-time — and the
split does not follow the consumer: a state machine legitimately watches, and a
screen legitimately asks.

## Decision

A facade declares its methods in three groups, using `Facade` from
[`@tactical-ddd/core`](https://www.npmjs.com/package/@tactical-ddd/core):

```ts
export type Query<TResult> = Promise<TResult>; // the value as of now; rejects on failure
export type Watch<TValue> = Subscribable<Loadable<TValue>>; // and every later one
export type Command<TOutcome extends AnyOutcome | void = void> =
  Promise<TOutcome>; // a write, resolving to nothing or to how it went
```

Data that is rendered, or reacted to as it changes, is published as a **watch**,
and its state is one closed union — value and freshness inseparable:

```ts
export type Loadable<T> =
  | Readonly<{ status: LoadStatus.Loading }>
  | Readonly<{ status: LoadStatus.Ready; value: T; stale: boolean }>
  | Readonly<{ status: LoadStatus.Failed; reason: LoadFailure; value?: T }>;
```

A read taken at a point in time stays a **query**: `Promise<T>`, reporting
failure by rejecting. `Loadable` never appears on one, because a single answer has
no freshness to report.

```ts
// <domain>/contracts
export type BeneficiariesFacade = Facade<{
  queries: { findOne(id: string): Query<Beneficiary | null> };
  watches: { observeAll(): Watch<Beneficiary[]> };
  commands: { rename(id: string, name: string): Command };
}>;
```

```ts
// <domain>/ui
const state = useObserved(facade.observeAll());

switch (state?.status) {
  case undefined:
  case LoadStatus.Loading:
    return <Spinner />;
  case LoadStatus.Ready:
    return <List items={state.value} refreshing={state.stale} />;
  case LoadStatus.Failed:
    // Old data beats an empty screen.
    return state.value === undefined ? (
      <Error reason={state.reason} />
    ) : (
      <List items={state.value} error={state.reason} />
    );
}
```

One watch carries the first load and every later change, so the UI never needs a
second flag to tell "loading" from "reloading" — that difference is what `stale`
says. Where the later changes come from is the domain's business: a cache
observer, a local database change feed, a socket. The screen cannot tell, and
does not subscribe twice.

**`Loadable` is a boundary type.** The facade creates it; the consumer either
renders it (the UI, whose job is displaying state) or destructures it on entry
and passes the value inward. It is not a type that travels: no entity, value
object, use case, or repository port takes or returns a `Loadable`.

## Rejected alternatives

- **`value` + `isLoading` + `error` as separate fields.** The impossible
  combinations are representable and the boolean set keeps growing
  (`isLoading`, `isFetching`, `isRefetching`) as new cases are discovered.
- **`Promise<T>` for every read, throwing on failure.** No place for freshness,
  and a failure discards the last known value. The UI ends up owning the state
  the domain refused to model.
- **A stream for every read.** The mirror mistake. A use case that needs one
  value has to subscribe, take the first `ready`, and unsubscribe — at every call
  site — and reads that have no stream behind them at all (`isPinSet`,
  `getAccessToken`) get a single-element stream invented for them.
- **Returning the cache library's result type** (`QueryObserverResult`,
  `UseQueryResult`). Makes a third-party type the published contract, spreads the
  library across every screen, and puts a runtime dependency in `contracts`,
  which [TD-0001](./TD-0001-contracts-contain-types-only.md) forbids.
- **A status field beside an always-optional value** (`{ status, value?: T }`).
  Reads like the union but does not narrow: the compiler stops forcing each case
  to be handled, which was the point.
- **Emitting loading and failure as events on a bus.** Ordering and correlation
  move to the consumer, which reassembles the state by hand — the three loose
  fields again, one layer further away. See
  [TD-0009](./TD-0009-notifications-go-to-the-bus.md) for what the bus is for.
- **One method returning both a snapshot and a stream.** Two ways to read the
  same data, kept in sync by convention.

## Consequences for code

- Watch methods are named for observation (`observe*`/`watch*`) and return
  `Watch<T>`. Arguments are part of the call (`observeOne(id)`), and the caller
  memoises the returned source — a new reference is a new subscription.
- **A watch never terminates on failure.** A transport error becomes
  `LoadStatus.Failed`, not the observer's `error` channel: the first failure
  would otherwise end the subscription and the screen would stop updating for
  good. `catchError` belongs in the repository that builds the stream.
- `stale` means "a refresh is in flight", not "past its TTL". With a zero stale
  time every value is expired the moment it arrives, so a TTL-based flag would be
  on permanently and tell the user nothing.
- `failed` keeps the last known value when there was one. Do not drop it to
  simplify a branch.
- The mapping from a cache or transport type into `Loadable` lives in
  `shared/infrastructure` (or the domain's `infrastructure`), in one function.
  That function is the only place allowed to name the cache library.
- A domain consuming another domain's watch destructures on entry: `ready` →
  pass `state.value` to its own logic, `failed` → a domain decision (log, defer,
  skip), `loading`/`stale` → usually nothing to do. What goes inward is `T`.
- A facade may **combine** another domain's watch into a watch of its own
  projection. It may not republish a foreign `Loadable<X>` unchanged: that adds
  nothing and couples its contract to the other domain's shape — the consumer
  should subscribe to the owner directly.
- `features` is a boundary too. Holding a `Loadable` in a state machine's context
  is fine; it is an adapter between domain and screen, not business logic.
- Inside a domain, use cases and repository ports return values and throw. They
  do not see `Loadable` at all.

## Signals you are violating it

- A `firstValueFrom`-style wrapper around a facade inside `core` — the method
  should have been a query.
- `Loadable` in a use case signature, an entity field, a repository port, or a
  persisted snapshot.
- `isLoading`, `isFetching`, or `error` alongside a `Loadable` in props, context,
  or machine context.
- `QueryObserverResult`, `UseQueryResult`, or the name of an HTTP client outside
  `infrastructure`.
- A watch calling the observer's `error` callback, or completing, when a request
  fails.
- A screen reading `state.value` without switching on `status`, or with a `!`.
- A command returning `Loadable`, a watch returning a `Promise`, or a query
  returning a stream.

## Related

- [TD-0001](./TD-0001-contracts-contain-types-only.md) — why the union lives in contracts and the mapping does not
- [TD-0002](./TD-0002-facade-is-the-only-public-surface.md) — the facade these groups belong to
- [TD-0005](./TD-0005-shared-kernel-stays-business-agnostic.md) — where the adapter that produces `Loadable` lives
- [TD-0009](./TD-0009-notifications-go-to-the-bus.md) — the other push channel, and how to tell them apart
- [TD-0010](./TD-0010-commands-return-no-data.md) — why the write side reads its effect back through these methods
