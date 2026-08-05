import { DomainError } from './domain-error.js';

class InvalidPinError extends DomainError {
  constructor(message: string) {
    super('InvalidPinError', message);
  }
}

class InvalidPinPolicyError extends DomainError {
  constructor(message: string) {
    super('InvalidPinPolicyError', message);
  }
}

class InvalidPinEnvelopeError extends DomainError {
  constructor(message: string) {
    super('InvalidPinEnvelopeError', message);
  }
}

class InvalidUserIdentityError extends DomainError {
  constructor(message: string) {
    super('InvalidUserIdentityError', message);
  }
}

describe('DomainError', () => {
  it('carries the message and a name that survives minification', () => {
    const error = new InvalidPinPolicyError('minLength must be positive');

    expect(error.message).toBe('minLength must be positive');
    expect(error.name).toBe('InvalidPinPolicyError');
  });

  it.each([
    ['InvalidPinError', new InvalidPinError('nope')],
    ['InvalidPinPolicyError', new InvalidPinPolicyError('nope')],
    ['InvalidPinEnvelopeError', new InvalidPinEnvelopeError('nope')],
    ['InvalidUserIdentityError', new InvalidUserIdentityError('nope')],
  ])(
    '%s is recognisable as a domain violation, not an infrastructure failure',
    (_name, error) => {
      expect(error).toBeInstanceOf(DomainError);
      expect(error).toBeInstanceOf(Error);
    },
  );
});
