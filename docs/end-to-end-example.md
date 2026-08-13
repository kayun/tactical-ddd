# One domain, end to end

Every primitive in [`@tactical-ddd/core`](../packages/core/README.md) is
documented on its own, which leaves the more important question unanswered: how
do they fit together? This walks one feature — managing payment beneficiaries in
an offline-first app — from the rule that must never be broken to the screen that
renders it, and to the neighbouring domain that reacts.

The code here is not illustrative. It is compiled and executed as
[`packages/core/src/lib/end-to-end.spec.ts`](../packages/core/src/lib/end-to-end.spec.ts):
if a kernel signature changes, that file stops compiling and this document gets
fixed with it. The layout below follows what `@tactical-ddd/nx` generates; the
spec collapses it into one file, since a package cannot import a workspace.

## The shape of it

| Layer                 | Holds                                   | Sees                            |
| --------------------- | --------------------------------------- | ------------------------------- |
| `contracts`           | facade type, events, DTOs, outcomes     | nothing but the kernel          |
| `core/domain`         | aggregate, value objects, domain errors | the kernel                      |
| `core/application`    | ports, use cases, facade implementation | its own domain, other contracts |
| `core/infrastructure` | adapters: storage, transport, mapping   | its own application layer       |
| `ui` / `features`     | screens and wiring                      | its own contracts and core      |

## 1. Contracts: what the domain publishes

Events first, because they are the vocabulary other domains will react to. Each
is a fact in the past tense, carrying identifiers rather than state.

```ts
import type { DomainEvent } from '@tactical-ddd/core';

export type BeneficiaryAdded = DomainEvent<
  'BeneficiaryAdded',
  { beneficiaryId: string }
>;
export type BeneficiaryRenamed = DomainEvent<
  'BeneficiaryRenamed',
  { beneficiaryId: string }
>;
export type BeneficiaryRemoved = DomainEvent<
  'BeneficiaryRemoved',
  { beneficiaryId: string }
>;

export type BeneficiaryEvent =
  | BeneficiaryAdded
  | BeneficiaryRenamed
  | BeneficiaryRemoved;
```

Then the facade — reads and writes separated by kind, so nobody has to infer
which is which:

```ts
import type {
  Command,
  Facade,
  Outcome,
  Query,
  Watch,
} from '@tactical-ddd/core';

/** What leaves the domain: a DTO, never the aggregate itself. */
export type BeneficiaryDto = Readonly<{
  id: string;
  name: string;
  iban: string;
}>;

export enum RenameStatus {
  Renamed = 'renamed',
  NameTaken = 'nameTaken',
}

export type RenameOutcome =
  | Outcome<RenameStatus.Renamed>
  | Outcome<RenameStatus.NameTaken, { suggestion: string }>;

export type BeneficiariesFacade = Facade<{
  queries: {
    findOne(id: string): Query<BeneficiaryDto | null>;
  };
  watches: {
    observeAll(): Watch<BeneficiaryDto[]>;
  };
  commands: {
    add(id: string, name: string, iban: string): Command;
    rename(id: string, name: string): Command<RenameOutcome>;
    remove(id: string): Command;
  };
}>;

export const BeneficiariesFacade = { $: Symbol.for('BeneficiariesFacade') };
```

Three decisions are already visible:

- **`id` comes from the caller.** Offline-first needs identity before a write
  reaches a server, so the domain never mints it mid-flight
  ([TD-0010](../packages/nx/adr/TD-0010-commands-return-no-data.md)).
- **`rename` answers with an outcome, not with data.** "Name taken" is something
  the caller branches on; the new name arrives through the watch.
- **Reads are split by nature.** `findOne` is asked once; `observeAll` keeps
  answering ([TD-0008](../packages/nx/adr/TD-0008-value-and-freshness-are-one-state.md)).

## 2. Domain: the rules

A value object refuses to exist in an invalid state, which is what makes the rule
unavoidable — no caller, UI or otherwise, can route around it.

```ts
import { DomainError, ValueObject } from '@tactical-ddd/core';

export class InvalidIbanError extends DomainError {
  constructor(raw: string) {
    super('InvalidIbanError', `"${raw}" is not a valid IBAN`);
  }
}

export class Iban extends ValueObject {
  private constructor(readonly value: string) {
    super();
  }

  static create(raw: string): Iban {
    const normalised = raw.replace(/\s+/g, '').toUpperCase();

    if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(normalised)) {
      throw new InvalidIbanError(raw);
    }

    return new Iban(normalised);
  }
}
```

The aggregate owns identity, state transitions, and the facts they produce:

