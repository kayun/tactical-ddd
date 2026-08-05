/**
 * Identity of an entity: either a primitive, or a value object that knows how
 * to compare itself. Anything else (a plain object, an array) is not a stable
 * identity and is rejected by the type.
 */
export type EntityId =
  | string
  | number
  | bigint
  | symbol
  | { equals(other: unknown): boolean };

/** Narrowing helper: an identity that carries its own comparison. */
function isComparable(id: EntityId): id is { equals(other: unknown): boolean } {
  return typeof id === 'object' && id !== null && 'equals' in id;
}

/**
 * Domain entity: an object defined by its identity rather than by its
 * attributes. Two entities of the same type with the same `id` are the same
 * thing even if every other field differs — that is exactly what separates an
 * entity from a value object.
 *
 * The class deliberately says nothing about mutability: immutable entities that
 * return a new instance on every change are as valid as mutable ones, because
 * `id` (not the state) is what carries identity through time.
 *
 * @example
 * ```ts
 * class PinCredential extends Entity {
 *   private constructor(sub: string, readonly attempts: number) {
 *     super(sub);
 *   }
 *
 *   static create(sub: string): PinCredential {
 *     return new PinCredential(sub, 0);
 *   }
 *
 *   registerFailure(): PinCredential {
 *     // Same identity, new state.
 *     return new PinCredential(this.id, this.attempts + 1);
 *   }
 * }
 * ```
 */
export abstract class Entity<TId extends EntityId = string> {
  protected constructor(private readonly identity: TId) {}

  get id(): TId {
    return this.identity;
  }

  /**
   * Identity comparison. Entities of different concrete classes are never
   * equal, even when their ids match: the check uses constructor identity, so
   * it also survives minification (unlike a comparison by class name).
   *
   * A subclass instance is therefore not equal to its base-class instance — if
   * a hierarchy needs a looser rule, override this method.
   */
  equals(other?: Entity<TId> | null): boolean {
    if (!other) {
      return false;
    }

    if (other === this) {
      return true;
    }

    if (other.constructor !== this.constructor) {
      return false;
    }

    return isComparable(this.identity)
      ? this.identity.equals(other.identity)
      : this.identity === other.identity;
  }
}
