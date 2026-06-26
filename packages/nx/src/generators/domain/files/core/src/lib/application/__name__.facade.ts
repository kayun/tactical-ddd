import { <%= interfaceName %> } from '<%= contractsPackage %>';

export class Core<%= interfaceName %> implements <%= interfaceName %> {
  method(): void {
    throw new Error('Method not implemented.');
  }
}