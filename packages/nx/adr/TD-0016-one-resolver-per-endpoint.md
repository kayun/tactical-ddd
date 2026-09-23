# TD-0016 — One resolver per endpoint, and no cache inside it

- **Status:** accepted
- **Date:** 2026-09-23
- **Scope:** remote calls made from `<domain>/core` — their ports in `application`, their adapters in `infrastructure`

## Context

Every client talks to a server, and the code that does it drifts towards one
class per domain: `AuthApi`, `AccountsApi`, a method per endpoint, an HTTP
client in the constructor. The class is a gateway nobody declared. A use case
that needs one call depends on all of them; a test that exercises one method
stubs seven; and because the class is the only thing named, it is the class that
gets injected into a screen when a deadline is near.

The same class is also where caching first appears — a `Map` keyed by url, a
TTL, a "don't refetch for five seconds" flag — because it is the one place that
sees every request. The freshness of a value then lives next to the transport
that fetched it, far from the watch that renders it, and `Loadable.stale`
([TD-0008](./TD-0008-value-and-freshness-are-one-state.md)) has nothing to
report: the watch does not know the class is serving it yesterday's answer.

## Decision

A remote call is made through a **resolver**: one implementation is one
endpoint, and `resolve` is its only public method.

```ts
export interface Resolver<TInput, TOutput> {
  resolve(input: TInput): Promise<TOutput>;
}
```

The port is declared in `application`, named for the call and typed as a
resolver; the adapter lives in `infrastructure` and declares only what makes its
endpoint different — the verb, the url, the body, the mapping from wire shape to
domain shape. `@tactical-ddd/core` ships `HttpResolver` for exactly that:

```ts
// application
export type SignInPort = Resolver<Credentials, TokenSet>;
export const SignInPort = { $: Symbol.for('auth/SignInPort') };

// infrastructure
export class SignInResolver extends HttpResolver<Credentials, TokenSet> {
  protected readonly method = HttpMethod.Post;
  protected url(): string {
    return '/auth/signin';
  }
  protected override body(credentials: Credentials): unknown {
    return credentials;
  }
}
```

A resolver holds no state and keeps no cache. It returns what the server said,
every time, and lets a transport failure through untouched. Three things follow:

- **Freshness lives in the port that reads.** A value that is rendered or
  reacted to is owned by a state port or a query port, which is the source of
  truth for its watch and the one place that builds `Loadable` from it. That
  port may call a resolver to fill itself; the resolver does not know it is
  being cached.
- **A cache, when needed, is a decorator.** `CachedResolver<TInput, TOutput>`
  implements the same `resolve` over another resolver, and is bound in the
  composition root. Callers never learn the difference, and the endpoint class
  stays one thing.
- **Cross-cutting concerns live in the transport.** Credentials, retries,
  refresh-on-401 apply to every request the same way, so they are an
  interceptor on the `HttpTransport` adapter. An endpoint never mentions a
  header.

The use case that called `resolve` is the one that reads the failure. Which
status means "wrong password" and which means "try later" is a domain decision,
and it is made once, in `application`, where it becomes an outcome
([TD-0010](./TD-0010-commands-return-no-data.md)).

## Rejected alternatives

- **One `*Api` class per domain.** Familiar, and the shape most HTTP clients
  suggest. Rejected because it is a gateway to everything at once: a use case
  cannot declare which call it needs, a test cannot stub one call, and the
  class is what ends up injected into a component. A resolver per call makes
  the dependency exact.
- **Caching inside the resolver.** The obvious place, since it sees every
  request. Rejected because freshness is then invisible to the watch that
  renders the value, invalidation by domain event
  ([TD-0003](./TD-0003-cross-domain-through-contracts.md)) has to reach into a
  transport class, and every endpoint carries policy it does not need. A
  decorator gives the same effect to the one endpoint that wants it.
- **A cache library's client as the contract.** `queryClient.fetchQuery`,
  `useQuery`, a key factory in `shared/*`. Rejected for the reason TD-0008
  gives: the library's result type becomes the domain's de facto API, and its
  keys become a shared module two domains edit.
- **A generic `Resolver` with a `key()` method for caching.** Tried as a
  compromise. Rejected because the endpoint then declares a cache key it never
  uses itself, and every subclass pays for the one that does.

## Consequences for code

- A remote call gets a port in `application`: `type XPort = Resolver<In, Out>`
  with a DI token. The adapter extends `HttpResolver` in `infrastructure`.
- A use case depends on the resolvers it calls, by port. Nothing outside
  `infrastructure` names an HTTP client, a url, or a status code.
- The use case turns a rejection into an outcome; the resolver does not
  classify failures.
- A value that must stay fresh is owned by a state or query port that fills
  itself from a resolver and publishes a watch. `Loadable` is built there, in
  one function ([TD-0008](./TD-0008-value-and-freshness-are-one-state.md)).
- An adapter that must be cached is a decorator over a resolver, bound at the
  composition root next to the one it wraps.
- `HttpTransport` is implemented once per workspace, in `shared/infrastructure`,
  over the client the workspace already has; interceptors go there.

## Signals you are violating it

- A class whose name ends in `Api`, `Client` or `Service` with more than one
  remote call on it, injected into a use case.
- A resolver with a second public method, or a `resolve` that takes a flag
  ("force", "skipCache").
- A `Map`, a timestamp or a TTL inside a resolver.
- A url, a status code or an HTTP client's name outside `infrastructure`.
- A resolver injected into a screen, a component or a facade — the facade
  calls a use case, the use case calls the resolver.
- A cache key declared on an endpoint class.

## Related

- [TD-0004](./TD-0004-inward-dependencies-inside-core.md) — the port is declared in `application`, the adapter in `infrastructure`
- [TD-0008](./TD-0008-value-and-freshness-are-one-state.md) — where freshness lives, and why not in the transport
- [TD-0010](./TD-0010-commands-return-no-data.md) — the failure becomes an outcome in the use case
- [TD-0012](./TD-0012-what-a-repository-is.md) — a resolver is a gateway, not a repository
