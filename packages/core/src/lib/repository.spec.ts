import { Entity } from './entity.js';
import type {
  FindsById,
  KeyValueStore,
  Removes,
  Repository,
  Saves,
} from './repository.js';

class Order extends Entity {
  private constructor(
    id: string,
    readonly total: number,
  ) {
    super(id);
  }

  static create(id: string, total: number): Order {
    return new Order(id, total);
  }
}

type TokenSet = Readonly<{ accessToken: string; refreshToken: string }>;

interface OrderRepositoryPort extends Repository<Order> {
  findOverdue(): Promise<Order[]>;
}

/** An audit log is written and read, never deleted — so it takes two parts. */
interface AuditLogRepositoryPort extends FindsById<Order>, Saves<Order> {}

const makeOrderRepository = (): OrderRepositoryPort => {
  const orders = new Map<string, Order>();

  return {
    findById: (id) => Promise.resolve(orders.get(id) ?? null),
    save: (order) => {
      orders.set(order.id, order);

      return Promise.resolve();
    },
    remove: (id) => {
      orders.delete(id);

      return Promise.resolve();
    },
    findOverdue: () =>
      Promise.resolve(
        [...orders.values()].filter((order) => order.total > 100),
      ),
  };
};

const makeTokenStore = (): KeyValueStore<TokenSet> => {
  const values = new Map<string, TokenSet>();

  return {
    get: (key) => Promise.resolve(values.get(key) ?? null),
    set: (key, value) => {
      values.set(key, value);

      return Promise.resolve();
    },
    remove: (key) => {
      values.delete(key);

      return Promise.resolve();
    },
  };
};

describe('Repository', () => {
  it('addresses entities by the identity they carry', async () => {
    const repository = makeOrderRepository();
    const order = Order.create('1', 250);

    // `save` takes one argument: the entity already knows which one it is.
    await repository.save(order);

    expect(await repository.findById('1')).toBe(order);
    expect(await repository.findOverdue()).toEqual([order]);

    await repository.remove('1');

    expect(await repository.findById('1')).toBeNull();
  });

  it('composes into a port that offers only some of the operations', async () => {
    const log: AuditLogRepositoryPort = makeOrderRepository();

    await log.save(Order.create('2', 10));

    expect(await log.findById('2')).not.toBeNull();
    // @ts-expect-error — this port deliberately has no remove
    expect(typeof log.remove).toBe('function');
  });
});

describe('KeyValueStore', () => {
  it('addresses values by a key supplied from outside', async () => {
    const tokens = makeTokenStore();
    const value: TokenSet = { accessToken: 'a', refreshToken: 'r' };

    await tokens.set('user-1', value);

    expect(await tokens.get('user-1')).toBe(value);
    expect(await tokens.get('user-2')).toBeNull();

    await tokens.remove('user-1');

    expect(await tokens.get('user-1')).toBeNull();
  });

  it('narrows to a read-only view without another named type', async () => {
    const tokens = makeTokenStore();
    await tokens.set('user-1', { accessToken: 'a', refreshToken: 'r' });

    const readOnly: Pick<KeyValueStore<TokenSet>, 'get'> = tokens;

    expect(await readOnly.get('user-1')).not.toBeNull();
    // @ts-expect-error — a read-only view cannot write
    expect(typeof readOnly.set).toBe('function');
  });
});

// @ts-expect-error — a DTO has no identity, so it cannot be kept in a repository
export type DtoRepository = Repository<TokenSet>;

// @ts-expect-error — nor found by one
export type DtoLookup = FindsById<TokenSet>;

// @ts-expect-error — nor saved as one; `save(id, value)` belongs to a store
export type DtoSave = Saves<TokenSet>;

// @ts-expect-error — a bare value is not an entity either
export type StringRepository = Repository<string>;

/** The same data is perfectly at home in a store. */
export type TokenStorePort = KeyValueStore<TokenSet>;

/** Identity may itself be a value object, as long as it compares itself. */
export type OrdersByRef = Removes<{ equals(other: unknown): boolean }>;
