import type { DomainEvent } from './aggregate-root.js';
import { InMemoryEventTransport } from './event-transport.js';

const ping = (id: string): DomainEvent<'Ping', { id: string }> => ({
  type: 'Ping',
  id,
});

let transport: InMemoryEventTransport;

beforeEach(() => {
  transport = new InMemoryEventTransport();
});

describe('InMemoryEventTransport', () => {
  it('hands an event to every receiver, in the order they attached', () => {
    const seen: string[] = [];

    transport.receive(() => void seen.push('first'));
    transport.receive(() => void seen.push('second'));

    transport.send(ping('1'));

    expect(seen).toEqual(['first', 'second']);
  });

  it('loops back: the sender receives what it sent', () => {
    const seen: DomainEvent[] = [];

    transport.receive((event) => void seen.push(event));
    transport.send(ping('1'));

    // Without this the bus would never see its own publishes.
    expect(seen).toEqual([ping('1')]);
  });

  it('passes the event through untouched', () => {
    const event = ping('1');
    let received: DomainEvent | undefined;

    transport.receive((incoming) => void (received = incoming));
    transport.send(event);

    // In-process: the same reference, no serialisation.
    expect(received).toBe(event);
  });

  it('stops delivering once detached, and detaching twice is safe', () => {
    const seen: string[] = [];
    const detach = transport.receive(() => void seen.push('x'));

    transport.send(ping('1'));
    detach();
    detach();
    transport.send(ping('2'));

    expect(seen).toEqual(['x']);
  });

  it('honours a detach made during delivery', () => {
    const seen: string[] = [];

    const detachSecond = transport.receive(() => void seen.push('second'));
    transport.receive(() => detachSecond());

    // The receiver that detaches runs first; 'second' never gets its turn.
    expect(seen).toEqual([]);
  });

  it('does not deliver the current event to a receiver attached during delivery', () => {
    const seen: string[] = [];

    transport.receive(() => {
      transport.receive(() => void seen.push('late'));
    });

    transport.send(ping('1'));
    expect(seen).toEqual([]);

    transport.send(ping('2'));
    expect(seen).toEqual(['late']);
  });

  it('delivers nothing when nobody is attached', () => {
    expect(() => transport.send(ping('1'))).not.toThrow();
  });
});
