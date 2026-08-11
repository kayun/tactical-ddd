# Architecture decisions — @tactical-ddd

Decisions that hold for **every** workspace scaffolded by `@tactical-ddd/nx`.
They explain the rules stated in the generated architecture guide (`AGENTS.md`):
the guide says what to do, these records say why, what was rejected, and how to
tell when a rule has been broken.

Each record carries two sections written for whoever is about to change code —
human or agent: **Consequences for code** (what to write) and **Signals you are
violating it** (how a violation looks in a diff).

| ID                                                            | Decision                                                                 | Read it before…                                                        |
| ------------------------------------------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------- |
| [TD-0001](./TD-0001-contracts-contain-types-only.md)          | Contracts contain types only, plus DI tokens                             | adding anything to a `contracts` library                               |
| [TD-0002](./TD-0002-facade-is-the-only-public-surface.md)     | A domain's only public surface is its facade                             | exporting something new from `core`, or consuming another domain       |
| [TD-0003](./TD-0003-cross-domain-through-contracts.md)        | Cross-domain communication goes through contracts, never via shared code | two domains needing the same data, or reaching for a `shared/*` module |
| [TD-0004](./TD-0004-inward-dependencies-inside-core.md)       | Inside `core`, dependencies point inward                                 | adding a port, an adapter, or a use case                               |
| [TD-0005](./TD-0005-shared-kernel-stays-business-agnostic.md) | The shared kernel stays business-agnostic and split in three             | putting anything in `libs/shared/*`, or configuring an adapter         |
| [TD-0006](./TD-0006-boundaries-enforced-by-tags.md)           | Boundaries are enforced at lint time, by two complementary rules         | editing `tags`, or disabling a boundary rule                           |
| [TD-0007](./TD-0007-generators-own-scaffolding.md)            | Generators own scaffolding; dev-time never leaks into run-time           | creating a library or domain, or patching a generated file             |
| [TD-0008](./TD-0008-value-and-freshness-are-one-state.md)     | Value and freshness are one state; reads split by nature                 | adding a read method to a facade, or rendering remote data             |
| [TD-0009](./TD-0009-notifications-go-to-the-bus.md)           | Notifications go to the bus, state goes to a watch                       | adding a domain event, or a second way to learn the same thing         |
| [TD-0010](./TD-0010-commands-return-no-data.md)               | Commands return no data — nothing, or how they went                      | giving a write a return type, or reading a command's result            |

## Status vocabulary

`accepted` — in force. `superseded by TD-NNNN` — kept in place, no longer
followed; the replacement states what changed. Records are never deleted or
renumbered: a decision that vanishes leaves code no one can explain.

## Scope

These records cover the **library's** design. Decisions specific to a product —
which database is the source of truth, how sessions are secured, what a sync
engine does — belong in that project's own `docs/adr/`, numbered without the `TD-`
prefix so the two sets never collide.
