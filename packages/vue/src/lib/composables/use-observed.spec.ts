import { effectScope, nextTick, ref, type Ref } from 'vue';

import type { Observer, Subscribable, Subscription } from '@tactical-ddd/core';

import { useObserved } from './use-observed';

type Subject<T> = Subscribable<T> & {
  emit(value: T): void;
  subscriberCount(): number;
};

/**
 * A hand-rolled stream: rxjs is not a dependency of this package, and the
 * composable only needs the structural contract. `initial` replays to every new
 * subscriber, the way a watch hands over the state it already has.
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

/**
 * Runs a composable inside an effect scope, mirroring what `setup` provides: the
 * subscription is released by `stop`, the way it would be on unmount.
 */
const withScope = <T>(composable: () => T): [T, () => void] => {
  const scope = effectScope();
  const result = scope.run(composable) as T;

  return [result, () => scope.stop()];
};

describe('useObserved', () => {
  it('is undefined until the stream emits', () => {
    const [value] = withScope(() => useObserved(makeSubject<number>()));

    expect(value.value).toBeUndefined();
  });

  it('returns the value a stream replays on subscribe', () => {
    const [value] = withScope(() => useObserved(makeSubject(1)));

    expect(value.value).toBe(1);
  });

  it('updates on every later value', () => {
    const subject = makeSubject(1);
    const [value] = withScope(() => useObserved(subject));

    subject.emit(2);

    expect(value.value).toBe(2);
  });

  it('distinguishes an empty value from no value', () => {
    const subject = makeSubject<number[]>();
    const [value] = withScope(() => useObserved(subject));

    expect(value.value).toBeUndefined();

    subject.emit([]);

    expect(value.value).toEqual([]);
  });

  it('accepts a ref source and resubscribes when it changes', async () => {
    const first = makeSubject(1);
    const second = makeSubject(2);
    const source: Ref<Subscribable<number>> = ref(first);

    const [value] = withScope(() => useObserved(source));

    expect(value.value).toBe(1);

    source.value = second;
    await nextTick();

    expect(value.value).toBe(2);
    expect(first.subscriberCount()).toBe(0);
    expect(second.subscriberCount()).toBe(1);
  });

  it('accepts a getter source', () => {
    const subject = makeSubject(1);

    const [value] = withScope(() => useObserved(() => subject));

    expect(value.value).toBe(1);
  });

  it('forgets the previous value when the source changes', () => {
    const first = makeSubject(1);
    const second = makeSubject<number>();
    const source: Ref<Subscribable<number>> = ref(first);

    const [value] = withScope(() => useObserved(source));

    expect(value.value).toBe(1);

    source.value = second;

    // Not 1: that value belonged to the argument the caller has moved on from.
    // Synchronously, because the ref must never contradict its own source.
    expect(value.value).toBeUndefined();
  });

  it('keeps one subscription while the source stays the same', () => {
    const subject = makeSubject(1);
    const unrelated = ref(0);

    withScope(() => {
      const value = useObserved(() => subject);
      // Touching another reactive value must not resubscribe.
      unrelated.value += 1;

      return value;
    });

    expect(subject.subscriberCount()).toBe(1);
  });

  it('unsubscribes when the scope is stopped', () => {
    const subject = makeSubject(1);
    const [, stop] = withScope(() => useObserved(subject));

    expect(subject.subscriberCount()).toBe(1);

    stop();

    expect(subject.subscriberCount()).toBe(0);
  });

  it('does not warn when used outside an effect scope', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const subject = makeSubject(1);

    const value = useObserved(subject);

    expect(value.value).toBe(1);
    expect(warn).not.toHaveBeenCalled();

    warn.mockRestore();
  });
});
