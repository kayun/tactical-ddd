import type { Unsubscribe } from './unsubscribe.js';

export type Subscription = Readonly<{
  unsubscribe: Unsubscribe;
}>;

export type Observer<T> = Readonly<{
  next: (value: T) => void;
  error?: (error: unknown) => void;
  complete?: () => void;
}>;

/**
 * The minimal structural contract of a stream. An rxjs `Observable` and an
 * XState actor both satisfy it, without either becoming a dependency of the
 * domain: a port declares its `observe*` methods through this type, and
 * operators stay with whoever needs them.
 */
export interface Subscribable<T> {
  subscribe(observer: Observer<T>): Subscription;

  subscribe(
    next: (value: T) => void,
    error?: (error: unknown) => void,
    complete?: () => void,
  ): Subscription;
}
