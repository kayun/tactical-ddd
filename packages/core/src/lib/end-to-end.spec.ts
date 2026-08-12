/**
 * The worked example from `docs/end-to-end-example.md`, compiled and run.
 *
 * Its job is not to test the primitives — each has its own spec — but to prove
 * they fit together: an aggregate records, a repository stores, a use case
 * publishes, a facade exposes, and a watch reaches a screen. If a signature in
 * the kernel changes, this file stops compiling, which is what keeps the
 * document honest.
 */
import { AggregateRoot, type DomainEvent } from './aggregate-root.js';
import { DomainError } from './domain-error.js';
import { type EventBus, DomainEventBus } from './event-bus.js';
import type { Command, Facade, Outcome, Query, Watch } from './facade.js';
import { type Loadable, LoadStatus } from './loadable.js';
import type { Repository } from './repository.js';
import type { Observer, Subscribable, Subscription } from './subscribable.js';
import type { UseCase } from './use-case.js';
import { ValueObject } from './value-object.js';

// ─── contracts ───────────────────────────────────────────────────────────────

type BeneficiaryAdded = DomainEvent<
  'BeneficiaryAdded',
  { beneficiaryId: string }
>;
type BeneficiaryRenamed = DomainEvent<
  'BeneficiaryRenamed',
  { beneficiaryId: string }
>;
type BeneficiaryEvent = BeneficiaryAdded | BeneficiaryRenamed;

/** What leaves the domain: a DTO, never the aggregate itself. */
type BeneficiaryDto = Readonly<{ id: string; name: string; iban: string }>;

enum RenameStatus {
  Renamed = 'renamed',
  NameTaken = 'nameTaken',
}

type RenameOutcome =
  | Outcome<RenameStatus.Renamed>
  | Outcome<RenameStatus.NameTaken, { suggestion: string }>;

type BeneficiariesFacade = Facade<{
  queries: { findOne(id: string): Query<BeneficiaryDto | null> };
  watches: { observeAll(): Watch<BeneficiaryDto[]> };
  commands: {
    add(id: string, name: string, iban: string): Command;
    rename(id: string, name: string): Command<RenameOutcome>;
  };
}>;

// ─── domain ──────────────────────────────────────────────────────────────────

class InvalidIbanError extends DomainError {
  constructor(raw: string) {
    super('InvalidIbanError', `"${raw}" is not a valid IBAN`);
  }
}

class Iban extends ValueObject {
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

class BeneficiaryName extends ValueObject {
  private constructor(readonly value: string) {
    super();
  }

  static create(raw: string): BeneficiaryName {
    const trimmed = raw.trim();

    if (trimmed.length === 0) {
      throw new InvalidBeneficiaryNameError();
    }

    return new BeneficiaryName(trimmed);
  }
}

class InvalidBeneficiaryNameError extends DomainError {
  constructor() {
    super('InvalidBeneficiaryNameError', 'A beneficiary needs a name');
  }
}

type BeneficiarySnapshot = Readonly<{ name: string; iban: string }>;

class Beneficiary extends AggregateRoot<string, BeneficiaryEvent> {
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
    return new Beneficiary(
      id,
      BeneficiaryName.create(snapshot.name),
      Iban.create(snapshot.iban),
    );
  }

  rename(name: BeneficiaryName): void {
    if (this.name.equals(name)) {
      return; // nothing happened, so nothing is announced
    }

    this.name = name;
    this.recordEvent({ type: 'BeneficiaryRenamed', beneficiaryId: this.id });
  }

  hasName(name: BeneficiaryName): boolean {
    return this.name.equals(name);
  }

  toSnapshot(): BeneficiarySnapshot {
    return { name: this.name.value, iban: this.iban.value };
  }

  toDto(): BeneficiaryDto {
    return { id: this.id, name: this.name.value, iban: this.iban.value };
  }
}

// ─── application: ports ──────────────────────────────────────────────────────

interface BeneficiaryRepositoryPort extends Repository<Beneficiary> {
  findByName(name: BeneficiaryName): Promise<Beneficiary | null>;

  /** Domain objects, not `Loadable`: freshness is added at the boundary. */
  observeAll(): Subscribable<Beneficiary[]>;
}

// ─── application: use cases ──────────────────────────────────────────────────

class AddBeneficiaryUseCase implements UseCase<
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
      BeneficiaryName.create(name),
      Iban.create(iban),
    );

    await this.repository.save(beneficiary);
    this.bus.publishAll(beneficiary.pullEvents());
  }
}

class RenameBeneficiaryUseCase implements UseCase<
  [id: string, name: string],
  Promise<RenameOutcome>
> {
  constructor(
    private readonly repository: BeneficiaryRepositoryPort,
    private readonly bus: EventBus<BeneficiaryEvent>,
  ) {}

  async execute(id: string, name: string): Promise<RenameOutcome> {
    const beneficiary = await this.repository.findById(id);

    if (beneficiary === null) {
      throw new BeneficiaryNotFoundError(id);
    }

    const wanted = BeneficiaryName.create(name);
    const taken = await this.repository.findByName(wanted);

    if (taken !== null && !taken.equals(beneficiary)) {
      return { status: RenameStatus.NameTaken, suggestion: `${name} (2)` };
    }

    beneficiary.rename(wanted);

    await this.repository.save(beneficiary);
    this.bus.publishAll(beneficiary.pullEvents());

    return { status: RenameStatus.Renamed };
  }
}

class BeneficiaryNotFoundError extends DomainError {
  constructor(id: string) {
    super('BeneficiaryNotFoundError', `No beneficiary ${id}`);
  }
}

