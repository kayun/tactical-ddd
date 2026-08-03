/**
 * Generic application use case: a single `execute` entry point.
 * `TArgs` is the tuple of call arguments, `TResult` the return type
 * (which may be synchronous or a `Promise`).
 */
export interface UseCase<TArgs extends unknown[], TResult> {
  execute(...args: TArgs): TResult;
}
