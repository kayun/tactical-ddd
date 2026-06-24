/**
 * `depConstraints` for `@nx/enforce-module-boundaries`, encoding the dependency
 * graph of the Tactical DDD architecture.
 *
 * The rule enforces two things at once:
 *   1. The allowed dependency directions described below (a library may only
 *      depend on libraries whose tags are listed in `onlyDependOnLibsWithTags`).
 *   2. The absence of circular dependencies between projects — this is built
 *      into `@nx/enforce-module-boundaries` and needs no extra option.
 */

import { LibraryScope, LibraryType } from '../../types';

/** A single `@nx/enforce-module-boundaries` dependency constraint. */
export interface DepConstraint {
  sourceTag: string;
  onlyDependOnLibsWithTags: string[];
}

export const DEP_CONSTRAINTS: DepConstraint[] = [
  // ==========================================
  // 1. SCOPE RULES
  // ==========================================

  // Shared knows about nothing but itself.
  {
    sourceTag: LibraryScope.Shared,
    onlyDependOnLibsWithTags: [LibraryScope.Shared],
  },
  // A domain may use shared libraries and other libraries of its own scope.
  {
    sourceTag: LibraryScope.Domain,
    onlyDependOnLibsWithTags: [LibraryScope.Domain, LibraryScope.Shared],
  },

  // ==========================================
  // 2. CROSS-DOMAIN IMPORT PROTECTION
  // ==========================================
  // The dynamic `domain:*` tag confines a library to its own domain: a
  // `domain:auth` lib may only depend on other `domain:auth` libs (plus shared),
  // never on `domain:payments`, even though both share `scope:domain`.
  {
    sourceTag: LibraryScope.CrossDomain,
    onlyDependOnLibsWithTags: [LibraryScope.CrossDomain, LibraryScope.Shared],
  },

  // ==========================================
  // 3. TYPE RULES (ARCHITECTURE LAYERS)
  // ==========================================

  // Contracts: the foundation. May import nothing.
  {
    sourceTag: LibraryType.Contracts,
    onlyDependOnLibsWithTags: [LibraryType.Contracts],
  },

  // Utils: pure functions. Know only contracts and other utils.
  {
    sourceTag: LibraryType.Utils,
    onlyDependOnLibsWithTags: [LibraryType.Contracts, LibraryType.Utils],
  },

  // Infrastructure: I/O, API clients. Know types and helpers.
  {
    sourceTag: LibraryType.Infrastructure,
    onlyDependOnLibsWithTags: [
      LibraryType.Contracts,
      LibraryType.Utils,
      LibraryType.Infrastructure,
    ],
  },

  // Core: business logic. May use everything below it plus its own domain core.
  {
    sourceTag: LibraryType.Core,
    onlyDependOnLibsWithTags: [
      LibraryType.Contracts,
      LibraryType.Utils,
      LibraryType.Infrastructure,
      LibraryType.Core,
    ],
  },

  // ------------------------------------------
  // UI (presentational components)
  // ------------------------------------------
  // Dumb components (buttons, cards, forms). Know only props interfaces
  // (contracts) and formatting helpers (utils). Importing core (entities) or
  // infrastructure is strictly forbidden.
  {
    sourceTag: LibraryType.Ui,
    onlyDependOnLibsWithTags: [
      LibraryType.Contracts,
      LibraryType.Utils,
      LibraryType.Ui,
    ],
  },

  // Testing: mocks and fixtures. May import the core for mocking.
  {
    sourceTag: LibraryType.Testing,
    onlyDependOnLibsWithTags: [
      LibraryType.Contracts,
      LibraryType.Utils,
      LibraryType.Infrastructure,
      LibraryType.Core,
      LibraryType.Ui,
      LibraryType.Testing,
    ],
  },

  // Features: UI and state. The topmost layer, may import everything.
  {
    sourceTag: LibraryType.Features,
    onlyDependOnLibsWithTags: [
      LibraryType.Contracts,
      LibraryType.Utils,
      LibraryType.Infrastructure,
      LibraryType.Core,
      LibraryType.Ui,
      LibraryType.Testing,
      LibraryType.Features,
    ],
  },
];
