# TD-0015 — Announcing is not part of the write

- **Status:** accepted
- **Date:** 2026-09-22
- **Scope:** use cases in `<domain>/core/application`, repository adapters in
  `<domain>/core/infrastructure`, and every handler that reacts to an event

## Context

[TD-0013](./TD-0013-aggregate-is-the-unit-of-change.md) settled the order:
store first, announce second. An aggregate records what happened, a use case
saves it and then publishes what was recorded. [TD-0014](./TD-0014-the-bus-carries-facts-only.md)
settled what the bus guarantees once `publishAll` is called. Three questions sit
between the two records, and each of them is answered differently in every
codebase that has not written the answer down.

**Who calls `publishAll`.** TD-0013 allows "the use case or the adapter that
owns the transaction". Those are two designs, not one. In the second, the
repository takes a dependency on the bus, a side effect hides inside a method
named `save`, and every adapter for every store re-implements publication —
slightly differently.

**What happens in the gap.** `save` and `publishAll` are two steps, and nothing
makes them atomic. A tab closes, a process is killed, a device sleeps after the
write committed and before the announcement went out. The fact is in the store;
nobody was told. This is the dual-write problem, and left undecided it is decided
per command — usually by ignoring it.

**What a failing subscriber means for the command.** Handlers run synchronously
inside `publishAll`, which runs inside the use case, before the `Command`
resolves. Should the command reject because a subscriber threw? Should it wait
for a subscriber's asynchronous work? A use case that answers "yes" to either has
made its success depend on code it does not know exists.

Offline-first sharpens all three. The default bus is in-memory, so a reload
loses everything in flight — and yet some facts must outlive the process, because
synchronisation depends on them.

## Decision

Publishing is a separate step that follows the write, cannot fail it, and cannot
be relied on to survive the process. Five rules:

**1. The use case publishes, and only the use case.** A repository does not
know the bus exists: `save` is `Promise<void>` and its only effect is the write.
The facade does not publish either; it is thin by
[TD-0002](./TD-0002-facade-is-the-only-public-surface.md). A use case makes one
`save` and one `publishAll`, and the `publishAll` is its last statement — one
aggregate per transaction, by TD-0013's fourth rule.

```ts
export class RemoveBeneficiaryUseCase implements UseCase<
  [id: string],
  Promise<void>
> {
  constructor(
    private readonly repository: BeneficiaryRepositoryPort,
    private readonly bus: EventBus<BeneficiaryEvent>,
  ) {}

  async execute(id: string): Promise<void> {
    const beneficiary = await this.repository.findById(id);
    if (beneficiary === null) {
      throw new BeneficiaryNotFoundError(id);
    }

    beneficiary.remove();
    await this.repository.save(beneficiary);
    this.bus.publishAll(beneficiary.pullEvents()); // last statement
  }
}
```

**2. The gap between save and publish is accepted for in-process reactions.**
This is possible because the bus is not a source of truth. State reaches a screen
through a watch that re-reads the store
([TD-0008](./TD-0008-value-and-freshness-are-one-state.md),
[TD-0009](./TD-0009-notifications-go-to-the-bus.md)); a lost event loses a
neighbour's reaction, never data. In-memory delivery is therefore **at most
once**, and a subscriber that must not miss a fact has asked for a guarantee the
in-memory bus does not make.

**3. A fact that must outlive the process is stored with the aggregate.** That is
an **outbox**: the repository adapter writes the recorded events in the same
transaction as the aggregate's snapshot, and a relay reads them back and delivers
them. The relay is an `EventTransport` (TD-0014), so subscribers cannot tell the
difference. The kernel ships the extension point, not the outbox; which events
need durability is a product decision, recorded in that workspace's own ADR.

```ts
// infrastructure — the adapter persists the facts; it still does not publish
export class SqliteBeneficiaryRepository implements BeneficiaryRepositoryPort {
  async save(beneficiary: Beneficiary): Promise<void> {
    const events = beneficiary.pullEvents(); // drained here, once
    await this.db.transaction(async (tx) => {
      await tx.upsert(
        'beneficiaries',
        beneficiary.id,
        beneficiary.toSnapshot(),
      );
      await tx.insertAll('outbox', events);
    });
  }
}

// the relay is a transport: local publishes pass through, stored facts are
// delivered from the outbox — right after the write, and again after a restart
export class OutboxTransport implements EventTransport {
  send(event: DomainEvent): void {
    this.local.send(event);
  }

  receive(handler: (event: DomainEvent) => void): Unsubscribe {
    const stopLocal = this.local.receive(handler);
    const stopDrain = this.outbox.drain((event) => handler(event));
    return () => {
      stopLocal();
      stopDrain();
    };
  }
}
```

