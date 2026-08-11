[![npm version](https://img.shields.io/npm/v/@tactical-ddd/react)](https://www.npmjs.com/package/@tactical-ddd/react)
[![npm downloads](https://img.shields.io/npm/dm/@tactical-ddd/react)](https://www.npmjs.com/package/@tactical-ddd/react)
[![license](https://img.shields.io/npm/l/@tactical-ddd/react)](https://github.com/kayun/tactical-ddd/blob/main/LICENSE)
[![CI](https://github.com/kayun/tactical-ddd/actions/workflows/ci.yml/badge.svg)](https://github.com/kayun/tactical-ddd/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/kayun/tactical-ddd/branch/main/graph/badge.svg)](https://codecov.io/gh/kayun/tactical-ddd)

# @tactical-ddd/react

`@tactical-ddd/react` is the React layer of the `@tactical-ddd` ecosystem — a collection of shared, domain-agnostic React building blocks (components, hooks, and utilities) for applications structured around Domain-Driven Design (DDD) and Clean Architecture.

It is platform-neutral: the helpers depend only on `react` itself, so the same package can be consumed by web apps (React DOM) and native apps (React Native) alike.

## Philosophy

In a DDD / Clean Architecture workspace, business logic lives inside isolated domains and the framework details stay at the edges. This package is the **shared React kernel** that sits beneath those domains:

- It holds only generic, reusable React primitives — never business logic tied to a specific domain.
- Domains and feature layers (`libs/[domain]/features`) may import from it; it must never import back from any domain.
- Everything here is framework-presentation glue (composition helpers, hooks, wrappers), keeping the domain `core` layers pure and free of React.

The suite is being built out incrementally. Utilities currently available:

- [`createComposeProviders`](#composeproviders) — flattens deeply nested React context providers into a single, declarative list.
- [`useObserved`](#useobserved) — subscribes a component to a domain stream and re-renders it on every value.

> More components, hooks, and utilities are planned. This document covers what ships today.

## Installation

```bash
npm install @tactical-ddd/react
# peer dependencies
npm install react @tactical-ddd/core
```

`@tactical-ddd/core` is needed for the stream contract `useObserved` accepts; it
is imported as a type only, so nothing from it ends up in the bundle.

## Utilities

### composeProviders

When an app wires up dependency injection, theming, query clients, routing, and per-domain context, the root tree quickly degrades into a "provider pyramid":

```tsx
<ThemeProvider theme={theme}>
  <QueryProvider client={client}>
    <AuthProvider user={user}>
      <RouterProvider router={router}>
        <App />
      </RouterProvider>
    </AuthProvider>
  </QueryProvider>
</ThemeProvider>
```

`createComposeProviders` removes that nesting by accepting a flat, ordered list of providers and returning a single component that wraps its children with all of them. `createProvider` is a small helper that pairs a provider component with its props in a type-safe way.

```tsx
import { createComposeProviders, createProvider } from '@tactical-ddd/react';

const AppProviders = createComposeProviders([
  createProvider(ThemeProvider, { theme }),
  createProvider(QueryProvider, { client }),
  createProvider(AuthProvider, { user }),
  createProvider(RouterProvider, { router }),
]);

// Usage
<AppProviders>
  <App />
</AppProviders>;
```

**Ordering:** providers are nested in array order — the **first** entry is the **outermost** wrapper and the **last** is the **innermost**. That means a context supplied by an earlier provider is available to every provider (and child) that follows it.

#### API

##### `createProvider(Component, props?)`

Creates a type-safe provider descriptor. `props` are checked against the component's own props (with `children` omitted) and may be left out for providers that take none.

```ts
createProvider<TProps extends object>(
  Component: ComponentType<PropsWithChildren<TProps>>,
  props?: Omit<TProps, 'children'>,
): Provider<TProps>;
```

##### `createComposeProviders(providers)`

Takes an array of provider descriptors and returns a single `ComponentType<PropsWithChildren>` that renders them nested from first (outer) to last (inner).

```ts
createComposeProviders(
  providers: Array<Provider<any>>,
): ComponentType<PropsWithChildren>;
```

### useObserved

A domain publishes changing data as a stream — a facade's watch, an XState actor, an observable. A component needs the current value of that stream and a re-render whenever it changes, without owning the subscription lifecycle or reaching for a stream library of its own.

`useObserved` is that bridge, built on `useSyncExternalStore` so React itself owns the subscription and stays consistent under concurrent rendering.

```ts
useObserved<T>(source: Subscribable<T>): T | undefined;
```

```tsx
import { useMemo } from 'react';
import { useObserved } from '@tactical-ddd/react';

const BeneficiaryList = ({ facade }: { facade: BeneficiariesFacade }) => {
  // Memoised: a new source reference is a new subscription.
  const beneficiaries = useMemo(() => facade.observeAll(), [facade]);
  const state = useObserved(beneficiaries);

  if (state === undefined) {
    return <Spinner />;
  }

  return <List items={state} />;
};
```

Worth knowing:

- **`undefined` means "nothing has arrived yet"** — which is not the same as an empty array. A stream that replays its current state to new subscribers (as a watch does) will usually resolve this on the first render.
- **The source must be stable between renders.** A new reference resubscribes, so build it with `useMemo` over the arguments it depends on — not inline in the JSX.
- **Changing the source forgets the previous value.** Otherwise a screen would go on showing data belonging to the argument it has moved on from, which reads as a wrong answer rather than as a pending one.
- **Failures belong to the source, not to the hook.** The hook subscribes with a value callback only: an error delivered to the observer would end the subscription for good and the component would silently stop updating. Model failure as part of the value (see [`Loadable`](https://www.npmjs.com/package/@tactical-ddd/core)) or catch it where the stream is built.
- **Any `Subscribable` works** — an rxjs `Observable`, an XState actor, a hand-rolled emitter — because the contract is structural and this package depends on none of them.

## Running unit tests

Run `nx test @tactical-ddd/react` to execute the unit tests via [Jest](https://jestjs.io/) and [React Testing Library](https://testing-library.com/docs/react-testing-library/intro/).
