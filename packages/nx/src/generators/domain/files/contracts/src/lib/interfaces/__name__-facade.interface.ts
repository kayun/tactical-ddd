export interface <%= interfaceName %> {
  method(): void
}

export const <%= interfaceName %> = {
  $: Symbol.for('<%= interfaceName %>')
}