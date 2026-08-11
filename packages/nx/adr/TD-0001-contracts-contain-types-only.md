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
the one thing a pure type cannot provide.

## Decision

A `type:contracts` library exports **types and interfaces**, plus **DI token
constants** as the single deliberate exception.

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

## Rejected alternatives

- **Abstract classes as contracts.** Forces inheritance on implementers, emits
  runtime code, and makes test doubles heavier than an object literal.
- **No contracts layer; depend on interfaces declared in `core`.** Importing a
  type would drag the implementation library into the consumer's graph — the
  exact coupling this layer exists to prevent.
- **`.d.ts`-only libraries.** Truly zero runtime, but leaves nowhere to declare
  DI tokens, pushing them into `core` where consumers cannot reach them.

## Consequences for code

- No `class`, no `function`, no `enum` in contracts. Use union types or
  `as const` objects instead of `enum` — `enum` emits runtime code.
- A port and its token live in the same file, under the same name.
- Contracts libraries have no `*.spec.ts`: there is no behaviour to test. Type
  expectations, if needed, are asserted with `@ts-expect-error`.
- Errors thrown across a boundary are declared as types here, but the classes
  that construct them live in `core` (domain errors) or `infrastructure`
  (transport errors).

## Signals you are violating it

- A contracts library imports anything other than `shared/contracts`.
- The `class`, `function`, or `enum` keyword appears in one.
- A DI token is declared in `core` next to its implementation.
- A contracts library grows a spec file that asserts behaviour rather than types.

## Related

- [TD-0002](./TD-0002-facade-is-the-only-public-surface.md) — what contracts publish
- [TD-0003](./TD-0003-cross-domain-through-contracts.md) — why other domains only see this layer
