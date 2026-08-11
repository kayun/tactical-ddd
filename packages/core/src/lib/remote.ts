export type RemoteFailureKind =
  /** No response at all: the network was unreachable or the call timed out. */
  | 'transport'
  /** The other side broke — retrying makes sense. */
  | 'server'
  /** The request was rejected: forbidden, missing, conflicting. Retrying will not help. */
  | 'request'
  | 'unknown';

export type RemoteFailure = Readonly<{
  kind: RemoteFailureKind;
  message: string;
  cause?: unknown;
}>;

/**
 * The state of remotely held data: the value and its freshness are inseparable,
 * because showing one without the other is not something a screen can do.
 *
 * `stale` means "there is a value, but a refresh is in flight" — the screen keeps
 * showing the data it has instead of flashing a spinner. For the same reason
 * `failed` carries a `value`: the last known one, if there was one.
 */
export type Remote<T> =
  | Readonly<{ status: 'loading' }>
  | Readonly<{ status: 'ready'; value: T; stale: boolean }>
  | Readonly<{ status: 'failed'; reason: RemoteFailure; value?: T }>;
