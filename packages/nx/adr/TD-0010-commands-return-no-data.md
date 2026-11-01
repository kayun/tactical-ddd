# TD-0010 — Commands return no data

- **Status:** accepted; amended 2026-11-01 (a long-running command is cancelled by a separate command and rejects)
- **Date:** 2026-08-11
- **Scope:** command methods on facades declared in `<domain>/contracts`

## Context

A write that answers with what it wrote is convenient at the call site and
costly everywhere else.

The consumer now has two ways to learn the same thing: the command's return value
and the query or watch over the same data. The two diverge — the returned copy is
a snapshot from before the next change, and a screen that renders it stops
tracking everything else that writes to the same records. This is the
"same data reachable two ways" failure that
[TD-0009](./TD-0009-notifications-go-to-the-bus.md) rejects for events, arriving
through a different door.

The return value also assumes the write already happened. That assumption breaks
the moment a command is queued: an offline-first workspace accepts writes with no
network, hands them to a sync engine, and settles them later. A command typed to
resolve with data cannot be queued without changing its signature and every
caller — so the type would be wrong exactly when the architecture needs it most.

And yet some commands genuinely have something to say. "Wrong PIN, two attempts
left" is not data the domain holds; it is how this attempt went. No query can
answer it, because it is about the call, not about the state. Forcing it into an
exception would make control flow out of an expected result.

## Decision

A command resolves to **nothing by default**, and otherwise to an **`Outcome`** —
never to domain data:

```ts
export type Outcome<
  TStatus extends string,
  TDetail extends OutcomeDetail = Record<never, never>,
> = Readonly<{ status: TStatus } & TDetail>;

export type Command<TOutcome extends AnyOutcome | void = void> =
  Promise<TOutcome>;
```

`OutcomeDetail` admits primitives only, so the rule is enforced by the compiler
rather than by review:

```ts
enum VerifyStatus {
  Verified = 'verified',
  Rejected = 'rejected',
}

type Verified = Outcome<VerifyStatus.Verified>;
type Rejected = Outcome<VerifyStatus.Rejected, { attemptsRemaining: number }>;

export type PinFacade = Facade<{
  commands: {
    setupPin(pin: string): Command; // resolves to nothing
    verifyPin(sub: string, pin: string): Command<Verified | Rejected>;
  };
}>;
```

```ts
// @ts-expect-error — a command may not resolve to an entity
type Bad = Command<Beneficiary>;

// @ts-expect-error — nor to a bare value: a token, an id
type AlsoBad = Command<string>;

// @ts-expect-error — nor to data wrapped in an outcome
type StillBad = Outcome<VerifyStatus.Verified, { created: Beneficiary }>;
```

What the command changed is read back through a query or a watch, from the one
source of truth.

A command that waits on someone else — a device, a remote party, a user on
another screen — is **cancelled by another command**, never by a parameter of its
own. The cancel names the same thing the long command works on, and the long
command, once cancelled, **rejects**:

```ts
export type DevicesFacade = Facade<{
  commands: {
    setupDevice(params: SetupParams): Command<SetupOutcome>; // rejects when cancelled
    cancelDeviceOperation(deviceId: string): Command; // resolves to nothing
  };
}>;
```

Cancelling is a write like any other: it can be issued by a caller that did not
start the work, it fits a queue, and it leaves no cancellation token in the
contract. The long command's promise rejects because nobody is waiting for its
outcome any more — the caller that cancelled has moved on — and an `Outcome`
member for it would make every caller branch on a result only the canceller
asked for.

## Rejected alternatives

- **`Promise<void>` with no exceptions at all**, modelling every expected result
  as a thrown error (`WrongPinError`, `LockedOutError`). Purest CQS, but it turns
  a routine branch into `try`/`catch` and mixes invariant violations with normal
  outcomes. `DomainError` should mean "this is not allowed", not "the code was
  wrong".
- **Returning the written entity** (`create(dto): Promise<Beneficiary>`). The
  convenient case, and the one that creates the second read path. It also cannot
  survive queueing.
- **Returning the new id** (`create(dto): Promise<Id>`). Fixed by having the
  caller generate the id and pass it in — which an offline-first workspace needs
  anyway, since ids must exist before the write reaches a server.
- **A free-form result type per command.** Without a shape, "outcome" drifts back
  into "whatever the use case had handy", and the compiler cannot tell the two
  apart.
- **An `AbortSignal` (or any token) as the command's last parameter.** It works
  for the caller that started the command and for no one else, it cannot cross a
  queue or a process boundary, and it puts a runtime object into a contract that
  is otherwise types and primitives.
- **A `Cancelled` member in the command's outcome.** Every caller would have to
  branch on a result that only the canceller asked for, and the canceller is the
  one party that no longer waits for it.
- **A timeout parameter.** How long to wait is the implementation's decision;
  a caller that stops waiting earlier cancels.
- **Turning the operation into a watch the caller unsubscribes from.** A watch
  reads state; the operation is a write, and an unsubscribe is not a write that
  another caller can issue.
- **A fourth facade group for commands that answer** (`attempts`). Honest, but
  outcomes are a handful per domain, and both groups would still be promises —
  the extra group buys naming, not checking.

## Consequences for code

- A command that only changes state is `Command` — `Promise<void>`. This is the
  default and should stay the common case.
- An outcome is a tag plus primitive detail, declared in `contracts` next to the
  facade. Statuses are members of a string enum, so the caller can `switch`
  exhaustively and a typo is a compile error rather than a branch that never
  runs.
- A refusal that breaks an invariant is still thrown, as a `DomainError`.
  `Outcome` is for results the caller is expected to branch on.
- **Every command's effect needs a read that shows it.** If a screen must react
  to a write, the write's data belongs in a source of truth the domain watches —
  a local database, a cache that gets invalidated. A command whose effect exists
  only on a server, with nothing observing it, will leave the UI stale; that is a
  missing watch, not a reason to return data.
- Ids are generated by the caller and passed into the command.
- Optimistic UI is a local write plus a watch, not a rendered command result.
- **A long-running command is cancelled by a separate command** keyed by what
  the operation works on (`cancelDeviceOperation(deviceId)`), not by an argument
  of the long command. The cancel resolves to nothing; it affects only the
  operations in flight when it is called, so a command started right after it
  runs normally. The cancelled command **rejects** and releases what it holds;
  its documentation says what it does not undo.
- Inside the domain the implementation may use whatever cancellation it likes —
  an `AbortController`, a subject — as long as none of it reaches `contracts`.

## Signals you are violating it

- A command signature mentioning a DTO, an entity, or a collection.
- A screen or use case rendering, storing, or asserting on what a command
  resolved to, rather than re-reading it.
- An `Outcome` whose detail holds an object — data laundered through a status.
- `login(): Promise<TokenSetDto>`, or any command handing back state that another
  method already reads.
- A status enum that grew a member meaning "here is the data".
- A command that cannot be moved behind a queue without changing its callers.
- `AbortSignal`, a cancellation token or a timeout in a command's parameters.
- A `Cancelled`/`Aborted` member in a command's outcome.
- A long-running command with no command that cancels it, or a cancel that also
  stops an operation started after it was called.

## Related

- [TD-0008](./TD-0008-value-and-freshness-are-one-state.md) — how the effect is read back
- [TD-0009](./TD-0009-notifications-go-to-the-bus.md) — the same "two ways to learn one thing" failure, on the event side
- [TD-0002](./TD-0002-facade-is-the-only-public-surface.md) — the surface these commands live on
