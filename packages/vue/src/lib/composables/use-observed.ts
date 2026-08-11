import {
  getCurrentScope,
  onScopeDispose,
  shallowRef,
  toValue,
  watch,
  type MaybeRefOrGetter,
  type ShallowRef,
} from 'vue';

import type { Subscribable, Subscription } from '@tactical-ddd/core';

/**
 * Subscribes a component to a domain stream — a facade's watch, an actor, an
 * observable — and exposes its latest value as a ref.
 *
 * `undefined` means "nothing has arrived yet", which is not the same as an empty
 * array: that would mean a value arrived and it was empty.
 *
 * The source may be a plain stream or a ref/getter over one, so a screen whose
 * argument changes (a route param, a selected id) resubscribes on its own.
 *
 * Call it from `setup`: the subscription is tied to the active effect scope and
 * ends with it. Without a scope nothing releases it, and the stream keeps
 * pushing into a ref no one reads.
 *
 * Stream failures are deliberately not handled here. They belong to the source
 * (a `catchError` in the repository, a `failed` state in the value), because an
 * error delivered to the observer ends the subscription for good and the screen
 * would stop updating.
 */
export const useObserved = <T>(
  source: MaybeRefOrGetter<Subscribable<T>>,
): Readonly<ShallowRef<T | undefined>> => {
  const value: ShallowRef<T | undefined> = shallowRef(undefined);

  let subscription: Subscription | undefined;

  const unsubscribe = () => {
    subscription?.unsubscribe();
    subscription = undefined;
  };

  watch(
    () => toValue(source),
    (next) => {
      unsubscribe();

      // The previous source's value no longer applies: without this reset the
      // screen would keep showing data belonging to the old argument.
      value.value = undefined;

      subscription = next.subscribe((emitted: T) => {
        value.value = emitted;
      });
    },
    // `sync` so the ref never lags behind the source it is meant to reflect: a
    // deferred resubscribe would leave the old stream's value readable, which
    // reads as a wrong answer rather than as a pending one. `immediate` because
    // a watch replays its current state on subscribe — that value should be
    // there on the first render, not one tick later.
    { immediate: true, flush: 'sync' },
  );

  // Guarded rather than `onScopeDispose(unsubscribe, true)`: the `failSilently`
  // argument that suppresses the "no active scope" warning only exists in Vue
  // 3.5+, and this check costs one call to keep the floor at 3.3. Outside a
  // scope nothing releases the subscription — the doc block covers that.
  if (getCurrentScope()) {
    onScopeDispose(unsubscribe);
  }

  return value;
};
