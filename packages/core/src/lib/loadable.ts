/** Where a read has got to. The discriminant of `Loadable`. */
export enum LoadStatus {
  /** Nothing is known yet — the first read is still running. */
  Loading = 'loading',
  /** There is a value. `stale` says whether a refresh is running behind it. */
  Ready = 'ready',
  /** The read did not produce a value; the last known one may still be there. */
  Failed = 'failed',
}

/**
 * Why a read did not produce a value. Named for what the caller can do about it
 * rather than for where it broke, so the same vocabulary fits a network, a local
 * database, and a file.
 */
export enum LoadFailureKind {
  /** No answer at all: no connectivity, an unreadable store, a timeout. */
  Unavailable = 'unavailable',
  /** The source itself broke — retrying may work. */
  Retryable = 'retryable',
  /** The read was refused: forbidden, missing, conflicting. Retrying will not help. */
  Rejected = 'rejected',
  Unknown = 'unknown',
}

export type LoadFailure = Readonly<{
  kind: LoadFailureKind;
  message: string;
  cause?: unknown;
}>;

/**
 * A value together with the state of getting it — the two are inseparable,
 * because showing one without the other is not something a screen can do. Where
 * the value comes from is not part of the type: a local database is loaded,
 * refreshed, and unreadable in exactly the same three ways a server is.
 *
 * `stale` means "there is a value, but a refresh is in flight" — the screen keeps
 * showing the data it has instead of flashing a spinner. For the same reason
 * `failed` carries a `value`: the last known one, if there was one.
 */
export type Loadable<T> =
  | Readonly<{ status: LoadStatus.Loading }>
  | Readonly<{ status: LoadStatus.Ready; value: T; stale: boolean }>
  | Readonly<{
      status: LoadStatus.Failed;
      reason: LoadFailure;
      value?: T;
    }>;
