import { AggregateRoot, type DomainEvent } from './aggregate-root.js';
import { Entity } from './entity.js';

type LineAdded = DomainEvent<'OrderLineAdded', { orderId: string }>;
type Placed = DomainEvent<'OrderPlaced', { orderId: string }>;
type OrderEvent = LineAdded | Placed;

class TooManyLinesError extends Error {}

const MAX_LINES = 2;

class Order extends AggregateRoot<string, OrderEvent> {
  private readonly lines: string[] = [];

  constructor(id: string) {
    super(id);
  }

  addLine(product: string): void {
    if (this.lines.length >= MAX_LINES) {
      throw new TooManyLinesError();
    }

    this.lines.push(product);
    this.recordEvent({ type: 'OrderLineAdded', orderId: this.id });
  }

  place(): void {
    this.recordEvent({ type: 'OrderPlaced', orderId: this.id });
  }

  get lineCount(): number {
    return this.lines.length;
  }
}

describe('AggregateRoot', () => {
  it('is an entity: identity survives every change of state', () => {
    const order = new Order('1');

    order.addLine('book');

    expect(order.equals(new Order('1'))).toBe(true);
    expect(order.equals(new Order('2'))).toBe(false);
  });

  it('records events in the order they happened', () => {
    const order = new Order('1');

    order.addLine('book');
    order.place();

    expect(order.pullEvents()).toEqual([
      { type: 'OrderLineAdded', orderId: '1' },
      { type: 'OrderPlaced', orderId: '1' },
    ]);
  });

  it('forgets what it handed over, so a retry cannot publish twice', () => {
    const order = new Order('1');
    order.place();

    expect(order.pullEvents()).toHaveLength(1);
    expect(order.pullEvents()).toEqual([]);
  });

  it('reports whether anything is waiting', () => {
    const order = new Order('1');

    expect(order.hasRecordedEvents).toBe(false);

    order.place();
    expect(order.hasRecordedEvents).toBe(true);

    order.pullEvents();
    expect(order.hasRecordedEvents).toBe(false);
  });

  it('records nothing when an invariant refuses the change', () => {
    const order = new Order('1');
    order.addLine('book');
    order.addLine('pen');

    expect(() => order.addLine('lamp')).toThrow(TooManyLinesError);

    // The rejected line left no trace: two events, not three.
    expect(order.pullEvents()).toHaveLength(2);
    expect(order.lineCount).toBe(MAX_LINES);
  });

  it('keeps the drained list detached from the aggregate', () => {
    const order = new Order('1');
    order.place();

    const drained = order.pullEvents() as OrderEvent[];
    drained.push({ type: 'OrderPlaced', orderId: 'forged' });

    expect(order.hasRecordedEvents).toBe(false);
  });

  it('is not equal to a plain entity with the same id', () => {
    class PlainShipment extends Entity {
      constructor(id: string) {
        super(id);
      }
    }

    expect(new Order('1').equals(new PlainShipment('1'))).toBe(false);
  });
});

const order = new Order('1');

// @ts-expect-error — only the aggregate itself decides that something happened
order.recordEvent({ type: 'OrderPlaced', orderId: '1' });

class Shipment extends AggregateRoot<string, OrderEvent> {
  constructor(id: string) {
    super(id);
  }

  dispatch(): void {
    // @ts-expect-error — not one of the event types this aggregate declares
    this.recordEvent({ type: 'ShipmentDispatched', orderId: this.id });
  }
}

export type ShipmentAggregate = Shipment;
