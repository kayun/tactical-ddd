# TD-0002 — A domain's only public surface is its facade

- **Status:** accepted
- **Date:** 2026-08-09
- **Scope:** `<domain>/contracts` (interface), `<domain>/core` (implementation and barrel)

## Context

A bounded domain accumulates dozens of use cases, entities, ports and adapters.
If consumers may reach any of them, three things follow: every internal rename
becomes a breaking change for other teams; the domain loses the ability to
change the granularity of its operations (splitting one use case into two breaks
callers); and invariants that span several operations have nowhere to live,
because callers assemble the sequence themselves.

TypeScript cannot hide exported symbols across libraries. The boundary therefore
has to be drawn by what the barrel exports, and that choice has to be explicit.

## Decision

Each domain declares `<Name>Facade` in its `contracts` and implements it as
`Core<Name>Facade` in `core/src/lib/application`. The `core` barrel exports the
facade implementation and the domain's DI container module — nothing else.

Use cases, entities, value objects, ports and adapters are internal, regardless
of the fact that a determined consumer could deep-import them.

## Rejected alternatives

- **Export use cases directly.** Their number and shape are implementation
  detail; consumers would depend on the domain's internal decomposition.
- **Several public interfaces per domain (one per feature).** Consumers then
  need to know which one holds what, and the domain has no single place to state
  its full capability. Splitting queries from commands is a refinement _inside_
  the facade, not a second entry point.
- **Expose the container and let consumers resolve what they like.** Turns the DI
  container into the public API and makes every internal binding a contract.

## Consequences for code

- `<domain>/core/src/index.ts` exports `Core<Name>Facade` and
  `<name>ContainerModule`. Adding a per-use-case export to it is a design change,
  not a convenience.
- Inside the domain, use cases compose other **use cases and ports** — never the
  facade. Calling the facade from within would invert the direction of the
  boundary and invite re-entrancy.
- Cross-cutting behaviour that must apply to every operation (logging,
  permission checks) belongs in the facade implementation, because it is the only
  place all operations pass through.
- The facade is an interface first: consumers depend on the type from
  `contracts`, and receive the implementation via DI at the composition root.

## Signals you are violating it

- A consumer imports a symbol whose file name ends in `.use-case`, `.entity`,
  `.repository` or `.port`.
- The `core` barrel lists more than the facade and the container module.
- A use case injects `<Name>Facade`.
- Two domains' facades depend on each other, forming a cycle — see
  [TD-0003](./TD-0003-cross-domain-through-contracts.md).

## Related

- [TD-0001](./TD-0001-contracts-contain-types-only.md) — where the interface lives
- [TD-0004](./TD-0004-inward-dependencies-inside-core.md) — how `core` is arranged behind it
