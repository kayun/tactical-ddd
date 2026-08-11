import type { Command, Query, Watch } from '@tactical-ddd/core';

import { <%= interfaceName %> } from '<%= contractsPackage %>';

export class Core<%= interfaceName %> implements <%= interfaceName %> {
  query(): Query<unknown> {
    throw new Error('Method not implemented.');
  }

  watch(): Watch<unknown> {
    throw new Error('Method not implemented.');
  }

  command(): Command {
    throw new Error('Method not implemented.');
  }
}
