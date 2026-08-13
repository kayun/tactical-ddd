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

**Which layer implements a port is decided by the port's direction, not by the
fact that it is a port.** The two directions look alike in a type and belong in
different folders:

| Direction             | Who calls whom   | Implemented in   | Examples                                                    |
| --------------------- | ---------------- | ---------------- | ----------------------------------------------------------- |
| **driven** (outbound) | domain → outside | `infrastructure` | repository, OIDC client, live query, keychain, HTTP gateway |
| **driving** (inbound) | outside → domain | `application`    | the facade; a narrow entry handed to a transport            |

A driven port exists because the domain needs something done to the world, and
its implementation is where the platform lives. A driving port is the opposite:
somebody outside wants the domain to act, so its implementation is a way _in_ —
which is why the facade sits in `application`, and why anything else shaped like
the facade sits there too.

The practical test is the class itself: **if it holds no platform detail, it is
not an adapter.** A class that only translates one call into a use case is an
entry point wearing an adapter's name, and putting it in `infrastructure/` makes
that folder lie about what it contains. Note that a driving port is often
declared elsewhere entirely — in `shared/contracts`, by the transport that wants
to call in — and its implementation still belongs to the domain's `application`.

## Rejected alternatives

- **Repository implementations in `domain`.** The classic active-record shape;
  drags I/O, serialization and library types into the rules they should be
  independent of.
- **One flat folder per domain.** Nothing then distinguishes what is swappable
  from what is essential, and the DI wiring becomes guesswork.
- **Ports declared next to their adapters.** Reads naturally, but inverts
  ownership: the business layer would depend on infrastructure's idea of the
  interface, and swapping the adapter would change the port.
- **"Every implementation of a port goes in `infrastructure`."** The rule as it
  reads at first glance, and wrong for inbound ports: a class that implements
  `AccessTokenProviderPort` by delegating to a use case has no platform in it, so
  `infrastructure/` gains a file that no second platform would ever replace —
  while `application/`, which owns every other way into the domain, is missing
  one. Direction decides, not the word "port".

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
  replaces wholesale. The converse is the check to run before creating a file
  there: if nothing in it would change on another platform, it does not belong.
- Ways _into_ the domain live in `application/` next to the facade, even when the
  port they satisfy is declared in another library. Their bodies delegate to use
  cases, which is exactly what the facade does.

## Signals you are violating it

- `nx lint <domain>-core` reports `no-restricted-imports` with a "Clean
  Architecture violation" message.
- An import that reaches a layer by climbing two or more levels
  (`../../infrastructure/...`) — allowed by the rules, forbidden by this record.
- An entity or value object importing a client library.
- A port interface declared in the `infrastructure/` folder.
- A class in `infrastructure/` with no platform dependency — no client, no native
  module, no file system — whose every method forwards to a use case.
- A file in `infrastructure/` that a port to a second platform would keep
  unchanged.
- A use-case test that has to construct a real adapter to run.

## Related

- [TD-0002](./TD-0002-facade-is-the-only-public-surface.md) — what `core` exposes
- [TD-0006](./TD-0006-boundaries-enforced-by-tags.md) — the other half of the enforcement, between libraries
