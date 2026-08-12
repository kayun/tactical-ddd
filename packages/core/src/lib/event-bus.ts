import type { DomainEvent } from './aggregate-root.js';
import {
  type EventTransport,
  InMemoryEventTransport,
} from './event-transport.js';
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

export type EventBusOptions<TEvent extends DomainEvent> = Readonly<{
  /** Where events travel. Defaults to this JavaScript context only. */
  transport?: EventTransport;

  /**
   * Where a failed handler is reported. Defaults to rethrowing in a microtask,
   * so the platform surfaces it rather than the bus swallowing it.
   */
  onError?: (error: unknown, event: TEvent) => void;
}>;

/**
 * The bus every workspace starts with: subscriptions by event type, delivered
 * over an {@link EventTransport}.
 *
 * Reach is the transport's business — swap {@link InMemoryEventTransport} for
 * one over frames, tabs or a socket and nothing here changes. What stays with
 * the bus are the guarantees:
 *
 * - **A failing handler cannot take the bus down.** Errors — thrown or rejected
 *   — go to `onError` and delivery continues. A subscription is never dropped
 *   because it once threw.
 * - **Delivery is synchronous, and re-entrant publishes are queued.** A handler
 *   that publishes gets its event delivered after the current one finishes, so
 *   the order is the order things happened, and a chain of events cannot grow
 *   the stack.
 * - **The test double is this class.** Nothing about timing differs between it
 *   and production, which is what stops a bus from working in one and not the
 *   other.
 */
export class DomainEventBus<
  TEvent extends DomainEvent = DomainEvent,
> implements EventBus<TEvent> {
  private readonly handlers = new Map<string, Set<EventHandler<TEvent>>>();

  private readonly pending: TEvent[] = [];

  private readonly transport: EventTransport;

  private readonly onError: (error: unknown, event: TEvent) => void;

  private delivering = false;

  constructor(options: EventBusOptions<TEvent> = {}) {
    this.transport = options.transport ?? new InMemoryEventTransport();
    this.onError = options.onError ?? reportUnhandled;

    // Everything reaches subscribers the same way, including this bus's own
    // publishes — one path in, so a remote event behaves like a local one.
    this.transport.receive((event) => this.enqueue(event as TEvent));
  }

  publish(event: TEvent): void {
    this.transport.send(event);
  }

  publishAll(events: readonly TEvent[]): void {
    events.forEach((event) => this.transport.send(event));
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

  private enqueue(event: TEvent): void {
    this.pending.push(event);

    if (this.delivering) {
      // A handler published while we were delivering; the loop below will pick
      // it up rather than recursing into it.
      return;
    }

    this.delivering = true;

    try {
      let next = this.pending.shift();

      while (next !== undefined) {
        this.deliver(next);
        next = this.pending.shift();
      }
    } finally {
      this.delivering = false;
    }
  }

  private deliver(event: TEvent): void {
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