```ts
import { AggregateRoot } from '@tactical-ddd/core';

export class Beneficiary extends AggregateRoot<string, BeneficiaryEvent> {
  private constructor(
    id: string,
    private name: BeneficiaryName,
    private readonly iban: Iban,
  ) {
    super(id);
  }

  static add(id: string, name: BeneficiaryName, iban: Iban): Beneficiary {
    const beneficiary = new Beneficiary(id, name, iban);

    beneficiary.recordEvent({ type: 'BeneficiaryAdded', beneficiaryId: id });

    return beneficiary;
  }

  static fromSnapshot(id: string, snapshot: BeneficiarySnapshot): Beneficiary {
    /* … */
  }

  rename(name: BeneficiaryName): void {
    if (this.name.equals(name)) {
      return; // nothing happened, so nothing is announced
    }

    this.name = name;
    this.recordEvent({ type: 'BeneficiaryRenamed', beneficiaryId: this.id });
  }

  toSnapshot(): BeneficiarySnapshot {
    return { name: this.name.value, iban: this.iban.value };
  }
}
```

Note what the aggregate does **not** do: it never publishes. It records, and
someone who knows whether the write succeeded decides when the world hears about
it ([TD-0013](../packages/nx/adr/TD-0013-aggregate-is-the-unit-of-change.md)).

## 3. Application: ports and use cases

The repository deals in domain objects and adds the queries this domain actually
asks for. Its stream carries `Beneficiary`, not `Loadable` — freshness is a
boundary concern.

```ts
import type { Repository, Subscribable } from '@tactical-ddd/core';

export interface BeneficiaryRepositoryPort extends Repository<Beneficiary> {
  findByName(name: BeneficiaryName): Promise<Beneficiary | null>;
  observeAll(): Subscribable<Beneficiary[]>;
}
```

A use case orchestrates, in the only order that survives a failed write:

```ts
export class AddBeneficiaryUseCase implements UseCase<
  [id: string, name: string, iban: string],
  Promise<void>
> {
  constructor(
    private readonly repository: BeneficiaryRepositoryPort,
    private readonly bus: EventBus<BeneficiaryEvent>,
  ) {}

  async execute(id: string, name: string, iban: string): Promise<void> {
    const beneficiary = Beneficiary.add(
      id,
      BeneficiaryName.create(name), // throws a DomainError if the rule says no
      Iban.create(iban),
    );

    await this.repository.save(beneficiary); // stored first…
    this.bus.publishAll(beneficiary.pullEvents()); // …announced second
  }
}
```

And the difference between a broken rule and an expected result:

```ts
async execute(id: string, name: string): Promise<RenameOutcome> {
  const beneficiary = await this.repository.findById(id);

  if (beneficiary === null) {
    throw new BeneficiaryNotFoundError(id);          // invariant violated: throw
  }

  const wanted = BeneficiaryName.create(name);
  const taken = await this.repository.findByName(wanted);

  if (taken !== null && !taken.equals(beneficiary)) {
    return { status: RenameStatus.NameTaken, suggestion: `${name} (2)` };  // expected: return
  }

  beneficiary.rename(wanted);

  await this.repository.save(beneficiary);
  this.bus.publishAll(beneficiary.pullEvents());

  return { status: RenameStatus.Renamed };
}
```

## 4. Infrastructure: adapters

The adapter knows the table, the snapshot and the key format; none of that
escapes it ([TD-0012](../packages/nx/adr/TD-0012-what-a-repository-is.md)).

```ts
export class SqliteBeneficiaryRepository implements BeneficiaryRepositoryPort {
  async findById(id: string): Promise<Beneficiary | null> {
    const row = await this.db.selectOne(
      'SELECT * FROM beneficiaries WHERE id = ?',
      [id],
    );

    return row
      ? Beneficiary.fromSnapshot(row.id, { name: row.name, iban: row.iban })
      : null;
  }

  async save(beneficiary: Beneficiary): Promise<void> {
    const { name, iban } = beneficiary.toSnapshot();
    /* upsert */
  }

  observeAll(): Subscribable<Beneficiary[]> {
    // Re-reads on a change notification, whoever wrote it: the UI, a sync
    // engine, an outbox worker.
    return fromLiveQuery(this.liveQuery, ['beneficiaries'], () =>
      this.loadAll(),
    );
  }
}
```

`Loadable` is created in exactly one function, at the boundary:

```ts
const toWatch = <TDomain, TDto>(
  source: Subscribable<TDomain[]>,
  toDto: (item: TDomain) => TDto,
): Watch<TDto[]> => ({
  subscribe(first) {
    const next = typeof first === 'function' ? first : first.next;

    next({ status: LoadStatus.Loading });

    return source.subscribe((items) =>
      next({ status: LoadStatus.Ready, value: items.map(toDto), stale: false }),
    );
  },
});
```

