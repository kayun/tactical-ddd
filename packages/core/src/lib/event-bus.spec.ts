import type { DomainEvent } from './aggregate-root.js';
import { InMemoryEventBus } from './event-bus.js';

type BeneficiaryAdded = DomainEvent<'BeneficiaryAdded', { id: string }>;
type BeneficiaryRemoved = DomainEvent<'BeneficiaryRemoved', { id: string }>;
type BeneficiaryEvent = BeneficiaryAdded | BeneficiaryRemoved;

const added = (id: string): BeneficiaryAdded => ({
  type: 'BeneficiaryAdded',
  id,
});
const removed = (id: string): BeneficiaryRemoved => ({
  type: 'BeneficiaryRemoved',
  id,
});

let bus: InMemoryEventBus<BeneficiaryEvent>;
let errors: unknown[];

beforeEach(() => {
  errors = [];
  bus = new InMemoryEventBus<BeneficiaryEvent>((error) => errors.push(error));
});

describe('InMemoryEventBus', () => {
  it('delivers a fact to everyone listening for it', () => {
    const seen: string[] = [];

    bus.on('BeneficiaryAdded', (event) => void seen.push(`first:${event.id}`));
    bus.on('BeneficiaryAdded', (event) => void seen.push(`second:${event.id}`));
    bus.on('BeneficiaryRemoved', () => void seen.push('removed'));

    bus.publish(added('1'));

    expect(seen).toEqual(['first:1', 'second:1']);
  });

  it('narrows the payload to the type subscribed to', () => {
    const ids: string[] = [];

    bus.on('BeneficiaryRemoved', (event) => {
      // `event` is BeneficiaryRemoved here, no cast needed.
      ids.push(event.id);
    });

    bus.publish(removed('7'));

    expect(ids).toEqual(['7']);
  });

  it('publishes a batch in order', () => {
    const seen: string[] = [];

    bus.on('BeneficiaryAdded', (event) => void seen.push(event.id));

    bus.publishAll([added('1'), added('2'), added('3')]);

    expect(seen).toEqual(['1', '2', '3']);
  });

  it('stops delivering once unsubscribed, and unsubscribing twice is safe', () => {
    const seen: string[] = [];
    const stop = bus.on('BeneficiaryAdded', (e) => void seen.push(e.id));

    bus.publish(added('1'));
    stop();
    stop();
    bus.publish(added('2'));

    expect(seen).toEqual(['1']);
  });

  it('honours an unsubscribe made during delivery', () => {
    const seen: string[] = [];

    const stopSecond = bus.on('BeneficiaryAdded', () => void seen.push('b'));
    bus.on('BeneficiaryAdded', () => stopSecond());

    // The first handler runs, the second unsubscribes 'b' before its turn.
    expect(seen).toEqual([]);
  });

  it('does not deliver the current event to a handler added during delivery', () => {
    const seen: string[] = [];

    bus.on('BeneficiaryAdded', () => {
      bus.on('BeneficiaryAdded', () => void seen.push('late'));
    });

    bus.publish(added('1'));

    expect(seen).toEqual([]);

    bus.publish(added('2'));

    expect(seen).toEqual(['late']);
  });

  it('keeps going when a handler throws, and reports the failure', () => {
    const seen: string[] = [];
    const boom = new Error('boom');

    bus.on('BeneficiaryAdded', () => {
      throw boom;
    });
    bus.on('BeneficiaryAdded', () => void seen.push('still here'));

    expect(() => bus.publish(added('1'))).not.toThrow();
    expect(seen).toEqual(['still here']);
    expect(errors).toEqual([boom]);
  });

  it('keeps a failed handler subscribed', () => {
    let calls = 0;

    bus.on('BeneficiaryAdded', () => {
      calls += 1;
      throw new Error('boom');
    });

    bus.publish(added('1'));
    bus.publish(added('2'));

    expect(calls).toBe(2);
    expect(errors).toHaveLength(2);
  });

  it('reports a rejected async handler without unhandled rejections', async () => {
    const boom = new Error('async boom');

    bus.on('BeneficiaryAdded', () => Promise.reject(boom));

    bus.publish(added('1'));
    await Promise.resolve();

    expect(errors).toEqual([boom]);
  });

  it('queues a re-entrant publish instead of nesting it', () => {
    const seen: string[] = [];

    bus.on('BeneficiaryAdded', (event) => {
      seen.push(`added:${event.id}`);

      if (event.id === '1') {
        bus.publish(removed('1'));
        // The removal has not been delivered yet — this line still runs first.
        seen.push('after-publish');
      }
    });
    bus.on(
      'BeneficiaryRemoved',
      (event) => void seen.push(`removed:${event.id}`),
    );

    bus.publish(added('1'));

    expect(seen).toEqual(['added:1', 'after-publish', 'removed:1']);
  });

  it('survives a long chain of re-entrant publishes', () => {
    let delivered = 0;

    bus.on('BeneficiaryAdded', (event) => {
      delivered += 1;

      const next = Number(event.id) + 1;

      if (next <= 10_000) {
        bus.publish(added(String(next)));
      }
    });

    // A recursive implementation would overflow the stack here.
    expect(() => bus.publish(added('1'))).not.toThrow();
    expect(delivered).toBe(10_000);
  });

  it('ignores a fact nobody listens for', () => {
    expect(() => bus.publish(added('1'))).not.toThrow();
    expect(errors).toEqual([]);
  });
});

const typed = new InMemoryEventBus<BeneficiaryEvent>();

// @ts-expect-error — not one of the bus's event types
typed.on('BeneficiaryRenamed', () => undefined);

// @ts-expect-error — the handler is narrowed: this type has no `name`
typed.on('BeneficiaryAdded', (event) => void event.name);

// @ts-expect-error — publishing something the bus does not carry
typed.publish({ type: 'BeneficiaryRenamed', id: '1' });
