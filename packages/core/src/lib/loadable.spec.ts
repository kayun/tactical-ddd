import { type Loadable, LoadFailureKind, LoadStatus } from './loadable.js';

/** What a screen would do with each case — the union has to force all three. */
const describeState = <T>(state: Loadable<T>): string => {
  switch (state.status) {
    case LoadStatus.Loading:
      return 'loading';
    case LoadStatus.Ready:
      return state.stale ? 'refreshing' : 'ready';
    case LoadStatus.Failed:
      return state.value === undefined
        ? `failed: ${state.reason.kind}`
        : `failed, showing last known: ${state.reason.kind}`;
  }
};

describe('Loadable', () => {
  it('separates a fresh value from one being refreshed', () => {
    expect(
      describeState({ status: LoadStatus.Ready, value: 1, stale: false }),
    ).toBe('ready');
    expect(
      describeState({ status: LoadStatus.Ready, value: 1, stale: true }),
    ).toBe('refreshing');
  });

  it('keeps the last known value on a failure', () => {
    const reason = {
      kind: LoadFailureKind.Unavailable,
      message: 'offline',
    };

    expect(describeState({ status: LoadStatus.Failed, reason })).toBe(
      'failed: unavailable',
    );
    expect(describeState({ status: LoadStatus.Failed, reason, value: 1 })).toBe(
      'failed, showing last known: unavailable',
    );
  });
});

describe('LoadStatus', () => {
  it('serialises to the names a stored or logged state would carry', () => {
    expect(Object.values(LoadStatus)).toEqual(['loading', 'ready', 'failed']);
  });
});

describe('LoadFailureKind', () => {
  it('names failures by what the caller can do, not by where they happened', () => {
    expect(Object.values(LoadFailureKind)).toEqual([
      'unavailable',
      'retryable',
      'rejected',
      'unknown',
    ]);
  });
});