A failure belongs in the value (`{ status: LoadStatus.Failed, … }`), never in the
observer's `error` channel — a stream that ends leaves the screen frozen for
good.

## 5. The facade

Thin by construction: it delegates, and it is the only thing other layers see
([TD-0002](../packages/nx/adr/TD-0002-facade-is-the-only-public-surface.md)).

```ts
export class CoreBeneficiariesFacade implements BeneficiariesFacade {
  async findOne(id: string): Query<BeneficiaryDto | null> {
    return (await this.repository.findById(id))?.toDto() ?? null;
  }

  observeAll(): Watch<BeneficiaryDto[]> {
    return toWatch(this.repository.observeAll(), (b) => b.toDto());
  }

  add(id: string, name: string, iban: string): Command {
    return this.addBeneficiary.execute(id, name, iban);
  }

  rename(id: string, name: string): Command<RenameOutcome> {
    return this.renameBeneficiary.execute(id, name);
  }
}
```

## 6. Composition root

The bus needs a DI token, and the token needs a home. It goes to
`shared/contracts` — but typed with the base `DomainEvent`, because that library
may not import a domain's contracts
([TD-0005](../packages/nx/adr/TD-0005-shared-kernel-stays-business-agnostic.md)):

```ts
// libs/shared/contracts/src/lib/interfaces/event-bus.interface.ts
import type { DomainEvent, EventBus } from '@tactical-ddd/core';

/** One bus per application; the precise union of events is the consumer's business. */
export type EventBusPort = EventBus<DomainEvent>;

export const EventBusPort = { $: Symbol.for('EventBusPort') };
```

Only the application sees every domain, so only here can the union be assembled
and the instance typed exactly:

```ts
// apps/mobile/src/app/composition-root.ts
import type { AuthEvent } from '@bm/auth-contracts';
import type { BeneficiaryEvent } from '@bm/beneficiaries-contracts';

export type AppEvent = AuthEvent | BeneficiaryEvent;

container
  .bind<EventBus<AppEvent>>(EventBusPort.$)
  .toDynamicValue(({ container }) => {
    const logger = container
      .get<LoggerPort>(LoggerPort.$)
      .withContext('EventBus');

    // The only place that knows how far events travel: pass a different
    // transport here to reach frames, tabs or a worker.
    return new DomainEventBus<AppEvent>({
      onError: (error, event) =>
        logger.error(`Handler failed on ${event.type}`, error),
    });
  })
  .inSingletonScope();

container
  .bind(BeneficiaryRepositoryPort.$)
  .to(SqliteBeneficiaryRepository)
  .inSingletonScope();
container
  .bind(BeneficiariesFacade.$)
  .to(CoreBeneficiariesFacade)
  .inSingletonScope();
```

**Consumers narrow the generic to what they use.** The token is shared, the type
is not: a use case declares the events it publishes, an event handler the ones it
listens for. The result is a constructor that states which facts a class deals in
— and full narrowing inside `on`, since DI checks no types at runtime.

```ts
@injectable()
export class AddBeneficiaryUseCase {
  constructor(
    @inject(BeneficiaryRepositoryPort.$)
    private readonly repository: BeneficiaryRepositoryPort,
    @inject(EventBusPort.$)
    private readonly bus: EventBus<BeneficiaryEvent>, // only its own events
  ) {}
}
```

**Subscriptions are a resource, and each has an owner.** Which owner depends on
what the subscription exists for — three different lifetimes, routinely confused:

| Lifetime    | Example                                     | Owner                                                        | Torn down on                                            |
| ----------- | ------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------- |
| application | `payments` reacting to `BeneficiaryRemoved` | composition root                                             | container disposal: unmount, a micro-frontend unloading |
| session     | an outbox syncing the signed-in account     | whatever owns the session (a state machine, a session scope) | logout, account switch, reset                           |
| screen      | `useWatch` in a component                   | the component                                                | unmount                                                 |

The handler above is **application-level**: `payments` must react to a removed
beneficiary regardless of who is signed in, so logging out changes nothing for
it.

```ts
container.bind(BeneficiaryRemovedEventHandler).toSelf().inSingletonScope();

// Live as long as the container does.
const appSubscriptions = [
  container.get(BeneficiaryRemovedEventHandler).start(),
];
```

**Session-level subscriptions are held by whoever owns the session**, and the use
case that ends it does not know they exist. It states a fact:

```ts
// libs/auth/core/src/lib/application/logout.use-case.ts
async execute(): Promise<void> {
  await this.tokens.remove(sub);
  await this.oidc.revoke(refreshToken);

  this.bus.publish({ type: 'SessionEnded', sub });   // and nothing else
}
```

Tearing down is then the owner's job. With a state machine already governing the
session, the subscriptions are a resource like any other — started on entry,
stopped on exit:

