# <%= prefix ? prefix + '/' : '' %>shared-infrastructure

Global, workspace-wide **infrastructure** — the concrete adapters that implement
the abstractions declared in `shared-contracts`.

- **Tags:** `scope:shared`, `type:infrastructure`
- **May import:** `shared-contracts` only.
- **Contains:** runtime implementations of cross-cutting technical concerns.

## What goes here

- HTTP/WS clients and `fetch`/`axios` wrappers implementing `HttpClient`.
- Storage adapters implementing `Store` (localStorage, cookies, in-memory…).
- Core data-layer setup shared across domains (e.g. `@tanstack/query-core`
  query client configuration).

These implementations are wired into consumers via DI tokens from
`shared-contracts`, so application and domain code depends on the interface,
never on this library directly.

## What does NOT go here

- Type/interface declarations — those belong in `shared-contracts`.
- Pure, dependency-free helpers — those belong in `shared-utils`.
- Domain or business logic — that belongs in `libs/<domain>/core`.
- Imports from any domain library or `shared-utils`.