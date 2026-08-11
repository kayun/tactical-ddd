[![npm version](https://img.shields.io/npm/v/@tactical-ddd/vue)](https://www.npmjs.com/package/@tactical-ddd/vue)
[![npm downloads](https://img.shields.io/npm/dm/@tactical-ddd/vue)](https://www.npmjs.com/package/@tactical-ddd/vue)
[![license](https://img.shields.io/npm/l/@tactical-ddd/vue)](https://github.com/kayun/tactical-ddd/blob/main/LICENSE)
[![CI](https://github.com/kayun/tactical-ddd/actions/workflows/ci.yml/badge.svg)](https://github.com/kayun/tactical-ddd/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/kayun/tactical-ddd/branch/main/graph/badge.svg)](https://codecov.io/gh/kayun/tactical-ddd)

# @tactical-ddd/vue

`@tactical-ddd/vue` is the Vue layer of the `@tactical-ddd` ecosystem — a collection of shared, domain-agnostic Vue 3 building blocks (composables, components, and utilities) for applications structured around Domain-Driven Design (DDD) and Clean Architecture.

It depends on `vue` alone, so the same package serves any Vue 3 runtime — a Vite SPA, Nuxt, or a custom renderer.

## Philosophy

In a DDD / Clean Architecture workspace, business logic lives inside isolated domains and the framework details stay at the edges. This package is the **shared Vue kernel** that sits beneath those domains:

- It holds only generic, reusable Vue primitives — never business logic tied to a specific domain.
- Domains and feature layers (`libs/[domain]/features`) may import from it; it must never import back from any domain.
- Everything here is framework-presentation glue (composables, wrappers, components), keeping the domain `core` layers pure and free of Vue.

The suite is being built out incrementally. Utilities currently available:

- [`useObserved`](#useobserved) — exposes a domain stream to a component as a ref that tracks its latest value.

> More components, composables, and utilities are planned. This document covers what ships today.

## Installation

```bash
npm install @tactical-ddd/vue
# peer dependencies
npm install vue @tactical-ddd/core
```

`@tactical-ddd/core` is needed for the stream contract `useObserved` accepts; it
is imported as a type only, so nothing from it ends up in the bundle.

Requires Vue `>= 3.3` (for `toValue` / `MaybeRefOrGetter`, which the reactive
`source` argument is built on).

## Utilities

### useObserved

A domain publishes changing data as a stream — a facade's watch, an XState actor, an observable. A component needs the current value of that stream and an update whenever it changes, without owning the subscription lifecycle or reaching for a stream library of its own.

`useObserved` is that bridge: it subscribes inside the active effect scope, exposes the latest value as a `shallowRef`, and unsubscribes when the scope ends.

```ts
useObserved<T>(
  source: MaybeRefOrGetter<Subscribable<T>>,
): Readonly<ShallowRef<T | undefined>>;
```

```vue
<script setup lang="ts">
import { useObserved } from '@tactical-ddd/vue';

const props = defineProps<{ facade: BeneficiariesFacade }>();

// A getter, not a plain call: the stream is rebuilt — and resubscribed — when
// the argument it depends on changes.
const beneficiaries = useObserved(() => props.facade.observeAll());
</script>

<template>
  <Spinner v-if="beneficiaries === undefined" />
  <List v-else :items="beneficiaries" />
</template>
```

Worth knowing:

- **`undefined` means "nothing has arrived yet"** — which is not the same as an empty array. A stream that replays its current state to new subscribers (as a watch does) will usually resolve this before the first render.
- **The source may be reactive.** Pass a getter or a ref when the stream depends on changing arguments (a route param, a selected id); the composable resubscribes on its own. Pass the stream directly when it never changes.
- **Changing the source forgets the previous value**, synchronously. Otherwise a screen would go on showing data belonging to the argument it has moved on from, which reads as a wrong answer rather than as a pending one.
- **Call it in `setup`.** The subscription is bound to the active effect scope and released with it. Called outside a scope it still works, but nothing will unsubscribe for you.
- **Failures belong to the source, not to the composable.** It subscribes with a value callback only: an error delivered to the observer would end the subscription for good and the component would silently stop updating. Model failure as part of the value (see [`Loadable`](https://www.npmjs.com/package/@tactical-ddd/core)) or catch it where the stream is built.
- **Any `Subscribable` works** — an rxjs `Observable`, an XState actor, a hand-rolled emitter — because the contract is structural and this package depends on none of them.

## Wiring up providers

There is deliberately no `composeProviders` helper here, unlike in [`@tactical-ddd/react`](https://www.npmjs.com/package/@tactical-ddd/react). React needs one because a context is only reachable through a component, so cross-cutting concerns pile up into a nesting pyramid. Vue has no such constraint:

- app-wide values go in `app.provide(key, value)` — no wrapper component at all;
- libraries ship plugins (`app.use(router)`, `app.use(pinia)`, `app.use(i18n)`), which is already a flat list;
- a concern that really is a component (a UI kit's config provider, a per-domain DI container over a route subtree) is usually one or two levels of nesting, which reads fine in a template.

## Running unit tests

Run `nx test @tactical-ddd/vue` to execute the unit tests via [Vitest](https://vitest.dev/).