```ts
@injectable()
export class SessionSubscriptions {
  private stops: Unsubscribe[] = [];

  start(): void {
    this.stops = [this.outbox.start(), this.pushTokens.start()];
  }

  stop(): void {
    this.stops.forEach((stop) => stop());
    this.stops = [];
  }
}
```

```ts
[RootState.Active]: {
  entry: 'startSessionSubscriptions',
  exit: 'stopSessionSubscriptions',
}
```

Without such an owner, the composition root can react to the fact instead —
legitimate, and it relies on a guarantee the bus makes explicitly: an unsubscribe
during delivery takes effect at once, so a handler may stop itself from inside
its own callback.

```ts
bus.on('SessionStarted', () => sessionSubscriptions.start());
bus.on('SessionEnded', () => sessionSubscriptions.stop());
```

What not to do: pass the list of subscriptions into a domain, inject a
`SubscriptionRegistry` into a use case, or grow a `stopListening()` method on a
facade. A use case reports what happened; who reacts is not its concern, and the
moment it manages listeners it is managing infrastructure.

## 7. The neighbouring domain

`payments` reacts to a fact. It does not subscribe to `observeAll()` and diff the
list, because it needs _what happened_, not _how things are_
([TD-0009](../packages/nx/adr/TD-0009-notifications-go-to-the-bus.md)).

```ts
export class BeneficiaryRemovedEventHandler {
  constructor(
    private readonly bus: EventBus<BeneficiaryEvent>,
    private readonly cancelDrafts: CancelDraftsUseCase,
  ) {}

  start(): Unsubscribe {
    return this.bus.on('BeneficiaryRemoved', async ({ beneficiaryId }) => {
      await this.cancelDrafts.execute(beneficiaryId);
    });
  }
}
```

It knows `beneficiaries` only through its contracts — a type, not an
implementation ([TD-0003](../packages/nx/adr/TD-0003-cross-domain-through-contracts.md)).

The class is named `*EventHandler` after the fact it handles, and it lives in
`application`: it calls a use case, so it is not UI, and it decides nothing
itself, so it is not domain. When one domain handles the same fact in two ways,
the action disambiguates — `CancelDraftsOnBeneficiaryRemovedEventHandler`. A
handler with no dependencies does not need a class at all; a line in the
composition root is enough:

```ts
bus.on('BeneficiaryRemoved', ({ beneficiaryId }) =>
  container.get(CancelDraftsUseCase).execute(beneficiaryId),
);
```

Two neighbours of this role are worth telling apart before reaching for it, since
both start out looking like a handler:

- a **process manager** carries state and time — it waits for several facts, sets
  timeouts, and compensates when a step fails. That is a different design, taken
  on deliberately, not a handler that grew fields.
- a **projector** does not call a use case; it maintains a read model from
  events, so what it owns is a table, not a decision.

## 8. The screen

```tsx
const BeneficiaryList = () => {
  const facade = useBeneficiariesFacade();
  const source = useMemo(() => facade.observeAll(), [facade]);
  const state = useWatch(source); // never undefined

  switch (state.status) {
    case LoadStatus.Loading:
      return <Spinner />;
    case LoadStatus.Ready:
      return <List items={state.value} refreshing={state.stale} />;
    case LoadStatus.Failed:
      return state.value === undefined ? (
        <Failure reason={state.reason} />
      ) : (
        <List items={state.value} error={state.reason} />
      );
  }
};
```

Writing looks different on purpose — nothing is rendered from the answer:

```tsx
const submit = async (name: string) => {
  const outcome = await facade.rename(id, name);

  switch (outcome.status) {
    case RenameStatus.Renamed:
      return close(); // the new name arrives through the watch
    case RenameStatus.NameTaken:
      return setHint(`Taken. Try ${outcome.suggestion}`);
  }
};
```

The same screen in Vue differs only in the binding — `useWatch` from
[`@tactical-ddd/vue`](../packages/vue/README.md) returns a `ComputedRef` of the
same `Loadable`.

## Why the pieces are arranged this way

- **A rule exists once.** `Iban.create` is the only gate, so no caller can
  construct what the domain considers impossible.
- **A write has one path out.** Store, then announce. A failed save announces
  nothing.
- **Data has one path in.** Commands return outcomes; the state a screen shows
  comes from the watch — so there is never a second, diverging copy.
- **Freshness stops at the boundary.** `Loadable` is created in one function and
  read by the screen; use cases and entities never see it.
- **Neighbours learn facts, not state.** The bus carries what happened; anything
  that needs current data asks the owner.
- **Nothing in the domain knows where it runs.** Swapping SQLite for IndexedDB,
  or React for Vue, touches adapters and screens only.
