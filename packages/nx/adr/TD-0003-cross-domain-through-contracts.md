# TD-0003 — Cross-domain communication goes through contracts, never through shared code

- **Status:** accepted
- **Date:** 2026-08-09
- **Scope:** all `scope:domain` libraries; the rule the shared kernel exists to protect

## Context

Sooner or later two domains need the same data. The cheapest-looking move is to
lift the fetch, the DTO, or the whole repository into the shared kernel so that
neither domain duplicates it. That decision is what turns a shared kernel into a
hub: it starts holding endpoints and business vocabulary, every domain depends on
it, and any change to a shared DTO becomes a lockstep change across the whole
workspace.

The duplication that prompted the move is a symptom, not the problem. Two domains
fetching the same resource means the data has no owner.

## Decision

Every piece of data has exactly **one owning domain**. Other domains obtain it
through the owner's facade, injected at the composition root, or react to the
owner's **domain events**, declared in the owner's `contracts`.

If no existing domain owns the data, that is a missing bounded context: create a
new domain with the generator. It is never a reason to add a business-aware
module to `shared/*`.

## Rejected alternatives

- **A `shared/api` (or shared DTO) library.** Passes lint — the tags are valid —
  while destroying the property the tags protect. One DTO must then satisfy every
  consumer, so it grows to their union; and different contexts legitimately see
  the same entity differently.
- **Importing another domain's `core`.** Fails lint, and couples the consumer to
  an implementation that is free to change.
- **A shared cache-key module** so both domains can invalidate each other's
  entries. A dependency expressed as a string constant, invisible to the
  dependency graph — the worst of both worlds.

## Consequences for code

- Cache keys, SQL, endpoints and query construction stay **private** to the
  owning domain. A domain that must react to another's change subscribes to its
  event and invalidates its own keys.
- Reuse through the owner's facade also removes duplicate work at runtime: one
  code path means one cache key, hence one request. Two private copies of the
  same fetch means two.
- A one-directional notification is an event; a synchronous need for data is a
  facade call. If A needs B's facade _and_ B needs A's, that is a project cycle
  Nx will reject — one direction must become an event.
- Events are declared in the publisher's `contracts` as types; the bus, if any,
  is an infrastructure concern.

## Signals you are violating it

- A `shared/*` library mentions an endpoint path, a business DTO, or a domain
  term in a type name.
- The same request appears in two domains' repositories.
- Two domains reference the same cache-key string.
- `nx graph` shows a cycle between two domains.

## Related

- [TD-0002](./TD-0002-facade-is-the-only-public-surface.md) — the surface consumers use
- [TD-0005](./TD-0005-shared-kernel-stays-business-agnostic.md) — what may live in shared instead
