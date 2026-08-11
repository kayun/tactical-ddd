# TD-0004 — Inside `core`, dependencies point inward

- **Status:** accepted
- **Date:** 2026-08-09
- **Scope:** `<domain>/core/src/lib/{domain,application,infrastructure}`

## Context

`@nx/enforce-module-boundaries` operates **between** libraries, because tags
describe projects. Inside a single library it has nothing to say — and `core` is
where that matters most: it is the one library that legitimately contains both
business rules and the adapters that serve them.

Without an internal direction, business rules acquire I/O, and the promise that
`core` is unit-testable without mounting a framework quietly stops being true.

## Decision

`core` is split into three folders with a strict direction — `domain` ←
`application` ← `infrastructure`:

- **`domain/`** — entities, value objects, domain services. Imports nothing but
  itself and types from `contracts`.
- **`application/`** — use cases, the facade implementation, and the **ports**
  (repository and gateway interfaces) those use cases need.
- **`infrastructure/`** — adapters implementing those ports.

A port is declared where it is _needed_, its adapter lives where it is
_implemented_, and the two are connected by DI at the composition root — never by
an import.

## Rejected alternatives

- **Repository implementations in `domain`.** The classic active-record shape;
  drags I/O, serialization and library types into the rules they should be
  independent of.
- **One flat folder per domain.** Nothing then distinguishes what is swappable
  from what is essential, and the DI wiring becomes guesswork.
- **Ports declared next to their adapters.** Reads naturally, but inverts
  ownership: the business layer would depend on infrastructure's idea of the
  interface, and swapping the adapter would change the port.

## Consequences for code

- No file in `domain/` or `application/` may import from `infrastructure/`, and
  nothing in `domain/` may import from `application/`. This is **enforced**, not
  merely expected: the `domain` generator writes `no-restricted-imports`
  overrides into the `core` library's own ESLint config, scoped to
  `src/lib/domain/**` and `src/lib/application/**`. When an organization prefix
  is configured, absolute patterns (`<prefix>/*/core/infrastructure/*`) close the
  loophole of reaching the same folder through a workspace alias.
- The rules match sibling-relative paths (`../infrastructure`,
  `../infrastructure/*`). An import that climbs two levels — `../../application/x`
  from a nested folder such as `domain/entities/` — is **not** matched, so a deep
  folder tree inside a layer still needs review. Treat the lint rules as a floor,
  not a ceiling.
- The domain's container module binds port tokens to adapter classes. It is the
  only file in `core` that names both sides.
- Because `application` depends on ports rather than adapters, use-case tests
  need object literals, not mocking frameworks.
- Anything platform-specific (keychain, filesystem, native modules) belongs in
  `infrastructure/` — which also means it is the part that a second platform
  replaces wholesale.

## Signals you are violating it

- `nx lint <domain>-core` reports `no-restricted-imports` with a "Clean
  Architecture violation" message.
- An import that reaches a layer by climbing two or more levels
  (`../../infrastructure/...`) — allowed by the rules, forbidden by this record.
- An entity or value object importing a client library.
- A port interface declared in the `infrastructure/` folder.
- A use-case test that has to construct a real adapter to run.

## Related

- [TD-0002](./TD-0002-facade-is-the-only-public-surface.md) — what `core` exposes
- [TD-0006](./TD-0006-boundaries-enforced-by-tags.md) — the other half of the enforcement, between libraries
