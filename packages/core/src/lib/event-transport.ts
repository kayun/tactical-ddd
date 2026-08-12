import type { DomainEvent } from './aggregate-root.js';
import type { Unsubscribe } from './unsubscribe.js';

/**
 * Moves events from wherever they were published to wherever they are handled.
 *
 * The bus owns typing, ordering and error isolation; a transport owns reach —
 * one process, several frames, another tab, a worker, a socket. Replacing it is
 * how a workspace grows past a single JavaScript context without any subscriber
 * noticing.
 *
 * **A transport must loop back.** Whatever is sent has to reach the receivers of
 * the sending side too — the bus has no second path to its own subscribers. An
 * adapter over a channel that excludes the sender (`BroadcastChannel` does)
 * delivers locally *and* forwards.
 *
 * **What crosses a process boundary must survive the trip.** An in-process
 * transport passes references; anything else serialises, so events carried by it
 * hold plain data — no value objects, no `Date`, no functions.
 */
export interface EventTransport {
  send(event: DomainEvent): void;

  /** Registers a receiver; the returned function detaches it. */
  receive(handler: (event: DomainEvent) => void): Unsubscribe;
}

/**
 * The transport for a single JavaScript context: hands the event straight to
 * every receiver, synchronously, in the order they attached.
 *
 * This is the default, and in a plain application the only one. Micro-frontends
 * sharing a `window` still use it — they need one *instance*, provided by the
 * host, not a different transport.
 */
export class InMemoryEventTransport implements EventTransport {
  private readonly receivers = new Set<(event: DomainEvent) => void>();

  send(event: DomainEvent): void {
    // A copy, so attaching during delivery does not extend this round; the
    // membership check makes a detach during delivery effective at once.
    for (const receiver of [...this.receivers]) {
      if (this.receivers.has(receiver)) {
        receiver(event);
      }
    }
  }

  receive(handler: (event: DomainEvent) => void): Unsubscribe {
    this.receivers.add(handler);

    return () => {
      this.receivers.delete(handler);
    };
  }
}
