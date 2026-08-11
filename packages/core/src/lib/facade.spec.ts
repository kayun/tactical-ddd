import type {
  Command,
  CommandsOf,
  Facade,
  Outcome,
  QueriesOf,
  Query,
  Watch,
  WatchesOf,
} from './facade.js';
import type { Remote } from './remote.js';
import type { Observer, Subscription } from './subscribable.js';

type Beneficiary = Readonly<{ id: string; name: string }>;

type BeneficiariesSpec = Readonly<{
  queries: {
    findOne(id: string): Query<Beneficiary | null>;
  };
  watches: {
    observeAll(): Watch<Beneficiary[]>;
  };
  commands: {
    rename(id: string, name: string): Command;
  };
}>;

type BeneficiariesFacade = Facade<BeneficiariesSpec>;

/** A one-value stream, enough to exercise the shape without pulling in rxjs. */
const readyOnce = <T>(value: T): Watch<T> => ({
  subscribe: (
    first: Observer<Remote<T>> | ((state: Remote<T>) => void),
  ): Subscription => {
    const next = typeof first === 'function' ? first : first.next;

    next({ status: 'ready', value, stale: false });

    return { unsubscribe: () => undefined };
  },
});

const alice: Beneficiary = { id: '1', name: 'Alice' };

const makeFacade = (): BeneficiariesFacade => {
  const beneficiaries = new Map<string, Beneficiary>([[alice.id, alice]]);

  return {
    findOne: (id) => Promise.resolve(beneficiaries.get(id) ?? null),
    observeAll: () => readyOnce([...beneficiaries.values()]),
    rename: async (id, name) => {
      const found = beneficiaries.get(id);

      if (found) {
        beneficiaries.set(id, { ...found, name });
      }
    },
  };
};

describe('Facade', () => {
  it('flattens the groups into plain methods', async () => {
    const facade = makeFacade();

    await facade.rename('1', 'Alicia');

    await expect(facade.findOne('1')).resolves.toEqual({
      id: '1',
      name: 'Alicia',
    });
    expect(await facade.findOne('missing')).toBeNull();
  });

  it('publishes watches as streams of state', () => {
    const states: Remote<Beneficiary[]>[] = [];

    const subscription = makeFacade()
      .observeAll()
      .subscribe((state) => states.push(state));

    expect(states).toEqual([{ status: 'ready', value: [alice], stale: false }]);
    expect(() => subscription.unsubscribe()).not.toThrow();
  });

  it('narrows a facade to its reads', () => {
    const reads: QueriesOf<BeneficiariesSpec> = makeFacade();

    expect(typeof reads.findOne).toBe('function');
    expect(typeof reads.observeAll).toBe('function');
    // @ts-expect-error — a command is not part of the read-only slice
    expect(typeof reads.rename).toBe('function');
  });

  it('narrows a facade to its writes and its watches', () => {
    const writes: CommandsOf<BeneficiariesSpec> = makeFacade();
    const watches: WatchesOf<BeneficiariesSpec> = makeFacade();

    expect(typeof writes.rename).toBe('function');
    expect(typeof watches.observeAll).toBe('function');
    // @ts-expect-error — a query is not a command
    expect(typeof writes.findOne).toBe('function');
  });
});

/** A domain with nothing to watch omits the group; the others still resolve. */
export type WithoutWatches = Facade<{
  queries: { getToken(): Query<string | null> };
  commands: { logout(): Command };
}>;

const tokenOnly: WithoutWatches = {
  getToken: () => Promise.resolve(null),
  logout: () => Promise.resolve(),
};

describe('FacadeSpec', () => {
  it('keeps a spec valid when a group is omitted', async () => {
    await tokenOnly.logout();

    expect(await tokenOnly.getToken()).toBeNull();
  });
});

type Renamed = Outcome<'renamed'>;
type Rejected = Outcome<'rejected', { attemptsRemaining: number }>;

type RenameSpec = Readonly<{
  commands: { rename(id: string, name: string): Command<Renamed | Rejected> };
}>;

describe('Outcome', () => {
  it('lets a command report how it went', async () => {
    const facade: Facade<RenameSpec> = {
      rename: (_id, name) =>
        Promise.resolve(
          name.length > 0
            ? { status: 'renamed' }
            : { status: 'rejected', attemptsRemaining: 2 },
        ),
    };

    expect(await facade.rename('1', 'Alicia')).toEqual({ status: 'renamed' });
    expect(await facade.rename('1', '')).toEqual({
      status: 'rejected',
      attemptsRemaining: 2,
    });
  });
});

// @ts-expect-error — a command may not resolve to an entity
export type EntityFromCommand = Command<Beneficiary>;

// @ts-expect-error — nor to a collection of them
export type ListFromCommand = Command<Beneficiary[]>;

// @ts-expect-error — nor to a bare value, however small (a token, an id)
export type ScalarFromCommand = Command<string>;

// @ts-expect-error — wrapping domain data in an outcome does not launder it
export type EntityInOutcome = Outcome<'created', { created: Beneficiary }>;

// @ts-expect-error — a promise-returning write does not belong in `watches`
export type CommandInWatches = Facade<{ watches: { save(): Command } }>;

// @ts-expect-error — a read that resolves to data is not a command
export type QueryInCommands = Facade<{
  commands: { findOne(id: string): Query<Beneficiary | null> };
}>;

// @ts-expect-error — a stream is not a one-shot read
export type WatchInQueries = Facade<{
  queries: { all(): Watch<Beneficiary[]> };
}>;

// @ts-expect-error — a stream is not a command either
export type WatchInCommands = Facade<{ commands: { all(): Watch<string> } }>;

// @ts-expect-error — a method returning neither a promise nor a stream has no group
export type SyncMethod = Facade<{ queries: { count(): number } }>;

// @ts-expect-error — `events` is not a facade group: notifications go to the bus
export type InventedGroup = Facade<{
  queries: { findOne(id: string): Query<Beneficiary | null> };
  events: { onRenamed(): Watch<Beneficiary> };
}>;
