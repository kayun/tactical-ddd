import type { DomainEvent } from './aggregate-root.js';
import type { Unsubscribe } from './unsubscribe.js';

/**
 * Reacts to a fact. May be asynchronous, but nobody waits for it: a handler is
 * a separate piece of work, not a continuation of the publisher's.
 */
export type EventHandler<TEvent extends DomainEvent> = (
  event: TEvent,
) => void | Promise<void>;

/**
 * Carries facts between domains — one publisher, any number of listeners, none
 * of whom the publisher knows about.
 *
 * It moves *events*, not requests: there is no reply, no correlation id and no
 * timeout, because a caller that needs an answer is asking a question and should
 * call a facade instead. Mixing the two is what turns a bus into an RPC layer
 * with none of the guarantees.
 */
export interface EventBus<TEvent extends DomainEvent = DomainEvent> {
  publish(event: TEvent): void;

  /** Publishes in order — typically everything an aggregate recorded. */
  publishAll(events: readonly TEvent[]): void;

  /**
   * Listens for one type of fact. The handler is narrowed to that type, so the
   * payload needs no casting.
   *
   * Returns the way to stop listening; calling it twice is safe.
   */
  on<TType extends TEvent['type']>(
    type: TType,
    handler: EventHandler<Extract<TEvent, { type: TType }>>,
  ): Unsubscribe;
}

/**
 * Last resort for a handler that failed: rethrow outside the delivery loop, so
 * the environment reports it the way it reports any unhandled error, while the
 * remaining handlers still run.
 */
function reportUnhandled(error: unknown): void {
  queueMicrotask(() => {
    throw error;
  });
}

/**
 * The bus for a single process: publishing reaches every listener registered at
 * that moment, in the order they subscribed.
 *
 * Three guarantees, each one a failure mode seen in the wild:
 *
 * - **A failing handler cannot take the bus down.** Errors — thrown or rejected
 *   — are reported through `onError` and delivery continues. A subscription is
 *   never dropped because it once threw.
 * - **Delivery is synchronous, and re-entrant publishes are queued.** A handler
 *   that publishes gets its event delivered after the current one finishes, so
 *   the order is the order things happened, and a chain of events cannot grow
 *   the stack.
 * - **The test double is this class.** Nothing about timing differs between it
 *   and production, which is what stops a bus from working in one and not the
 *   other.
 */
export class InMemoryEventBus<
  TEvent extends DomainEvent = DomainEvent,
> implements EventBus<TEvent> {
  private readonly handlers = new Map<string, Set<EventHandler<TEvent>>>();

  private readonly pending: TEvent[] = [];

  private delivering = false;

  constructor(
    private readonly onError: (
      error: unknown,
      event: TEvent,
    ) => void = reportUnhandled,
  ) {}

  publish(event: TEvent): void {
    this.pending.push(event);
    this.deliver();
  }

  publishAll(events: readonly TEvent[]): void {
    this.pending.push(...events);
    this.deliver();
  }

  on<TType extends TEvent['type']>(
    type: TType,
    handler: EventHandler<Extract<TEvent, { type: TType }>>,
  ): Unsubscribe {
    const forType = this.handlers.get(type) ?? new Set<EventHandler<TEvent>>();

    forType.add(handler as EventHandler<TEvent>);
    this.handlers.set(type, forType);

    return () => {
      forType.delete(handler as EventHandler<TEvent>);

      if (forType.size === 0) {
        this.handlers.delete(type);
      }
    };
  }

  private deliver(): void {
    if (this.delivering) {
      // A handler published while we were delivering; the loop below will pick
      // it up rather than recursing into it.
      return;
    }

    this.delivering = true;

    try {
      let event = this.pending.shift();

      while (event !== undefined) {
        this.deliverOne(event);
        event = this.pending.shift();
      }
    } finally {
      this.delivering = false;
    }
  }

  private deliverOne(event: TEvent): void {
    const forType = this.handlers.get(event.type);

    if (forType === undefined) {
      return;
    }

    // A copy, so subscribing during delivery does not extend this round; the
    // membership check keeps an unsubscribe during delivery effective at once.
    for (const handler of [...forType]) {
      if (!forType.has(handler)) {
        continue;
      }

      try {
        void Promise.resolve(handler(event)).catch((error: unknown) =>
          this.onError(error, event),
        );
      } catch (error) {
        this.onError(error, event);
      }
    }
  }
}
