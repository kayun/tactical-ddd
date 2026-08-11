import type { Loadable } from './loadable.js';
import type { Subscribable } from './subscribable.js';

/**
 * A read answered once: the value as of now. Failure is reported by rejecting —
 * the caller asked for data, not for a state to render.
 */
export type Query<TResult> = Promise<TResult>;

/**
 * A read that keeps answering: the current state, then every later one. A new
 * subscriber gets what is known right away, which is what separates a watch
 * from a notification on an event bus.
 */
export type Watch<TValue> = Subscribable<Loadable<TValue>>;

/**
 * Detail an outcome may carry: primitives only. An entity or a DTO here would
 * be domain data smuggled out through the one type allowed to leave a command.
 */
type OutcomeDetail = Readonly<
  Record<string, string | number | boolean | undefined>
>;

/**
 * How a command went — a tag, optionally with primitive detail. It describes the
 * attempt ("wrong PIN, two tries left"), never the data the command touched:
 * that is read back through a query or a watch, from the one source of truth.
 *
 * ```ts
 * export enum PinAttempt {
 *   Verified = 'verified',
 *   Rejected = 'rejected',
 * }
 *
 * export type PinVerified = Outcome<PinAttempt.Verified>;
 * export type PinRejected = Outcome<
 *   PinAttempt.Rejected,
 *   { attemptsRemaining: number }
 * >;
 * ```
 */
export type Outcome<
  TStatus extends string,
  TDetail extends OutcomeDetail = Record<never, never>,
> = Readonly<{ status: TStatus } & TDetail>;

/** The upper bound of every outcome — what makes a return value describable. */
type AnyOutcome = Readonly<{ status: string }>;

/**
 * A write. It either happened or it did not, so by default it resolves to
 * nothing; a command with several expected outcomes resolves to one of them.
 * Domain state is not among the options — see `Outcome`.
 */
export type Command<TOutcome extends AnyOutcome | void = void> =
  Promise<TOutcome>;

/**
 * `never[]` rather than `unknown[]`: parameters are checked against the
 * constraint contravariantly, so any argument list satisfies it and the
 * constraint stays about the return type — which is what tells the three
 * kinds apart.
 */
type Methods<TReturn> = Record<string, (...args: never[]) => TReturn>;

/**
 * The three kinds of method a facade may publish. Groups are optional: a domain
 * with nothing to watch simply omits `watches`.
 */
export type FacadeSpec = Readonly<{
  queries?: Methods<Query<unknown>>;
  watches?: Methods<Watch<unknown>>;
  commands?: Methods<Command<AnyOutcome | void>>;
}>;

/** Absent groups resolve to `unknown`, which is the identity of `&`. */
type GroupOf<TSpec, TKey extends string> = TKey extends keyof TSpec
  ? NonNullable<TSpec[TKey]>
  : unknown;

/**
 * Rejects a group name that is not one of the three. Without it a misspelled or
 * invented group would satisfy the structural constraint and then be dropped
 * from the result, taking its methods with it in silence.
 */
type OnlyKnownGroups<TSpec> = Record<
  Exclude<keyof TSpec, keyof FacadeSpec>,
  never
>;

/**
 * The public surface of a domain, declared as three named groups and flattened
 * into one object type. Callers see plain methods — `facade.observeAll()` — so
 * an implementation stays an ordinary class and dependency injection is
 * unaffected; the grouping exists to make the kind of every method a decision
 * taken in the contract rather than inferred from its body.
 *
 * ```ts
 * export type BeneficiariesFacade = Facade<{
 *   queries: { findOne(id: string): Query<Beneficiary | null> };
 *   watches: { observeAll(): Watch<Beneficiary[]> };
 *   commands: { rename(id: string, name: string): Command };
 * }>;
 * ```
 *
 * Being an alias and not an interface is deliberate: there is no body to write
 * a fourth, ungrouped method into.
 */
export type Facade<TSpec extends FacadeSpec & OnlyKnownGroups<TSpec>> = GroupOf<
  TSpec,
  'queries'
> &
  GroupOf<TSpec, 'watches'> &
  GroupOf<TSpec, 'commands'>;

/** The read-only slice of a facade, for a consumer that must not write. */
export type QueriesOf<TSpec extends FacadeSpec> = GroupOf<TSpec, 'queries'> &
  GroupOf<TSpec, 'watches'>;

export type CommandsOf<TSpec extends FacadeSpec> = GroupOf<TSpec, 'commands'>;

export type WatchesOf<TSpec extends FacadeSpec> = GroupOf<TSpec, 'watches'>;
