import { useCallback, useRef, useSyncExternalStore } from 'react';

import type { Subscribable } from '@tactical-ddd/core';

/**
 * Subscribes a component to a domain stream — a facade's watch, an actor, an
 * observable — and re-renders it on every value.
 *
 * `undefined` means "nothing has arrived yet", which is not the same as an empty
 * array: that would mean a value arrived and it was empty.
 *
 * `source` must be stable between renders, because a new reference is a new
 * subscription. Domain hooks build it with `useMemo` over their arguments.
 *
 * Stream failures are deliberately not handled here. They belong to the source
 * (a `catchError` in the repository, a `failed` state in the value), because an
 * error delivered to the observer ends the subscription for good and the screen
 * would stop updating.
 */
export const useObserved = <T>(source: Subscribable<T>): T | undefined => {
  const value = useRef<T | undefined>(undefined);

  const subscribe = useCallback(
    (notify: () => void) => {
      // The previous source's value no longer applies: without this reset the
      // screen would keep showing data belonging to the old argument.
      value.current = undefined;

      const subscription = source.subscribe((next: T) => {
        value.current = next;
        notify();
      });

      return () => subscription.unsubscribe();
    },
    [source],
  );

  return useSyncExternalStore(subscribe, () => value.current);
};
