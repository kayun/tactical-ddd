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

> More components, hooks, and utilities are planned. This document covers what ships today.

## Installation

```bash
npm install @tactical-ddd/react
# peer dependency
npm install react
```

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

## Running unit tests

Run `nx test @tactical-ddd/react` to execute the unit tests via [Jest](https://jestjs.io/) and [React Testing Library](https://testing-library.com/docs/react-testing-library/intro/).
