import { Entity } from './entity.js';

class Account extends Entity {
  constructor(
    sub: string,
    readonly attempts = 0,
  ) {
    super(sub);
  }

  registerFailure(): Account {
    return new Account(this.id, this.attempts + 1);
  }
}

/** Same shape, different type: must never be equal to an `Account`. */
class Device extends Entity {
  constructor(id: string) {
    super(id);
  }
}

class PremiumAccount extends Account {}

/** Value-object identity: compares by value, not by reference. */
class AccountNumber {
  constructor(private readonly value: string) {}

  equals(other: unknown): boolean {
    return other instanceof AccountNumber && other.value === this.value;
  }
}

class Wallet extends Entity<AccountNumber> {
  constructor(number: AccountNumber) {
    super(number);
  }
}

describe('Entity.id', () => {
  it('exposes the identity it was created with', () => {
    expect(new Account('user-1').id).toBe('user-1');
  });
});

describe('Entity.equals', () => {
  it('is true for the same instance', () => {
    const account = new Account('user-1');

    expect(account.equals(account)).toBe(true);
  });

  it('is true across state changes: identity outlives the state', () => {
    const account = new Account('user-1');

    const failed = account.registerFailure();

    expect(failed.equals(account)).toBe(true);
    expect(failed.attempts).not.toBe(account.attempts);
  });

  it('is false for another identity of the same type', () => {
    expect(new Account('user-1').equals(new Account('user-2'))).toBe(false);
  });

  it('is false for a different entity type with the same id', () => {
    expect(new Account('shared-id').equals(new Device('shared-id'))).toBe(
      false,
    );
  });

  it('is false for a subclass instance unless the rule is overridden', () => {
    expect(new Account('user-1').equals(new PremiumAccount('user-1'))).toBe(
      false,
    );
  });

  it('is false for a missing counterpart', () => {
    const account = new Account('user-1');

    expect(account.equals(undefined)).toBe(false);
    expect(account.equals(null)).toBe(false);
  });

  it('delegates to a value-object identity instead of comparing references', () => {
    const wallet = new Wallet(new AccountNumber('42'));
    const same = new Wallet(new AccountNumber('42'));
    const other = new Wallet(new AccountNumber('43'));

    expect(wallet.equals(same)).toBe(true);
    expect(wallet.equals(other)).toBe(false);
  });
});
