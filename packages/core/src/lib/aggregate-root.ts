import { Entity, type EntityId } from './entity.js';

/**
 * Something that happened in a domain, stated as a fact in the past tense.
 *
 * The `type` tag is the whole contract: subscribers switch on it, so it must be
 * a literal the publisher owns. What travels alongside is the domain's choice —
 * but a fact, not a state dump: identifiers and the few values that make the
 * fact meaningful. An event carrying an entire entity turns the bus into a data
 * channel and couples subscribers to the publisher's shape.
 *
 * ```ts
 * export type BeneficiaryRemoved = DomainEvent<
 *   'BeneficiaryRemoved',
 *   { beneficiaryId: string }
 * >;
 * ```
 */
export type DomainEvent<
  TType extends string = string,
  TPayload extends object = Record<never, never>,
> = Readonly<{ type: TType } & TPayload>;

/**
 * The entry point of an aggregate — the one object the outside world addresses,
 * and the one that owns the invariants across everything inside its boundary.
 *
 * Everything within the boundary is consistent immediately, in a single save;
 * anything outside it is reached by identity and updated later, in response to
 * an event. That is what makes the boundary a decision rather than a diagram:
 * it says what must be true at once, and what is allowed to lag.
 *
 * The root records events instead of publishing them. Publishing from inside a
 * domain method would announce a change that has not been stored yet and cannot
 * be undone if the save fails; recording leaves the caller to drain them once
 * the write succeeded.
 *
 * ```ts
 * class Order extends AggregateRoot<string, OrderEvent> {
 *   addLine(line: OrderLine): void {
 *     if (this.lines.length >= MAX_LINES) {
 *       throw new TooManyLinesError();  // the invariant lives here
 *     }
 *
 *     this.lines.push(line);
 *     this.recordEvent({ type: 'OrderLineAdded', orderId: this.id });
 *   }
 * }
 * ```
 */
export abstract class AggregateRoot<
  TId extends EntityId = string,
  TEvent extends DomainEvent = DomainEvent,
> extends Entity<TId> {
  private readonly recordedEvents: TEvent[] = [];

  /**
   * Notes that something happened. Available to the aggregate's own methods
   * only: an event is a consequence of a decision the root took, so nobody
   * outside it is in a position to record one.
   */
  protected recordEvent(event: TEvent): void {
    this.recordedEvents.push(event);
  }

  /**
   * Hands over everything recorded so far and forgets it, in the order it
   * happened.
   *
   * Called after the aggregate has been stored — publishing before that would
   * announce a change that may still fail. Draining rather than reading keeps a
   * retry from emitting the same event twice.
   */
  pullEvents(): readonly TEvent[] {
    return this.recordedEvents.splice(0, this.recordedEvents.length);
  }

  /** Whether anything is waiting to be published. */
  get hasRecordedEvents(): boolean {
    return this.recordedEvents.length > 0;
  }
}
