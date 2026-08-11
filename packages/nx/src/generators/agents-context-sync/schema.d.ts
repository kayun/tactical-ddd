export interface AgentsContextSyncGeneratorSchema {
  /** Target folder for the library's ADR copies. Owned by the generator. */
  adrDirectory?: string;
  /** An existing guide to point at instead of the default. */
  guide?: string;
  /** Organization prefix for the guide's examples; used only when it is created. */
  prefix?: string;
  /** Report drift instead of fixing it. */
  check?: boolean;
}
