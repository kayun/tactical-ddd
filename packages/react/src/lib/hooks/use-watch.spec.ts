import { act, renderHook } from '@testing-library/react';

import {
  type Loadable,
  LoadFailureKind,
  LoadStatus,
  type Observer,
  type Subscription,
  type Watch,
} from '@tactical-ddd/core';

import { useWatch } from './use-watch';

type WatchSubject<T> = Watch<T> & { emit(state: Loadable<T>): void };

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
  };
};

const ready = (value: number, stale = false): Loadable<number> => ({
  status: LoadStatus.Ready,
  value,
  stale,
});

describe('useWatch', () => {
  it('reports loading before the first state arrives', () => {
    const watch = makeWatch<number>();
    const { result } = renderHook(() => useWatch(watch));

    expect(result.current).toEqual({ status: LoadStatus.Loading });
  });

  it('never returns undefined, so a caller only switches on status', () => {
    const watch = makeWatch<number>();
    const { result } = renderHook(() => useWatch(watch));

    expect(result.current).toBeDefined();
  });

  it('returns the state a watch replays on subscribe', () => {
    const watch = makeWatch(ready(1));
    const { result } = renderHook(() => useWatch(watch));

    expect(result.current).toEqual(ready(1));
  });

  it('passes every later state through untouched', () => {
    const watch = makeWatch(ready(1));
    const { result } = renderHook(() => useWatch(watch));

    act(() => watch.emit(ready(1, true)));
    expect(result.current).toEqual(ready(1, true));

    const failed: Loadable<number> = {
      status: LoadStatus.Failed,
      reason: { kind: LoadFailureKind.Unavailable, message: 'offline' },
      value: 1,
    };

    act(() => watch.emit(failed));
    expect(result.current).toEqual(failed);
  });

  it('keeps the same loading reference across renders', () => {
    const watch = makeWatch<number>();
    const { result, rerender } = renderHook(() => useWatch(watch));
    const first = result.current;

    rerender();

    // A fresh object here would break memoisation in every consumer.
    expect(result.current).toBe(first);
  });

  it('falls back to loading when the source changes', () => {
    const first = makeWatch(ready(1));
    const second = makeWatch<number>();

    const { result, rerender } = renderHook(
      ({ source }: { source: Watch<number> }) => useWatch(source),
      { initialProps: { source: first as Watch<number> } },
    );

    expect(result.current).toEqual(ready(1));

    rerender({ source: second });

    expect(result.current).toEqual({ status: LoadStatus.Loading });
  });
});
