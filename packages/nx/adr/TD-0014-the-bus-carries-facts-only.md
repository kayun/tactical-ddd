# TD-0014 — The bus carries facts, and never fails loudly

- **Status:** accepted
- **Date:** 2026-08-12
- **Scope:** the event bus in `@tactical-ddd/core`, and every publisher or subscriber in a workspace

## Context

[TD-0009](./TD-0009-notifications-go-to-the-bus.md) settled _what_ belongs on a
bus, and [TD-0013](./TD-0013-aggregate-is-the-unit-of-change.md) made aggregates
record the facts. What was left unstated is the bus itself — and the details left
unstated are exactly where message infrastructure goes wrong.

A review of a production Angular/RxJS broker built for micro-frontends turned up
six defects, none of them exotic, all of them consequences of an unwritten
contract:

- **A reply was lost to a race.** The request was emitted before subscribing to
  the reply channel; only an `observeOn(asapScheduler)` in the transport made it
  work at all — and the synchronous test double, having different timing, lost
  every reply. The bus worked in production and not in tests.
- **`switchMap` on the handler pipeline.** The next message cancelled the
  processing of the previous one: two commands in quick succession, and the first
  caller waited forever.
- **No `catchError`.** The first error a handler threw completed its stream. That
  handler was then dead for the rest of the session, silently.
- **No unsubscribe.** Handlers subscribed at registration and were never torn
  down — in a micro-frontend that unloads and reloads, they accumulate.
- **Request/response inside the event bus**, bringing correlation ids, reply
  channels and timeouts into what should have been fire-and-forget.
- **Zero tests**, through twenty-four releases.

The lesson is not "that library was careless" — it is that a bus without a
written contract is a bus whose behaviour is whatever its scheduler does today.

## Decision

The kernel ships an `EventBus` port and one in-memory implementation, with the
guarantees stated as part of the contract.

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

**1. Facts only.** No `send`, no reply, no correlation id, no timeout. A caller
that needs an answer is asking a question, and questions go to a facade
([TD-0010](./TD-0010-commands-return-no-data.md)). Request/response over a bus
needs delivery guarantees, retries and error transport that fire-and-forget does
not have, and pretending otherwise is how a bus becomes an unreliable RPC layer.

**2. A failing subscriber cannot affect anyone else.** Errors — thrown or
rejected — are routed to an `onError` callback; the remaining handlers still run,
`publish` does not throw, and **the failed subscription stays subscribed**. By
default an unreported error is rethrown in a microtask, so the environment
surfaces it as an unhandled error rather than the bus swallowing it.

**3. Delivery is synchronous; re-entrant publishing is queued.** Handlers run
inside `publish`, in subscription order. When a handler publishes, that event is
appended to a queue and delivered after the current one completes — so the
sequence stays the order in which things happened, and a chain of events cannot
grow the stack (verified against 10 000 nested publishes).

**4. Subscribing returns `Unsubscribe`.** Calling it twice is safe; unsubscribing
during delivery takes effect immediately, and subscribing during delivery does
not join the round in progress.

**5. The test double is the production class.** `InMemoryEventBus` is what tests
use. Nothing about timing differs, which is what stops "works in production, not
in tests" from being possible at all.

**6. Handlers are registered by an explicit call.** No decorators, no
`reflect-metadata`, no metadata written onto prototypes: those need a polyfill in
React Native, break tree-shaking, hide registration from the reader, and tie a
class to one channel forever.

## Rejected alternatives

- **RxJS `Subject` as the contract.** Ties every consumer to one library version
  and drags operator semantics (`switchMap` cancelling in-flight work) into a
  place where they read as bugs. The kernel's `Subscribable` covers the streaming
  case without the dependency.
- **Decorator-driven registration** (`@EventPattern`). Concise at the definition
  and opaque everywhere else; the review case also showed it pinning a handler
  class to a single channel through prototype metadata.
- **Asynchronous delivery** (microtask or scheduler). Removes re-entrancy worries
  but makes every test asynchronous and hides ordering behind a scheduler — the
  precise gap that made the reviewed broker behave differently under test.
- **Dropping a handler that throws**, as an RxJS stream does. Silent and
  irreversible: the subscriber disappears for the rest of the session.
- **Channels/namespaces in the port.** Useful for isolating micro-frontends, but
  the type of the event already scopes it, and a channel string invites the
  "everything is a topic" design the bus is meant to avoid. An adapter may add
  them; the port stays narrow.
- **A wildcard subscription** (`on('*')`). Handy for logging, impossible to type
  well. Wrap the bus in a decorator instead.

## Consequences for code

- A domain publishes through `EventBus<ItsOwnEvents>`; the union in the type
  parameter makes a foreign event type a compile error, and `on` narrows the
  handler's payload without a cast.
- Aggregates record, use cases publish — after the write succeeds
  ([TD-0013](./TD-0013-aggregate-is-the-unit-of-change.md)): `save(order)` then
  `publishAll(order.pullEvents())`.
- Every subscription is owned: a feature that subscribes stores its `Unsubscribe`
  and calls it on teardown. Long-lived subscriptions belong to the composition
  root.
- `onError` is wired at composition to the workspace's logger; leaving the
  default means unhandled errors reach the platform's reporter instead.
- A handler doing slow work does its own scheduling — the bus does not await it,
  and a rejected promise is reported, not lost.
- Cross-process delivery (a worker, a micro-frontend, a socket) is another
  implementation of the same port; the in-memory one stays the default.

## Signals you are violating it

- A `send`, `request`, or anything returning a reply on the bus.
- `subscribe(...)` whose `Unsubscribe` is discarded.
- A `try`/`catch` around `publish` — nothing it does throws.
- An event type known to one side as a string literal and to the other as a
  constant that has drifted.
- A handler that must run before `publish` returns for correctness: that is a
  call, not a fact.
- A test that needs a `tick`, a `flush` or a fake scheduler to observe a
  delivery.
- Registration through a decorator, an annotation, or a scan of the module graph.

## Related

- [TD-0009](./TD-0009-notifications-go-to-the-bus.md) — what belongs on the bus rather than in a watch
- [TD-0013](./TD-0013-aggregate-is-the-unit-of-change.md) — who records the facts and when they are published
- [TD-0010](./TD-0010-commands-return-no-data.md) — why a request is a facade call, not a message
