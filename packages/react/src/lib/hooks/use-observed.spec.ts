import { act, renderHook } from '@testing-library/react';

import type { Observer, Subscribable, Subscription } from '@tactical-ddd/core';

import { useObserved } from './use-observed';

type Subject<T> = Subscribable<T> & {
  emit(value: T): void;
  subscriberCount(): number;
};

/**
 * A hand-rolled stream: rxjs is not a dependency of this package, and the hook
 * only needs the structural contract. `initial` replays to every new subscriber,
 * the way a watch hands over the state it already has.
 */
const makeSubject = <T>(initial?: T): Subject<T> => {
  const subscribers = new Set<(value: T) => void>();

  return {
    subscribe: (first: Observer<T> | ((value: T) => void)): Subscription => {
      const next = typeof first === 'function' ? first : first.next;

      subscribers.add(next);

      if (initial !== undefined) {
        next(initial);
      }

      return { unsubscribe: () => subscribers.delete(next) };
    },
    emit: (value) => subscribers.forEach((next) => next(value)),
    subscriberCount: () => subscribers.size,
  };
};

describe('useObserved', () => {
  it('is undefined until the stream emits', () => {
    const { result } = renderHook(() => useObserved(makeSubject<number>()));

    expect(result.current).toBeUndefined();
  });

  it('returns the value a stream replays on subscribe', () => {
    const { result } = renderHook(() => useObserved(makeSubject(1)));

    expect(result.current).toBe(1);
  });

  it('re-renders on every later value', () => {
    const subject = makeSubject(1);
    const { result } = renderHook(() => useObserved(subject));

    act(() => subject.emit(2));

    expect(result.current).toBe(2);
  });

  it('distinguishes an empty value from no value', () => {
    const subject = makeSubject<number[]>();
    const { result } = renderHook(() => useObserved(subject));

    expect(result.current).toBeUndefined();

    act(() => subject.emit([]));

    expect(result.current).toEqual([]);
  });

  it('forgets the previous value when the source changes', () => {
    const first = makeSubject(1);
    const second = makeSubject<number>();

    const { result, rerender } = renderHook(
      ({ source }: { source: Subscribable<number> }) => useObserved(source),
      { initialProps: { source: first as Subscribable<number> } },
    );

    expect(result.current).toBe(1);

    rerender({ source: second });

    // Not 1: that value belonged to the argument the caller has moved on from.
    expect(result.current).toBeUndefined();
  });

  it('keeps one subscription across re-renders of the same source', () => {
    const subject = makeSubject(1);
    const { rerender } = renderHook(() => useObserved(subject));

    rerender();
    rerender();

    expect(subject.subscriberCount()).toBe(1);
  });

  it('unsubscribes on unmount', () => {
    const subject = makeSubject(1);
    const { unmount } = renderHook(() => useObserved(subject));

    expect(subject.subscriberCount()).toBe(1);

    unmount();

    expect(subject.subscriberCount()).toBe(0);
  });
});
