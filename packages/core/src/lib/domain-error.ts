/**
 * Domain invariant violation — unlike infrastructure failures (keychain,
 * network, database), this always represents "this operation is not allowed"
 * rather than "the operation failed right now".
 * Allows the caller to distinguish between the two with a single `instanceof` check.
 *
 * The name is set via string rather than `new.target.name`: class names are
 * minified in production builds.
 */
export abstract class DomainError extends Error {
  protected constructor(name: string, message: string) {
    super(message);
    this.name = name;
    // Required if the class is transpiled to ES5: otherwise `instanceof` breaks.
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