The use case is unchanged in this mode: it still ends with `publishAll`, which
now finds nothing to publish because the adapter drained the events into the
store. Delivery — the first time and every retry — comes from the relay, over
the same path a local publish takes. The use case cannot tell which mode it is
in, which is the point: durability is an infrastructure decision, not an
application one.

**4. A subscriber cannot fail or roll back the command.** By the time a handler
runs, the write has happened. An error goes to the bus's `onError`; the command
resolves exactly as it would with no subscribers at all. The use case does not
await a handler's asynchronous work and does nothing after `publishAll`.

```ts
it('resolves even though a subscriber throws', async () => {
  const bus = new DomainEventBus<BeneficiaryEvent>({
    onError: () => undefined,
  });
  bus.on('BeneficiaryRemoved', () => {
    throw new Error('subscriber broke');
  });

  await expect(useCase.execute('42')).resolves.toBeUndefined();
  expect(await repository.findById('42')).toBeNull(); // the write stands
});
```

**5. Handlers are idempotent.** In memory a fact arrives at most once; through an
outbox it arrives at least once. A handler that survives both treats a repeat as
a no-op — by the identity in the event and the state it produced, not by a
counter.

```ts
bus.on('BeneficiaryRemoved', async ({ beneficiaryId }) => {
  // cancelling already-cancelled drafts changes nothing: safe to repeat
  await this.cancelDrafts.execute(beneficiaryId);
});
```

## Rejected alternatives

- **Publishing from the repository, inside the transaction.** Atomic on paper,
  and it couples the store to the bus, hides a side effect in `save`, and is
  repeated in every adapter. It also contradicts
  [TD-0012](./TD-0012-what-a-repository-is.md): a repository is access by
  identity, nothing more.
- **Persisting every event by default.** An event store in miniature. Most
  events exist for an in-process reaction; storing them costs space, migrations
  and a relay for no benefit. Durability is opted into per fact.
- **Publishing before the save, with compensation.** Announces a lie that must
  be taken back. Rejected in TD-0013; restated here because it is the first thing
  proposed when the gap is noticed.
- **Awaiting handlers in the use case.** The write's success starts depending on
  subscribers the domain does not know. A slow subscriber delays the command; a
  broken one fails it. Exactly what TD-0014 protects the bus from, moved one
  level up.
- **Rolling back the write when a subscriber fails.** A distributed transaction
  inside one process — and the other subscribers have already acted.
- **Retrying `publishAll` from the use case.** The bus does not throw (TD-0014),
  so there is nothing to retry. The retry that matters belongs to the outbox
  relay, and that is where it lives.

## Consequences for code

- A use case ends with `await repository.save(root)` followed by
  `bus.publishAll(root.pullEvents())`. Nothing comes after.
- A repository adapter's constructor does not take an `EventBus`. An adapter that
  implements an outbox takes an event store instead, and still does not publish.
- `Command` resolves after the synchronous part of every handler has run, and
  independently of what any handler did. A test in which a handler throws
  asserts that the command still resolved.
- A domain that needs durable facts adds, in `infrastructure`, an outbox-writing
  repository adapter and a relay `EventTransport`, and records in a product ADR
  which events go through it.
- An event carries identifiers, and a subscriber re-reads what it needs
  (TD-0013). That is also what makes a lost event recoverable: the neighbour can
  recompute from a watch.
- A handler that may receive a fact twice keeps its "already done" marker where it
  keeps its result — in the same store, in the same write.

## Signals you are violating it

- `EventBus` in a repository's constructor, or `publish` inside `save`.
- Code in a use case after `publishAll`, especially an `await`.
- `try`/`catch` around `publishAll`.
- A test expecting a command to reject because a handler failed.
- An event whose payload exists so that a subscriber need not re-read state: the
  bus as a data channel.
- The in-memory bus used as the mechanism for syncing with a server or between
  devices. That is an outbox and a transport.
- A handler that, given the same event twice, performs its action twice.

## Related

- [TD-0013](./TD-0013-aggregate-is-the-unit-of-change.md) — the rule this record completes: store first, announce second
- [TD-0014](./TD-0014-the-bus-carries-facts-only.md) — what the bus guarantees once `publishAll` is called
- [TD-0009](./TD-0009-notifications-go-to-the-bus.md) — why a lost event does not lose state
- [TD-0012](./TD-0012-what-a-repository-is.md) — why a repository does not publish
