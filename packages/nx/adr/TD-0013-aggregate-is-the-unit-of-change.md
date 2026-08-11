# TD-0013 — An aggregate is the unit of change

- **Status:** accepted
- **Date:** 2026-08-12
- **Scope:** `<domain>/core` — the `domain` layer, and the repositories that store it

## Context

A domain model without declared boundaries has one consistency rule: everything,
always. Any object can be reached from any other, so any method can change any
part of the graph, and nothing says which of those changes must succeed together.
Three problems follow, and they show up in that order:

1. **Nobody owns the invariants between objects.** "An order's total equals the
   sum of its lines" holds only as long as every caller remembers to keep it —
   and a rule enforced by memory is a rule that is already broken somewhere.
2. **Nothing says what to load or save.** A repository per class means a change
   spanning three classes is three writes with no atomicity; a repository that
   saves the reachable graph writes half the database on every edit.
3. **Concurrency has no unit.** Two edits conflict, or do not, by accident —
   there is no stated answer to "what is one change".

For an offline-first workspace the third point is not theoretical: what is
synced, versioned and merged as one thing has to be decided by someone. Left
undecided, it is decided by the shape of the last query written.

## Decision

An **aggregate** is a cluster of entities and value objects that changes as one,
entered only through its **root** — an `AggregateRoot`, which is the object the
outside world names, loads, saves and reasons about.

Four rules define the boundary:

1. **Invariants inside, eventual consistency outside.** Everything within the
   boundary is correct after every save. Anything beyond it may lag, and catches
   up through an event ([TD-0009](./TD-0009-notifications-go-to-the-bus.md)).
2. **The root is the only entry point.** Inner entities are not handed out for
   modification and have no repository of their own; a change to a line goes
   through `order.changeLine(...)`, because that is where the rule lives.
3. **Other aggregates are referenced by identity**, never by object. An `Order`
   holds a `customerId`, not a `Customer` — otherwise loading one aggregate
   drags in the next, and the boundary exists on paper only.
4. **One transaction changes one aggregate.** A use case that must change two
   changes the first and lets an event drive the second.

The root records what happened; it does not publish it:

```ts
class Order extends AggregateRoot<string, OrderEvent> {
  addLine(line: OrderLine): void {
    if (this.lines.length >= MAX_LINES) {
      throw new TooManyLinesError();
    }

    this.lines.push(line);
    this.recordEvent({ type: 'OrderLineAdded', orderId: this.id });
  }
}
```

```ts
// application
await this.orders.save(order); // stored first…
this.bus.publishAll(order.pullEvents()); // …announced second
```

Publishing from inside the domain method would announce a change that has not
been stored and cannot be taken back if the save fails. `pullEvents` drains
rather than reads, so a retried publish cannot emit the same fact twice.

**Drawing the boundary** — three questions, most reliable first:

- What must be true **immediately after every change**? That set is one
  aggregate.
- Does deleting the root delete it? Then it is inside.
- Can it be found and worked with on its own? Then it is its own aggregate.

**Prefer small aggregates.** The instinct to enclose everything related produces
a boundary where unrelated edits collide, nothing can be loaded partially, and
every write is large. When in doubt, split and connect with events.

## Rejected alternatives

- **No aggregates; a repository per entity.** The status quo this record
  replaces: invariants spanning objects have no owner, and "one change" is
  whatever the caller happened to write.
- **One large aggregate per bounded context.** Kills concurrency (every edit
  contends with every other), forces whole-graph loads, and in an offline-first
  setting makes every sync conflict a conflict over everything.
- **Object references between aggregates.** Convenient at the call site and fatal
  to the boundary: reachability becomes transitive and the "unit of change" is
  again the whole graph.
- **Publishing events from inside domain methods.** Announces changes that may
  never be persisted, and makes a rollback a lie already told to other domains.
- **An `AggregateRoot` that is only a marker**, with events left to each
  workspace. It would satisfy nothing the type system can check and teach
  nothing — by [TD-0011](./TD-0011-one-primitive-per-concept.md)'s rule, not
  worth a primitive.
- **Deriving the boundary from the database schema.** Tables are shaped by
  storage concerns; consistency requirements are a domain decision that should
  survive changing the store.

## Consequences for code

- One repository per aggregate, typed by the root
  ([TD-0012](./TD-0012-what-a-repository-is.md)). Inner entities are loaded and
  saved with it, never separately.
- The root extends `AggregateRoot<TId, TEvent>` and declares the union of events
  it can record; `recordEvent` is `protected`, so only the aggregate itself can
  state that something happened.
- Events are drained after a successful save, by the use case or by the adapter
  that owns the transaction — never inside a domain method.
- Cross-aggregate work is a use case reacting to an event, not a second write in
  the same transaction. Where the two must not diverge, the compensating action
  is part of the design, not an afterthought.
- An event carries a fact and identifiers, not an entity: subscribers that need
  more read it themselves, which keeps the bus from becoming a data channel.
- In an offline-first workspace, the aggregate is the unit of synchronisation and
  of conflict resolution — a boundary drawn here shows up directly in merge
  behaviour.

## Signals you are violating it

- A repository for an entity that lives inside another aggregate.
- A field typed as another aggregate root rather than as its id.
- A use case saving two roots and hoping both succeed.
- A setter or a mutable collection reachable from outside the root.
- Events published before the save, or published twice after a retry.
- An aggregate whose save writes hundreds of rows, or whose edits routinely
  conflict — the boundary is too wide.
- An invariant enforced in a use case that spans objects of one aggregate: it
  belongs to the root.

## Related

- [TD-0011](./TD-0011-one-primitive-per-concept.md) — the primitives an aggregate is built from
- [TD-0012](./TD-0012-what-a-repository-is.md) — why the repository follows the aggregate, not the class
- [TD-0009](./TD-0009-notifications-go-to-the-bus.md) — how the world outside the boundary catches up
