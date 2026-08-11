# TD-0007 — Generators own scaffolding; dev-time never leaks into run-time

- **Status:** accepted
- **Date:** 2026-08-09
- **Scope:** `@tactical-ddd/nx` (dev-time) versus `@tactical-ddd/core` and framework bindings (run-time)

## Context

A library in this architecture is more than a folder: it needs tags, tsconfig
references, a boundary rule for its domain, a barrel, and — for a domain — the
facade pair in two different libraries. Created by hand, it will be missing one
of those, and the omission surfaces weeks later as an import that should have
failed lint but did not.

Separately, the tooling that creates all this must never reach application
bundles. `@nx/devkit`, TypeScript's AST APIs and Node's `fs` have no business in
a mobile or browser build.

## Decision

Structure is created by generators only:

```bash
nx g @tactical-ddd/nx:domain <name> --directory=libs/<name>
nx g @tactical-ddd/nx:shared-kernel
```

`@tactical-ddd/nx` stays a **devDependency** and is never imported by application
code. Runtime primitives (`Entity`, `ValueObject`, `UseCase`, `DomainError`) ship
separately in `@tactical-ddd/core`, with framework bindings in their own packages.

Files _inside_ generated layers are written by hand, following
[TD-0004](./TD-0004-inward-dependencies-inside-core.md).

## Rejected alternatives

- **Copy an existing library and rename.** Copies whatever was stale in the
  source, including tags that now name the wrong domain — a mistake that fails
  open, because the boundary rule then guards the wrong thing.
- **One package containing generators and runtime classes.** Convenient to
  publish, but it puts `@nx/devkit` on the runtime dependency graph.
- **Documentation describing the folder layout, no generators.** Leaves each
  developer to reproduce a dozen details by hand; see
  [TD-0006](./TD-0006-boundaries-enforced-by-tags.md) for why that fails silently.

## Consequences for code

- A wrong generated artifact is fixed **in the generator**, then re-generated —
  not patched in each project, or the projects diverge and the next generated
  library reintroduces the defect.
- Anything the generator emits for agents (architecture guide, ADR copies) must
  carry the version it came from and have a re-sync path, otherwise a bad
  instruction can never be corrected across existing projects.
- Generators use the Nx `Tree` for all file operations and call `formatFiles`
  last, so a generator run is reviewable as a single diff.

## Signals you are violating it

- Application or library code imports `@tactical-ddd/nx`.
- A library exists whose `project.json` has no tags, or whose tsconfig is not
  referenced by the workspace.
- A domain has a `core` facade implementation but no interface in its
  `contracts`, or vice versa.
- The same manual fix appears in several projects' generated files.

## Related

- [TD-0006](./TD-0006-boundaries-enforced-by-tags.md) — what the generator wires up
- [TD-0001](./TD-0001-contracts-contain-types-only.md) — the shape it scaffolds
