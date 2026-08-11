# TD-0011 — Each domain concept maps to one kernel primitive

- **Status:** accepted
- **Date:** 2026-08-11
- **Scope:** `<domain>/core` — the `domain` and `application` layers

## Context

A domain layer written without a vocabulary drifts into one shape: interfaces of
plain fields, plus functions that operate on them. Rules then live wherever they
were first needed — a validity check in a use case, a comparison inlined in a
screen, a default filled in by a repository — and the same rule gets a second,
slightly different copy the next time someone needs it. The type system permits
all of it, so nothing objects until a bug reaches a user. A real example: a PIN's
minimum length that existed only in the UI, leaving every non-UI caller able to
create a credential the domain considered impossible.

[`@tactical-ddd/core`](https://www.npmjs.com/package/@tactical-ddd/core) ships
four primitives for this — `Entity`, `ValueObject`, `DomainError`, `UseCase` —
but their API says what each one does, not when to reach for it. Two of them
overlap in exactly the place modelling decisions are hardest: whether a concept
is defined by _who it is_ or by _what it holds_.

## Decision

Every concept in a domain is modelled as exactly one primitive, chosen by what
the concept **is**, not by what is convenient at the call site.

| Primitive       | Model a concept as this when…                                                     | Lives in      | Compared by    |
| --------------- | --------------------------------------------------------------------------------- | ------------- | -------------- |
| `Entity`        | it stays itself while its attributes change, and something must find it again     | `domain`      | identity       |
| `AggregateRoot` | it is an entity that also owns invariants across the objects inside its boundary  | `domain`      | identity       |
| `ValueObject`   | it is fully described by its attributes, and equal attributes are interchangeable | `domain`      | all attributes |
| `DomainError`   | a rule was broken and the caller must not proceed                                 | `domain`      | —              |
| `UseCase`       | it is one thing the application does, entered from outside the layer              | `application` | —              |

Four questions decide it:

1. **Does it stay itself when every field changes?** Yes → `Entity`. A PIN
   credential whose failed-attempt counter moved is still that account's
   credential.
2. **Are two instances with equal fields interchangeable?** Yes → `ValueObject`.
   Any `Pin.create('1234')` can replace any other; money, a date range, and a
   policy behave the same way.
3. **Is this "not allowed" rather than "did not work"?** → `DomainError`, thrown
   where the invariant lives: in `create`, or in the transition that would break
   it. Infrastructure failures stay ordinary errors, and an _expected_ result the
   caller branches on is an `Outcome`
   ([TD-0010](./TD-0010-commands-return-no-data.md)), not an error at all.
4. **Is it a step the outside world asks for?** → `UseCase`, one `execute`,
   orchestrating entities, value objects and ports.

Two boundaries that keep the set honest:

- **A DTO is not a value object.** A shape carried across a boundary belongs in
  `contracts` and has no behaviour ([TD-0001](./TD-0001-contracts-contain-types-only.md));
  a value object lives in `domain`, validates itself, and answers questions about
  itself. The same data may legitimately exist as both, with a mapping between.
- **Not every string needs a wrapper.** Introduce a value object when there is a
  rule to enforce, behaviour to attach, or a real risk of confusing two values of
  the same primitive type (two ids, an amount and a count). A type alias is the
  honest answer otherwise.

## Rejected alternatives

- **Anemic types plus functions** (interfaces of fields, logic in services). The
  status quo this record exists to prevent: invariants are unenforceable, because
  nothing stops constructing a value the domain considers impossible.
- **Everything is an entity.** Gives identity to concepts that have none, and
  makes equality meaningless: two amounts of `100 EUR` are the same amount, but
  as entities they would differ by id.
- **Everything is a value object.** Loses the thing repositories, sessions and
  audit trails need — a stable identity across change — and turns every state
  transition into "a different object".
- **Base classes from the ORM or framework.** Ties the domain to infrastructure
  the layer is not allowed to import ([TD-0004](./TD-0004-inward-dependencies-inside-core.md)).
- **One `Service` class per domain area** instead of use cases. No entry-point
  contract, so granularity drifts and the facade ends up delegating to methods
  whose scope nobody agreed on.
- **Exceptions for every refusal.** Turns routine branching into `try`/`catch`
  and blurs the line the `DomainError` check exists to draw.

## Consequences for code

- Entities take their identity in the constructor and expose behaviour, not
  setters: a change returns a new instance (or mutates — the base class is
  agnostic), and `equals` comes from the base rather than being hand-written.
- Value objects are immutable, are built through a static `create` that throws a
  `DomainError` on violation, and keep derived answers in getters — which stay
  out of equality because they are computed from the attributes.
- Domain errors name themselves explicitly (`super('InvalidPinError', …)`), since
  minifiers rewrite class names and `error.name` would otherwise be noise. No
  bare `throw new Error` in `domain`.
- Use cases implement `UseCase<TArgs, TResult>`, receive ports by injection, and
  compose _other use cases_ — never their own domain's facade, which is the
  outward surface only ([TD-0002](./TD-0002-facade-is-the-only-public-surface.md)).
- Repositories deal in entities and value objects; the snapshot ⇄ object mapping
  belongs to the adapter, so persistence shape never dictates domain shape.
- File names state the role: `*.entity.ts`, `*.value-object.ts`, use cases as
  `*.use-case.ts`. A reader should not have to open a file to learn which
  primitive it holds.

## Signals you are violating it

- An entity with nothing but getters and setters — the rules that belong to it
  live in a use case.
- Validation performed in a use case that a `create` could have made impossible.
- A hand-written `equals`, or two value objects compared field by field at the
  call site.
- `throw new Error` inside `domain`, or a `DomainError` thrown for an
  infrastructure failure.
- A value object with an `id`, or an entity whose identity is a field the caller
  is expected to compare.
- A class named `*Service` or `*Manager` holding several unrelated public
  methods.
- A DTO that grew methods, or a value object exported from `contracts`.

## Not yet in the kernel

The set is deliberately small and grows as the need is proven. A primitive earns
its place when it **describes the whole of what it names**, when code is written
against it — a decorator, a shared test double, generated wiring — or when it
**makes a wrong use impossible**, which is the strongest of the three: a bound
that refuses to compile teaches faster than any document. A type
that covers part of a surface is a vocabulary, not a structure, and a vocabulary
costs an import and a rename without preventing a single mistake.

Planned, and already sketched here so the gap is visible rather than filled ad
hoc:

- **Aggregate root** — now shipped as `AggregateRoot`
  ([TD-0013](./TD-0013-aggregate-is-the-unit-of-change.md)): it names the
  consistency boundary and collects the events a change produced, so there is
  both a rule it states and code written against it.
- **Domain events** — the shape is shipped (`DomainEvent`, recorded by an
  aggregate root); what is still absent is the bus that carries them, which
  stays the workspace's choice
  ([TD-0009](./TD-0009-notifications-go-to-the-bus.md)).
- **Repository** — now shipped, on the third ground above: `Repository` and
  `KeyValueStore` exist to make the wrong one refuse to compile
  ([TD-0012](./TD-0012-what-a-repository-is.md)). Domain-specific queries are
  still declared by the port, since only the domain can name them.
- **Specification** — a named, composable predicate, for when filters start being
  duplicated between a repository and a use case.

When one of these lands, this record is amended with its criteria rather than
superseded: the question it answers — which primitive fits a concept — stays the
same.

## Related

- [TD-0001](./TD-0001-contracts-contain-types-only.md) — why DTOs and value objects live in different layers
- [TD-0004](./TD-0004-inward-dependencies-inside-core.md) — where each primitive sits inside `core`
- [TD-0002](./TD-0002-facade-is-the-only-public-surface.md) — how use cases reach the outside world
- [TD-0010](./TD-0010-commands-return-no-data.md) — expected outcomes versus thrown domain errors
