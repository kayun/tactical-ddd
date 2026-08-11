# TD-0005 — The shared kernel stays business-agnostic and split in three

- **Status:** accepted
- **Date:** 2026-08-09
- **Scope:** `libs/shared/{contracts,utils,infrastructure}`

## Context

Every workspace grows a place for "things used everywhere". Left as a single
library, it collects types next to HTTP clients next to date helpers, and then
starts learning the business. Two consequences follow: importing one pure helper
pulls in the adapters and their transitive dependencies, and the library becomes
a hub that every domain depends on — so any change to it risks the whole
workspace.

Splitting it also has to answer a subtler question: where does an adapter's
configuration live? Config is not a global type — its shape belongs to the
adapter that consumes it.

## Decision

Three libraries, each with a single responsibility and its own rule:

| Library                   | Holds                                                                | Never holds                          |
| ------------------------- | -------------------------------------------------------------------- | ------------------------------------ |
| **shared/contracts**      | global interfaces and DI tokens, shared DTOs, global type aliases    | implementations, imports of libs     |
| **shared/utils**          | pure, side-effect-free helpers                                       | I/O, framework code, business rules  |
| **shared/infrastructure** | concrete adapters for cross-cutting tech, and their **config ports** | type-only declarations, domain logic |

None of the three may contain business language.

An adapter that needs configuration declares its own **config port** next to
itself in `shared/infrastructure`, not in `shared/contracts`: the shape is the
adapter's own, and the application implements the port at the composition root
(typically one config service implementing several of them).

## Rejected alternatives

- **A single `shared` library.** Mixes pure types with I/O; every consumer of a
  type inherits the adapters.
- **No shared kernel at all.** Each domain re-implements the HTTP client, the
  storage adapter and the logger, and they drift.
- **Config types in `shared/contracts`.** Makes the platform layer describe the
  configuration of things it does not know about, and forces every config change
  through the most widely-depended-upon library.

## Consequences for code

- `shared/utils` may import `shared/contracts` and nothing else.
- `shared/infrastructure` implements interfaces from `shared/contracts`; it does
  not re-declare them.
- A config port is `XConfigPort` with `getXConfig()`, declared beside the adapter;
  the application binds it to its own config service.
- If a candidate for `shared/*` carries business vocabulary, it belongs to a
  domain instead — see [TD-0003](./TD-0003-cross-domain-through-contracts.md).

## Signals you are violating it

- A `shared/*` library imports a `scope:domain` library.
- `shared/utils` performs I/O or reads a clock.
- A business term appears in a shared type name.
- An adapter's config type sits in `shared/contracts`.

## Related

- [TD-0001](./TD-0001-contracts-contain-types-only.md) — the rule for the contracts part
- [TD-0003](./TD-0003-cross-domain-through-contracts.md) — the pressure this ADR resists
