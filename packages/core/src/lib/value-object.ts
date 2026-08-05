/** Anything that knows how to compare itself by value. */
interface SelfComparable {
  equals(other: unknown): boolean;
}

function isSelfComparable(value: unknown): value is SelfComparable {
  return (
    typeof value === 'object' &&
    value !== null &&
    'equals' in value &&
    typeof (value as SelfComparable).equals === 'function'
  );
}

/**
 * Structural comparison used for value-object attributes. Nested values that
 * know how to compare themselves (other value objects) are asked first, so a
 * value object composed of value objects compares correctly.
 */
function attributesEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) {
    return true;
  }

  if (isSelfComparable(a)) {
    return a.equals(b);
  }

  if (a instanceof Date || b instanceof Date) {
    return (
      a instanceof Date && b instanceof Date && a.getTime() === b.getTime()
    );
  }

  if (Array.isArray(a) || Array.isArray(b)) {
    return (
      Array.isArray(a) &&
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((item, index) => attributesEqual(item, b[index]))
    );
  }

  if (
    typeof a !== 'object' ||
    typeof b !== 'object' ||
    a === null ||
    b === null
  ) {
    return false;
  }

  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  const keys = Object.keys(left);

  return (
    keys.length === Object.keys(right).length &&
    keys.every((key) => key in right && attributesEqual(left[key], right[key]))
  );
}

/**
 * Domain value object: an object defined by its attributes and nothing else.
 * Two value objects of the same type with equal attributes are interchangeable
 * — that is what separates them from entities, which stay themselves across
 * attribute changes.
 *
 * Equality walks the instance's **own** properties, so the idiomatic style —
 * `readonly` constructor parameters — works as is; values that implement their
 * own `equals` (nested value objects) are asked instead of compared field by
 * field. Getters live on the prototype and are correctly left out: they are
 * derived from the attributes, not part of them.
 *
 * Value objects are expected to be immutable: create a new instance instead of
 * mutating one, otherwise equality silently changes meaning over time.
 *
 * @example
 * ```ts
 * class Pin extends ValueObject {
 *   private constructor(readonly value: string) {
 *     super();
 *   }
 *
 *   static create(raw: string): Pin {
 *     if (!/^\d{4,}$/.test(raw)) {
 *       throw new Error('PIN must be at least four digits');
 *     }
 *
 *     return new Pin(raw);
 *   }
 * }
 *
 * Pin.create('1234').equals(Pin.create('1234')); // true
 * ```
 */
export abstract class ValueObject {
  /**
   * Attribute comparison. Value objects of different concrete classes are never
   * equal, even with identical attributes: the check uses constructor identity,
   * so it also survives minification (unlike a comparison by class name).
   */
  equals(other?: ValueObject | null): boolean {
    if (!other) {
      return false;
    }

    if (other === this) {
      return true;
    }

    if (other.constructor !== this.constructor) {
      return false;
    }

    return attributesEqual({ ...this }, { ...other });
  }
}
