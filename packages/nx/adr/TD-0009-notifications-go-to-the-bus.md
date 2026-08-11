# TD-0009 — Notifications go to the bus, state goes to a watch

- **Status:** accepted
- **Date:** 2026-08-11
- **Scope:** domain events published between domains, and watch methods on facades

## Context

A workspace that has both domain events and watch methods has two push channels,
and both can be described as "telling someone something changed". Without a rule
for which is which, they start substituting for each other, and the substitutions
are what cause the damage:

- an event named `BeneficiariesChanged`, carrying no fact — a watch in disguise,
  which leaves every subscriber to go and re-read the data;
- a domain that assembles state out of another domain's events, rebuilding the
  same projection each subscriber needs, without the initial value;
- a screen subscribed to the bus, reconstructing a list from facts and racing
  with its own mount.

The confusion is understandable, because both channels deliver asynchronously and
both are "reactive". The difference is not in the transport.

## Decision

An **event** states a fact that happened. It is part of the published language,
declared as a type in `contracts`, published on the bus, and consumed by whoever
must _act_ in response. A **watch** publishes current state. It is a method on a
facade, returns `Watch<T>` per
[TD-0008](./TD-0008-value-and-freshness-are-one-state.md), and is consumed by
whoever must _display_ or _recompute from_ that state.

|                           | watch                                         | event on the bus                        |
| ------------------------- | --------------------------------------------- | --------------------------------------- |
| Answers                   | "how things are now"                          | "what happened"                         |
| A new subscriber receives | the current state at once (`loading`→`ready`) | only what happens after subscribing     |
| Parameterised             | yes — `observeOne(id)`, a selection per call  | no, one event for every subscriber      |
| Carries                   | value plus freshness                          | a fact, already true                    |
| Coupling                  | the consumer knows whose data it wants        | the publisher does not know who listens |
| Consumer                  | renders, or recomputes from state             | performs an action in response          |

In CQRS terms the two are on opposite sides and cannot collide: **the bus
connects the command sides of domains; watches publish the query side outward.**
An event updates a read model; a watch hands that read model to a consumer.

To choose a channel, three questions:

1. Does the consumer need an answer immediately, before anything changes? →
   watch.
2. Does it care "what changed" or "how things are now"? "What changed" → event.
3. Does it perform an action, or display and recompute? Action → event.

## Rejected alternatives

- **One channel: the bus only.** A screen has nothing to show until the first
  change arrives, because a bus does not replay current state to a new
  subscriber. Every consumer then re-implements the same "fetch once, then patch
  from events" composition, and each copy drifts.
- **One channel: watches only.** A consumer that just needs to act on a fact has
  to subscribe to state and diff it to find out what happened, and the publisher
  can no longer notify several domains without each of them naming it.
- **Events that carry the full new state** (event-carried state transfer). A real
  integration pattern, but here it makes the bus a data channel: payloads grow,
  subscribers couple to the shape of another domain's data, and a subscriber that
  starts late still has no current value.
- **A watch that republishes the event stream** (`observeLastEvent()`). Gives up
  the one thing a watch is for — having a current value — while keeping none of
  the decoupling the bus is for.

## Consequences for code

- Events name a fact in the past tense (`BeneficiaryRemoved`, `PinReset`), never
  `*Changed` or `*Updated`. If a name has no business fact in it, the consumer
  probably wanted state.
- Events are declared as types in `contracts` and published through the bus. A
  facade does not grow methods for them: the `Facade` type has no `events` group,
  and an invented one is a compile error.
- A watch must carry `Loadable<T>`. A stream with no value in it
  (`Subscribable<void>`) is a notification wearing the wrong type — make it an
  event.
- **A watch is built over the domain's own source of truth** — its cache, its
  database, its live query — never over the bus.
- A domain may listen to another domain's event, update its own source of truth,
  and let its own watch emit the new state. One channel in, the other out; this
  chain is not duplication.
- Bus subscriptions live in `application` (a use case reacting to a fact), not in
  `ui`. A component subscribes to watches only.

## Signals you are violating it

- An event whose name ends in `Changed`, `Updated`, or `Invalidated` and whose
  payload is empty.
- A repository or use case building state by accumulating bus events.
- A component, hook, or screen subscribing to the bus.
- A facade method returning `Subscribable<void>` or `Subscribable<SomeEvent>`.
- The same data reachable both ways for the same consumer — it subscribes to a
  watch _and_ handles an event about it.
- An event payload that grew large enough that subscribers stopped querying.

## Related

- [TD-0003](./TD-0003-cross-domain-through-contracts.md) — why cross-domain traffic is limited to published language
- [TD-0008](./TD-0008-value-and-freshness-are-one-state.md) — what a watch carries and why
- [TD-0002](./TD-0002-facade-is-the-only-public-surface.md) — the surface a watch belongs to