/** The one place a `Loadable` is created. */
const toWatch = <TDomain, TDto>(
  source: Subscribable<TDomain[]>,
  toDto: (item: TDomain) => TDto,
): Watch<TDto[]> => ({
  subscribe(
    first: Observer<Loadable<TDto[]>> | ((state: Loadable<TDto[]>) => void),
  ): Subscription {
    const next = typeof first === 'function' ? first : first.next;

    next({ status: LoadStatus.Loading });

    return source.subscribe((items) =>
      next({
        status: LoadStatus.Ready,
        value: items.map(toDto),
        stale: false,
      }),
    );
  },
});

// ─── application: facade ─────────────────────────────────────────────────────

class CoreBeneficiariesFacade implements BeneficiariesFacade {
  constructor(
    private readonly repository: BeneficiaryRepositoryPort,
    private readonly addBeneficiary: AddBeneficiaryUseCase,
    private readonly renameBeneficiary: RenameBeneficiaryUseCase,
  ) {}

  async findOne(id: string): Query<BeneficiaryDto | null> {
    const found = await this.repository.findById(id);

    return found?.toDto() ?? null;
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

// ─── infrastructure ──────────────────────────────────────────────────────────

class InMemoryBeneficiaryRepository implements BeneficiaryRepositoryPort {
  private readonly stored = new Map<string, BeneficiarySnapshot>();

  private readonly watchers = new Set<(items: Beneficiary[]) => void>();

  findById(id: string): Promise<Beneficiary | null> {
    const snapshot = this.stored.get(id);

    return Promise.resolve(
      snapshot ? Beneficiary.fromSnapshot(id, snapshot) : null,
    );
  }

  findByName(name: BeneficiaryName): Promise<Beneficiary | null> {
    return Promise.resolve(this.loadAll().find((b) => b.hasName(name)) ?? null);
  }

  save(beneficiary: Beneficiary): Promise<void> {
    this.stored.set(beneficiary.id, beneficiary.toSnapshot());
    this.notify();

    return Promise.resolve();
  }

  remove(id: string): Promise<void> {
    this.stored.delete(id);
    this.notify();

    return Promise.resolve();
  }

  observeAll(): Subscribable<Beneficiary[]> {
    return {
      subscribe: (
        first: Observer<Beneficiary[]> | ((items: Beneficiary[]) => void),
      ): Subscription => {
        const next = typeof first === 'function' ? first : first.next;

        this.watchers.add(next);
        next(this.loadAll());

        return { unsubscribe: () => this.watchers.delete(next) };
      },
    };
  }

  private loadAll(): Beneficiary[] {
    return [...this.stored].map(([id, snapshot]) =>
      Beneficiary.fromSnapshot(id, snapshot),
    );
  }

  private notify(): void {
    const items = this.loadAll();

    this.watchers.forEach((watcher) => watcher(items));
  }
}

// ─── the whole thing, wired and exercised ────────────────────────────────────

const wire = () => {
  const bus = new DomainEventBus<BeneficiaryEvent>();
  const repository = new InMemoryBeneficiaryRepository();
  const facade: BeneficiariesFacade = new CoreBeneficiariesFacade(
    repository,
    new AddBeneficiaryUseCase(repository, bus),
    new RenameBeneficiaryUseCase(repository, bus),
  );

  return { bus, facade };
};

describe('a domain built out of the kernel', () => {
  it('stores first and announces second', async () => {
    const { bus, facade } = wire();
    const announced: BeneficiaryEvent[] = [];

    bus.on('BeneficiaryAdded', (event) => void announced.push(event));

    await facade.add('1', 'Alice', 'DE89 3704 0044 0532 0130 00');

    expect(announced).toEqual([
      { type: 'BeneficiaryAdded', beneficiaryId: '1' },
    ]);
    expect(await facade.findOne('1')).toEqual({
      id: '1',
      name: 'Alice',
      iban: 'DE89370400440532013000',
    });
  });

  it('drives a screen through one watch', async () => {
    const { facade } = wire();
    const states: Loadable<BeneficiaryDto[]>[] = [];

    facade.observeAll().subscribe((state) => states.push(state));

    expect(states[0]).toEqual({ status: LoadStatus.Loading });

    await facade.add('1', 'Alice', 'DE89 3704 0044 0532 0130 00');

    // The write reaches the screen through the same subscription — no refetch.
    expect(states.at(-1)).toEqual({
      status: LoadStatus.Ready,
      stale: false,
      value: [{ id: '1', name: 'Alice', iban: 'DE89370400440532013000' }],
    });
  });

  it('answers a command with an outcome, not with data', async () => {
    const { facade } = wire();

    await facade.add('1', 'Alice', 'DE89 3704 0044 0532 0130 00');
    await facade.add('2', 'Bob', 'FR14 2004 1010 0505 0001 3M02 606');

    expect(await facade.rename('2', 'Alice')).toEqual({
      status: RenameStatus.NameTaken,
      suggestion: 'Alice (2)',
    });
    expect(await facade.rename('2', 'Bobby')).toEqual({
      status: RenameStatus.Renamed,
    });
  });

  it('refuses to build an aggregate that breaks a rule', async () => {
    const { facade } = wire();

    await expect(facade.add('1', 'Alice', 'nonsense')).rejects.toBeInstanceOf(
      DomainError,
    );
  });

  it('says nothing when a rename changes nothing', async () => {
    const { bus, facade } = wire();
    const announced: BeneficiaryEvent[] = [];

    bus.on('BeneficiaryRenamed', (event) => void announced.push(event));

    await facade.add('1', 'Alice', 'DE89 3704 0044 0532 0130 00');
    await facade.rename('1', 'Alice');

    expect(announced).toEqual([]);
  });
});
