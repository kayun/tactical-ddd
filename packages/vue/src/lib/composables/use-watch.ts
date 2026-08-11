import { computed, type ComputedRef, type MaybeRefOrGetter } from 'vue';

import { type Loadable, LoadStatus, type Watch } from '@tactical-ddd/core';

import { useObserved } from './use-observed';

/**
 * The state a watch is in before its first value arrives. A module constant
 * rather than a fresh object per evaluation: a new reference would break
 * reference equality for anything memoising on it downstream.
 *
 * `Loadable<never>` is assignable to any `Loadable<T>`, so one constant serves
 * every call site.
 */
const LOADING: Loadable<never> = { status: LoadStatus.Loading };

/**
 * Subscribes a component to a facade's watch and exposes its state as a ref that
 * is never `undefined`.
 *
 * The name refers to the facade's watch — a stream of `Loadable` states — not to
 * Vue's `watch`. Nothing here is a reactive effect the caller has to stop.
 *
 * `useObserved` yields `undefined` until the subscription starts, which says
 * nothing a screen can use beyond what `LoadStatus.Loading` already says, so the
 * two are collapsed here rather than passed on as a second thing to check.
 *
 * The source may be a plain watch or a ref/getter over one; changing it returns
 * the state to loading, because the previous one described data the caller has
 * moved on from. Use `useObserved` directly for streams that are not watches —
 * an actor, a notification, anything not carrying a `Loadable`.
 */
export const useWatch = <T>(
  source: MaybeRefOrGetter<Watch<T>>,
): ComputedRef<Loadable<T>> => {
  const observed = useObserved(source);

  return computed(() => observed.value ?? LOADING);
};
