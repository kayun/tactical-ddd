# <%= prefix ? prefix + '/' : '' %>shared-contracts

Global, framework-agnostic **contracts** for the whole workspace — the published
language every layer is allowed to depend on.

- **Tags:** `scope:shared`, `type:contracts`
- **May import:** nothing. This is the root of the dependency graph.
- **Contains:** type-level declarations only — no runtime logic, no framework code.

## What goes here

- Cross-cutting interfaces and their DI tokens (e.g. `HttpClient`, `Store`).
- Shared DTOs and API request/response shapes.
- Global type aliases, enums and union types reused across domains.

Anything here can be imported by `shared/*` and by every domain's `contracts`
and `core`, so keep it stable and intentionally small.

## What does NOT go here

- Implementations of these interfaces — those live in `shared/infrastructure`
  (or a domain's `core`), wired up via DI.
- Domain-specific contracts — those belong in `libs/<domain>/contracts`.
- Anything that imports another library.