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
- [`useWatch`](#usewatch) — the same for a facade's watch, collapsing "not subscribed yet" into `loading`.

> More components, hooks, and utilities are planned. This document covers what ships today.

## Installation

```bash
npm install @tactical-ddd/react
# peer dependencies
npm install react @tactical-ddd/core
```

`@tactical-ddd/core` provides the stream and state contracts these hooks are
written against (`Subscribable`, `Watch`, `Loadable`).

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

### useWatch

A facade publishes changing data as a watch — a stream of [`Loadable`](https://www.npmjs.com/package/@tactical-ddd/core) states. Consuming it with `useObserved` leaves the caller with `Loadable<T> | undefined`, and that `undefined` is not a state of the data: it means the subscription has not started, because `useSyncExternalStore` reads during render but subscribes after commit.

Since "not subscribed yet" tells a screen nothing beyond what `LoadStatus.Loading` already says, `useWatch` collapses the two and never returns `undefined`:

```ts
useWatch<T>(source: Watch<T>): Loadable<T>;
```

```tsx
import { useMemo } from 'react';
import { LoadStatus } from '@tactical-ddd/core';
import { useWatch } from '@tactical-ddd/react';

const BeneficiaryList = ({ facade }: { facade: BeneficiariesFacade }) => {
  const source = useMemo(() => facade.observeAll(), [facade]);
  const state = useWatch(source);

  switch (state.status) {
    case LoadStatus.Loading:
      return <Spinner />;
    case LoadStatus.Ready:
      return <List items={state.value} refreshing={state.stale} />;
    case LoadStatus.Failed:
      return state.value === undefined ? (
        <Failure reason={state.reason} />
      ) : (
        <List items={state.value} error={state.reason} />
      );
  }
};
```

Worth knowing:

- **One thing to check, not two.** A component switches on `status` and nothing else, so the loading branch cannot be forgotten and `value` cannot be read in a state that has none.
- **The loading state is a shared constant.** A fresh object per render would break reference equality and defeat memoisation in every consumer, so the same `{ status: LoadStatus.Loading }` is returned every time.
- **Changing the source returns to loading**, because the previous state described data the caller has moved on from.
- **Use `useObserved` for streams that are not watches** — an XState actor, a notification, anything not carrying a `Loadable`. There `undefined` is meaningful and should stay visible.

## Running unit tests

Run `nx test @tactical-ddd/react` to execute the unit tests via [Jest](https://jestjs.io/) and [React Testing Library](https://testing-library.com/docs/react-testing-library/intro/).
