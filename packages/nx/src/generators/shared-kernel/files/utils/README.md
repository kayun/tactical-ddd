# <%= prefix ? prefix + '/' : '' %>shared-utils

Global, framework-agnostic **utilities** — pure helper functions reused across
the whole workspace.

- **Tags:** `scope:shared`, `type:utils`
- **May import:** `shared-contracts` only.
- **Contains:** small, side-effect-free functions with no framework or I/O
  dependencies.

## What goes here

- Date/time formatters and parsers.
- String, number and math helpers.
- Array/object transformation utilities, type guards and predicates.

Functions here should be deterministic and dependency-light, so they are safe to
import from anywhere (`shared/*` and every domain's `contracts`/`core`).

## What does NOT go here

- Interfaces/types — those belong in `shared-contracts`.
- Anything doing I/O, network or storage — that belongs in
  `shared-infrastructure`.
- Domain or business logic — that belongs in `libs/<domain>/core`.
- Imports from any domain library or `shared-infrastructure`.