# TD-0001 — Contracts contain types only

- **Status:** accepted
- **Date:** 2026-08-09
- **Scope:** every `type:contracts` library — `shared/contracts` and `<domain>/contracts`

## Context

A domain's published language has to be consumable by other domains and by the
UI without dragging in the code that implements it. If a contracts library also
holds runtime code, then importing a single type pulls a module graph behind it:
the consumer inherits transitive dependencies it never asked for, bundlers can
no longer treat the library as side-effect free, and two domains that import
each other's types can form a runtime cycle out of what should have been a
compile-time-only relationship.

Dependency injection, however, needs a runtime value to key bindings by. That is
the one thing a pure type cannot provide. A closed set of published values — the
statuses a command may resolve to, the kinds a failure may have — is the other
place a consumer needs both a type to check against and a value to compare with.

Neither of these is _behaviour_. A token and an enum are inert constants: no
side effects, no transitive imports, nothing to test. The rule this layer needs
is therefore "no behaviour", not "no emitted JavaScript". Contracts libraries are
compiled by `tsc` like every other library in the workspace, and are almost never
published on their own, so whether a construct survives type-stripping is not a
constraint here.

## Decision

A `type:contracts` library exports **types and interfaces**, plus two kinds of
**inert constants**: **DI tokens** and **string `enum`s**. Nothing else has a
runtime shape.

Tokens use declaration merging so that one name serves as both the type and the
token:

```ts
export interface HttpClientPort {
  get<T>(url: string): Promise<T>;
}

export const HttpClientPort = {
  $: Symbol.for('HttpClientPort'),
};
```

Enums name a closed set of values that crosses the boundary, so that a consumer
can `switch` exhaustively and a typo is a compile error:

```ts
export enum VerifyStatus {
  Verified = 'verified',
  Rejected = 'rejected',
}
```

## Rejected alternatives

- **Abstract classes as contracts.** Forces inheritance on implementers, emits
  runtime code, and makes test doubles heavier than an object literal.
- **No contracts layer; depend on interfaces declared in `core`.** Importing a
  type would drag the implementation library into the consumer's graph — the
  exact coupling this layer exists to prevent.
- **`.d.ts`-only libraries.** Truly zero runtime, but leaves nowhere to declare
  DI tokens, pushing them into `core` where consumers cannot reach them.
- **`as const` objects instead of `enum`.** Erasable, and structurally typed, so
  a raw `'verified'` from a JSON payload is accepted without a cast. But it
  costs two declarations per set and `typeof X.Member` in every generic
  position, for a guarantee — running unbuilt under a type-stripping runtime —
  that a compiled, unpublished library never needs. Revisit if TypeScript
  itself stops emitting enums (`erasableSyntaxOnly` becoming the default); the
  migration is mechanical.

## Consequences for code

- No `class`, no `function`, no `namespace` with a body in contracts. The only
  values are DI tokens and enums.
- Enums are **string enums**: every member has an explicit string initializer.
  A numeric enum accepts any `number`, emits a reverse mapping, and renumbers
  itself when a member is inserted — none of which a published value set can
  afford. `const enum` is not used: it is incompatible with `isolatedModules`.
- A port and its token live in the same file, under the same name.
- Contracts libraries have no `*.spec.ts`: there is no behaviour to test. Type
  expectations, if needed, are asserted with `@ts-expect-error`.
- Errors thrown across a boundary are declared as types here, but the classes
  that construct them live in `core` (domain errors) or `infrastructure`
  (transport errors).

## Signals you are violating it

- A contracts library imports anything other than `shared/contracts`.
- The `class` or `function` keyword appears in one.
- An enum with a numeric member, or an enum used as a namespace for helpers.
- A DI token is declared in `core` next to its implementation.
- A contracts library grows a spec file that asserts behaviour rather than types.

## Related

- [TD-0002](./TD-0002-facade-is-the-only-public-surface.md) — what contracts publish
- [TD-0003](./TD-0003-cross-domain-through-contracts.md) — why other domains only see this layer
- [TD-0010](./TD-0010-commands-return-no-data.md) — the status enums that outcomes are built from
