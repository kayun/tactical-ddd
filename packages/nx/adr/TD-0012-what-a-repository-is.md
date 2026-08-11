# TD-0012 — A repository is identity, not storage

- **Status:** accepted
- **Date:** 2026-08-12
- **Scope:** repository ports declared in `<domain>/core` and their adapters

## Context

"Repository" is the most over-applied name in a domain layer. Once one port
carries it, every later port that touches persistence gets it too — a holder of a
single in-memory value, a query for "who is signed in", a wrapper over an HTTP
client. The word then means "anything that reads or writes", which is to say it
means nothing, and the ports underneath it stop being comparable: one is
synchronous, one returns a DTO, one has no identity at all.

The cost is not aesthetic. A port named for what it is tells the next reader
which rules apply to it — whether it may be called from a use case, whether it
can be swapped for a web implementation, whether its result belongs in an
entity. A port named by habit tells them nothing.

## Decision

A **repository** is a port that owns access to data **by identity**: it finds by
id, saves whole, removes, and declares only the queries its domain asks for. It
is the illusion of an in-memory collection — the caller acts as if the objects
are simply there, and where they physically live is the adapter's business.

```ts
export interface PinCredentialRepositoryPort {
  findByAccount(sub: string): Promise<PinCredential | null>;
  save(credential: PinCredential): Promise<void>;
  remove(sub: string): Promise<void>;
}
```

Methods a repository may have:

- `findById` (however the domain words it) — the one that defines it.
- `save`, taking the object whole. Never a partial `update`: "which columns
  changed" is a storage term, not a domain one.
- `remove`.
- **Queries named in domain language**, returning one object or many —
  `findActiveByCustomer(id): Promise<Order[]>`, `findOverdue()`, `list()`. A
  repository is a collection, so returning a collection is its normal business;
  what is not allowed is `find(where)` or `findAll(filter)`, because a
  general-purpose filter turns it into a DAO and lets the storage shape leak
  into use cases.
  The line against a read model is _who asks_: a set the domain reasons about
  (every overdue invoice) belongs here, while a page of rows sorted and filtered
  for a screen belongs to a query side that returns projections — loading whole
  aggregates to render a table is both wasteful and the wrong shape.
- `nextId()`, when identity must exist before the write reaches a server —
  which offline-first work requires anyway.

Not methods of a repository: `begin`/`commit` (that is a unit of work), UI
pagination, and anything that cannot be said in the domain's own words.

The two roles are declared, so the choice is checked rather than remembered:

```ts
export interface Repository<
  TEntity extends Entity<TId>,
  TId extends EntityId = string,
>
  extends FindsById<TEntity, TId>, Saves<TEntity>, Removes<TId> {}

export interface KeyValueStore<TValue, TKey extends string = string> {
  get(key: TKey): Promise<TValue | null>;
  set(key: TKey, value: TValue): Promise<void>;
  remove(key: TKey): Promise<void>;
}
```

The bound does the teaching. A repository's object **carries its identity**, so
`save` takes one argument; a store's value does not, so the key comes alongside.
`Repository<TokenSetDto>` therefore does not compile, and the only shape that
does is the store — the distinction is enforced by the compiler instead of by
review. A port that must not offer every operation composes the parts
(`FindsById` + `Saves` for an append-only log) rather than inheriting all three.

**Not a repository:**

- a holder of one value with no identity (a session, the active account) — that
  is a state port;
- a question about the present rather than a lookup (`getCurrentIdentity()`) — a
  query port;
- a client for someone else's API — a gateway, since it owns nothing;
- a read model feeding a screen with DTOs — a query side of its own, which may
  return whatever shape the screen needs.

A repository port must also be **implementable on every target the workspace
ships to**. Two rules follow: nothing platform-specific in the signatures (no
`Buffer`, no `File`, no keychain options, no driver types), and every method
returns a `Promise` even when today's implementation is synchronous — otherwise
a web implementation over asynchronous storage cannot satisfy the contract
without changing the port and all its callers.

## Rejected alternatives

- **A monolithic `Repository<TAggregate, TId>` base interface.** Pushing all
  three operations onto every port forces `remove` on a log that must never lose
  a record. Composed parts (`FindsById`, `Saves`, `Removes`) avoid that while
  keeping the bound that matters — which is what
  [`@tactical-ddd/core`](https://www.npmjs.com/package/@tactical-ddd/core) now
  ships.
- **A generic `Store<TValue>` keyed by string.** Tried and removed in a real
  workspace: four stores differing only in their type parameter, while the thing
  that actually distinguished them — the storage policy, e.g. requiring the
  device passcode for one entry — could not be expressed through the port at all.
- **Leaving both roles undeclared, described only in prose.** The original
  decision here, on the grounds that a shared type could only ever cover the
  CRUD tail — the methods that give a repository its value are named in the
  domain's language (`findOverdue`), and no base type can describe those.
  Reversed, because the value of the base types turned out not to be reuse but
  _refusal_: with `TEntity extends Entity`, writing a repository over a DTO stops
  compiling, and the developer is left with the store as the only thing that
  builds. Prose cannot do that.
- **Renaming every non-repository port for canonical purity.** Only worth doing
  where the name actively misleads — a port with neither identity nor a
  collection. Elsewhere the rename costs call sites and buys a word.

## Consequences for code

- A new port is named for its role before it is written: repository, state port,
  query port, or gateway.
- Repository methods speak the domain's language; the key format, the table, the
  serialisation and the access policy stay inside the adapter.
- Ports are asynchronous even when the current adapter is not.
- The domain sees reconstituted objects; snapshot ⇄ object mapping is the
  adapter's private business, and the snapshot type never escapes it.
- A repository is injected into use cases, never into another domain's code —
  cross-domain access goes through the facade
  ([TD-0003](./TD-0003-cross-domain-through-contracts.md)).
- A repository that starts emitting changes returns `Subscribable<T>` of domain
  values; `Loadable` is added at the boundary, not inside the domain
  ([TD-0008](./TD-0008-value-and-freshness-are-one-state.md)).

## Signals you are violating it

- A port called `*Repository` with no id in any signature.
- `find(where)`, `query(sql)`, or a filter object crossing the port.
- A synchronous method on a port whose data could live behind async storage.
- A DTO or a persistence snapshot returned to a use case.
- Two repositories writing the same records — the aggregate boundary is drawn in
  the wrong place.
- `update`, `patch`, or a partial-save method next to `save`.
- A repository injected into a screen, a component, or another domain.

## Related

- [TD-0011](./TD-0011-one-primitive-per-concept.md) — which primitives a repository deals in
- [TD-0004](./TD-0004-inward-dependencies-inside-core.md) — why the port is declared inward and the adapter outward
- [TD-0008](./TD-0008-value-and-freshness-are-one-state.md) — where `Loadable` enters, if a repository starts streaming
