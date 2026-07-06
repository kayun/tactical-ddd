# Architecture Guide for AI Agents

This workspace was scaffolded by **@tactical-ddd/nx** and follows a strict
Domain-Driven Design + Clean Architecture layout. The boundaries below are **not
conventions — they are enforced at lint time** by `@nx/enforce-module-boundaries`
(via project `tags`). Code that crosses a boundary fails `nx lint`.

Read this before adding or moving any file.

> Package names follow `<%= prefix ? prefix + '/' : '' %><domain>-<layer>`
> (e.g. `<%= prefix ? prefix + '/' : '' %>auth-core`). Examples below use that form.

---

## TL;DR — the rules that matter

1. **Never hand-roll a library or domain.** Use the generators (see [§8](#8-adding-things-use-the-generators)). They create the right folders, `tags`, tsconfig, and boundary rules.
2. **The dependency rule points inward and never sideways.** A domain may depend on the shared kernel and on *other domains' contracts only* — never on another domain's implementation.
3. **`contracts` = types only.** No runtime code, no imports of implementations.
4. **`core` = framework-agnostic business logic.** No React, no DOM, no HTTP client instances — those are injected.
5. **A domain's only public surface is its facade** (declared in `contracts`, implemented in `core`). Consumers depend on the interface, never reach inside.
6. **When unsure where something goes, consult [§7](#7-where-do-i-put-) before writing it.**

### Allowed-dependency matrix

| From ↓ \ May import → | shared/contracts | shared/utils | shared/infra | own contracts | own core | another domain's **contracts** | another domain's core/ui/features |
| --------------------- | :--------------: | :----------: | :----------: | :-----------: | :------: | :----------------------------: | :-------------------------------: |
| **shared/contracts**  |        —         |      ❌      |      ❌      |       —       |    —     |               —                |                 —                 |
| **shared/utils**      |        ✅        |      —       |      ❌      |       —       |    —     |               —                |                 —                 |
| **shared/infrastructure** |    ✅        |      ❌      |      —       |       —       |    —     |               —                |                 —                 |
| **<domain>/contracts**|        ✅        |      ❌      |      ❌      |       —       |    ❌    |               ❌               |                 ❌                |
| **<domain>/core**     |        ✅        |      ✅      |      ✅      |      ✅       |    —     |               ✅               |                 ❌                |
| **<domain>/ui, /features** |   ✅        |      ✅      |      ✅      |      ✅       |    ✅    |               ✅               |                 ❌                |

❌ = will fail `nx lint`. The shared kernel must stay business-agnostic; domains stay isolated from each other except through published contracts.

---

## 1. Philosophy

- **Bounded domains.** Each business domain (`auth`, `payments`, …) is a self-contained slice under `libs/<domain>/`. Domains don't know about each other's internals.
- **The Dependency Rule.** Dependencies point *inward*: UI → core → contracts. Inner layers never import outer ones; the framework lives at the edges.
- **Framework-agnostic core.** Business rules don't import React, the DOM, or concrete I/O. Anything external is an interface (a *port*) that gets an implementation injected via DI at the composition root.
- **Published language.** Domains talk to each other only through each other's `contracts` (interfaces, events, DTOs) — never by importing implementations.
- **Dev-time vs run-time.** Generators (`@tactical-ddd/nx`) scaffold and enforce; they are never imported by application code.

---

## 2. Workspace layout

```
libs/
  shared/                  # the Shared Kernel — global, business-agnostic
    contracts/             # scope:shared  type:contracts
    utils/                 # scope:shared  type:utils
    infrastructure/        # scope:shared  type:infrastructure
  <domain>/                # one bounded domain per business capability
    contracts/             # scope:domain  domain:<name>  type:contracts
    core/                  # scope:domain  domain:<name>  type:core
    ui/                    # scope:domain  domain:<name>  type:ui         (preset only)
    features/              # scope:domain  domain:<name>  type:features   (preset only)
```

---

## 3. Tags & boundaries (the law)

Every library carries `tags` in its project manifest; the root ESLint config maps
them to import rules. The tag vocabulary:

- **Scope** — `scope:shared` (global infra) vs `scope:domain` (business logic).
- **Domain** — `domain:<name>` (e.g. `domain:auth`). A per-domain rule confines a
  domain to itself, the shared kernel, and other domains' `type:contracts`. This is
  what actually prevents `domain:auth` from importing `domain:payments` internals.
- **Type** — the layer: `type:contracts`, `type:core`, `type:utils`,
  `type:infrastructure`, `type:ui`, `type:features`.

**Do not edit tags by hand to "make a dependency work."** If you need a dependency
the rules forbid, the design is wrong — re-read [§6](#6-cross-domain-communication) and [§7](#7-where-do-i-put-).

---

## 4. The Shared Kernel (`libs/shared/*`)

Global building blocks reused everywhere. **No business logic.**

| Library | Put here | Never put here | May import |
| ------- | -------- | -------------- | ---------- |
| **shared/contracts** | Global interfaces & DI tokens (`HttpClient`, `Store`), shared DTOs, API request/response shapes, global type aliases/enums. | Implementations, anything that imports another lib. | nothing |
| **shared/utils** | Pure, side-effect-free helpers: date/string/number/math, array/object transforms, type guards. | I/O, framework code, business rules. | shared/contracts |
| **shared/infrastructure** | Concrete adapters for cross-cutting tech: HTTP/WS clients implementing `HttpClient`, storage adapters implementing `Store`, query-client setup. | Types-only declarations, business/domain logic. | shared/contracts |

---

## 5. Domain layers (`libs/<domain>/*`)

### `<domain>/contracts` — the domain's public boundary
- The domain's **facade interface** (`<Name>Facade`) and its DI token.
- Domain events, DTOs, and the public types other domains are allowed to consume.
- **Types only.** May import `shared/contracts`. Nothing may reach past this into `core`.

### `<domain>/core` — the business logic (framework-agnostic)
Pure domain logic + the facade implementation. Internally split into Clean
Architecture layers under `src/lib/`:

```
core/src/lib/
  domain/          # Entities, Value Objects, domain services — pure, no outward imports
  application/     # Use cases + the facade implementation (Core<Name>Facade)
  infrastructure/  # Adapters implementing ports declared by domain/application
```

- **Inward only:** `domain` must not import `application` or `infrastructure`;
  `application` must not import `infrastructure`. Implementations are wired via DI
  at the composition root, not imported across layers. (Enforced by lint.)
- Define **ports** (repository/gateway interfaces) in `domain`/`application`; put
  their concrete adapters in `infrastructure`.
- `core` may import `shared/*`, its own `contracts`, and other domains' `contracts`.

### `<domain>/ui` & `<domain>/features` *(generated only with `--preset`)*
- **ui**: presentational components/hooks — no business logic, no direct I/O.
- **features**: state management, DI containers/composition root, framework bindings,
  wiring the facade to the UI.
- May import `shared/*`, own `contracts`, own `core`, and other domains' `contracts`.

---

## 6. Cross-domain communication

A domain may depend on another domain's **`contracts` only** (the published
language). Never import another domain's `core`/`ui`/`features`/`infrastructure`.

To use another domain:
1. Import its facade interface + token from `<%= prefix ? prefix + '/' : '' %><other>-contracts`.
2. Receive the implementation via **DI** at the composition root — do not `new` it
   or import its `core`.

```ts
// ✅ allowed — depend on the abstraction
import { PaymentsFacade } from '<%= prefix ? prefix + '/' : '' %>payments-contracts';

// ❌ forbidden — importing another domain's implementation (fails nx lint)
import { CorePaymentsFacade } from '<%= prefix ? prefix + '/' : '' %>payments-core';
```

For decoupled notifications, prefer **domain events** declared in `contracts` over
direct calls.

---

## 7. "Where do I put …?"

| You're adding… | Put it in | Notes |
| -------------- | --------- | ----- |
| An Entity / Value Object / domain service | `<domain>/core` → `src/lib/domain` | Pure; no framework/I/O. |
| A Use Case / application service | `<domain>/core` → `src/lib/application` | Orchestrates domain + ports. |
| The domain's public API (facade) **interface** | `<domain>/contracts` | `<Name>Facade` + DI token. |
| The facade **implementation** | `<domain>/core` → `src/lib/application` | `Core<Name>Facade implements <Name>Facade`. |
| A repository/gateway **port** (interface) | `<domain>/core` (`domain`/`application`) | Implementation goes to `infrastructure`. |
| A repository/HTTP **adapter** (implementation) | `<domain>/core` → `src/lib/infrastructure` | Wired via DI. |
| A domain-specific DTO / event / type | `<domain>/contracts` | If other domains consume it, it *must* live here. |
| A global DTO / API shape / interface | `shared/contracts` | Reused across domains. |
| A pure helper (format/parse/transform) | `shared/utils` | Or a domain-local helper inside `core` if domain-specific. |
| A global HTTP/WS/storage client | `shared/infrastructure` | Implements a `shared/contracts` interface. |
| A presentational component / hook | `<domain>/ui` | No business logic. |
| State, DI container, framework binding | `<domain>/features` | The composition root lives here. |
| Something used by two domains | `shared/*` **or** each domain's `contracts` | If it's business language, prefer contracts + events; if it's generic infra, shared. |

If a piece doesn't fit any cell, the modeling is off — reconsider the boundary
rather than weakening a tag.

---

## 8. Adding things — use the generators

Do **not** create libraries by hand. The generators set up folders, tags,
tsconfig, boundary rules, and the facade scaffolding.

```bash
# A new bounded domain (libs/<name>/{contracts,core,...})
nx g @tactical-ddd/nx:domain <name> --directory=libs/<name>

# (Re)scaffold the Shared Kernel
nx g @tactical-ddd/nx:shared-kernel
```

Add files *within* the generated layers by hand, following [§7](#7-where-do-i-put-).

---

## 9. Conventions

- **Barrels.** Each library's public surface is its `src/index.ts`. Export only
  what is meant to be public; consumers import from the package entry, never deep
  paths into another library.
- **Facade naming.** Interface `<Name>Facade` in `contracts`; implementation
  `Core<Name>Facade` in `core/src/lib/application`.
- **Module format.** Match the workspace's module system in barrel re-exports
  (ESM workspaces use explicit `.js` import extensions; the generators already do
  this — keep it consistent).
- **Bundler/strict.** Libraries build with `tsc` and `strict: true`. Keep types
  honest; don't loosen `tsconfig` to dodge errors.
- **Tests.** Co-locate `*.spec.ts` with the code; `core` is framework-agnostic and
  unit-testable without mounting a UI.

---

## 10. Do / Don't

**Do**
- Run `nx lint <project>` after changes — it is the source of truth for boundaries.
- Depend on interfaces (`contracts`); inject implementations via DI.
- Keep `core` free of framework and I/O specifics.
- Add new domains/libs through the generators.

**Don't**
- Import another domain's `core`/`ui`/`features` (use its `contracts`).
- Put business logic in `shared/*` or runtime code in any `contracts`.
- Import outer layers from inner ones inside `core`.
- Edit `tags` or relax ESLint boundaries to force a forbidden import.
