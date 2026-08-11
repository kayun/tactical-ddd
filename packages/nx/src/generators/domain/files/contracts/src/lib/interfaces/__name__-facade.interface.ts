import type { Command, Facade, Query, Watch } from '@tactical-ddd/core';

export type <%= interfaceName %> = Facade<{
  queries: {
    query(): Query<unknown>;
  };
  watches: {
    watch(): Watch<unknown>;
  };
  commands: {
    command(): Command;
  };
}>;

export const <%= interfaceName %> = {
  $: Symbol.for('<%= interfaceName %>')
}
