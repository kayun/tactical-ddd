import { effectScope, ref, type Ref } from 'vue';

import {
  type Loadable,
  LoadFailureKind,
  LoadStatus,
  type Observer,
  type Subscription,
  type Watch,
} from '@tactical-ddd/core';

import { useWatch } from './use-watch';

type WatchSubject<T> = Watch<T> & {
  emit(state: Loadable<T>): void;
  subscriberCount(): number;
};

const makeWatch = <T>(initial?: Loadable<T>): WatchSubject<T> => {
  const subscribers = new Set<(state: Loadable<T>) => void>();

  return {
    subscribe: (
      first: Observer<Loadable<T>> | ((state: Loadable<T>) => void),
    ): Subscription => {
      const next = typeof first === 'function' ? first : first.next;

      subscribers.add(next);

      if (initial !== undefined) {
        next(initial);
      }

      return { unsubscribe: () => subscribers.delete(next) };
    },
    emit: (state) => subscribers.forEach((next) => next(state)),
    subscriberCount: () => subscribers.size,
  };
};

/**
 * Runs a composable inside an effect scope, mirroring what `setup` provides: the
 * subscription is released by `stop`, the way it would be on unmount.
 */
const withScope = <T>(composable: () => T): [T, () => void] => {
  const scope = effectScope();
  const result = scope.run(composable) as T;

  return [result, () => scope.stop()];
};

const ready = (value: number, stale = false): Loadable<number> => ({
  status: LoadStatus.Ready,
  value,
  stale,
});

describe('useWatch', () => {
  it('reports loading before the first state arrives', () => {
    const [state] = withScope(() => useWatch(makeWatch<number>()));

    expect(state.value).toEqual({ status: LoadStatus.Loading });
  });

  it('is never undefined, so a template only switches on status', () => {
    const [state] = withScope(() => useWatch(makeWatch<number>()));

    expect(state.value).toBeDefined();
  });

  it('returns the state a watch replays on subscribe', () => {
    const [state] = withScope(() => useWatch(makeWatch(ready(1))));

    expect(state.value).toEqual(ready(1));
  });

  it('passes every later state through untouched', () => {
    const watch = makeWatch(ready(1));
    const [state] = withScope(() => useWatch(watch));

    watch.emit(ready(1, true));
    expect(state.value).toEqual(ready(1, true));

    const failed: Loadable<number> = {
      status: LoadStatus.Failed,
      reason: { kind: LoadFailureKind.Unavailable, message: 'offline' },
      value: 1,
    };

    watch.emit(failed);
    expect(state.value).toEqual(failed);
  });

  it('returns to loading when the source changes', () => {
    const first = makeWatch(ready(1));
    const second = makeWatch<number>();
    const source: Ref<Watch<number>> = ref(first);

    const [state] = withScope(() => useWatch(source));

    expect(state.value).toEqual(ready(1));

    source.value = second;

    // Synchronously: the ref must never contradict the source it reflects.
    expect(state.value).toEqual({ status: LoadStatus.Loading });
  });

  it('reuses one loading state across sources', () => {
    const source: Ref<Watch<number>> = ref(makeWatch<number>());

    const [state] = withScope(() => useWatch(source));
    const before = state.value;

    source.value = makeWatch<number>();

    // A fresh object here would break reference equality for every consumer.
    expect(state.value).toBe(before);
  });

  it('accepts a getter source', () => {
    const watch = makeWatch(ready(1));

    const [state] = withScope(() => useWatch(() => watch));

    expect(state.value).toEqual(ready(1));
  });

  it('unsubscribes when the scope is stopped', () => {
    const watch = makeWatch(ready(1));
    const [, stop] = withScope(() => useWatch(watch));

    expect(watch.subscriberCount()).toBe(1);

    stop();

    expect(watch.subscriberCount()).toBe(0);
  });
});
