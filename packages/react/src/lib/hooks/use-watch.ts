import { type Loadable, LoadStatus, type Watch } from '@tactical-ddd/core';

import { useObserved } from './use-observed';

/**
 * The state a watch is in before its first value arrives. A module constant
 * rather than a fresh object per render: a new reference on every render would
 * defeat memoisation and reference equality further down the tree.
 *
 * `Loadable<never>` is assignable to any `Loadable<T>`, so one constant serves
 * every call site.
 */
const LOADING: Loadable<never> = { status: LoadStatus.Loading };

/**
 * Subscribes a component to a facade's watch and returns its state — never
 * `undefined`.
 *
 * `useSyncExternalStore` reads during render but subscribes after commit, so the
 * very first render has nothing yet. That gap says "the subscription has not
 * started", which tells a screen nothing more than `LoadStatus.Loading` already
 * does, so it is collapsed here instead of being passed on as a second thing to
 * check.
 *
 * `source` must be stable between renders — see `useObserved`, which this builds
 * on and which stays the way to consume streams that are not watches (an actor,
 * a notification, anything not carrying a `Loadable`).
 */
export const useWatch = <T>(source: Watch<T>): Loadable<T> =>
  useObserved(source) ?? LOADING;
