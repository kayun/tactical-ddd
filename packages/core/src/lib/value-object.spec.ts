import { ValueObject } from './value-object.js';

class Pin extends ValueObject {
  constructor(readonly value: string) {
    super();
  }

  /** Derived, not an attribute: must not take part in equality. */
  get length(): number {
    return this.value.length;
  }
}

/** Same shape, different meaning: never equal to a `Pin`. */
class Otp extends ValueObject {
  constructor(readonly value: string) {
    super();
  }
}

class Money extends ValueObject {
  constructor(
    readonly amount: number,
    readonly currency: string,
  ) {
    super();
  }
}

class Price extends ValueObject {
  constructor(readonly net: Money) {
    super();
  }
}

class Period extends ValueObject {
  constructor(readonly from: Date) {
    super();
  }
}

class Scopes extends ValueObject {
  constructor(readonly values: string[]) {
    super();
  }
}

class Profile extends ValueObject {
  constructor(
    readonly name: string,
    readonly email?: string,
  ) {
    super();
  }
}

describe('ValueObject.equals', () => {
  it('is true for equal attributes', () => {
    expect(new Pin('1234').equals(new Pin('1234'))).toBe(true);
    expect(new Money(10, 'EUR').equals(new Money(10, 'EUR'))).toBe(true);
  });

  it('is false when any attribute differs', () => {
    expect(new Pin('1234').equals(new Pin('4321'))).toBe(false);
    expect(new Money(10, 'EUR').equals(new Money(10, 'USD'))).toBe(false);
  });

  it('is false for a different type with identical attributes', () => {
    expect(new Pin('1234').equals(new Otp('1234'))).toBe(false);
  });

  it('is false for a missing counterpart', () => {
    expect(new Pin('1234').equals(undefined)).toBe(false);
    expect(new Pin('1234').equals(null)).toBe(false);
  });

  it('asks nested value objects to compare themselves', () => {
    const price = new Price(new Money(10, 'EUR'));

    expect(price.equals(new Price(new Money(10, 'EUR')))).toBe(true);
    expect(price.equals(new Price(new Money(11, 'EUR')))).toBe(false);
  });

  it('compares dates by value, not by reference', () => {
    const period = new Period(new Date('2026-01-01'));

    expect(period.equals(new Period(new Date('2026-01-01')))).toBe(true);
    expect(period.equals(new Period(new Date('2026-01-02')))).toBe(false);
  });

  it('compares arrays element by element', () => {
    const scopes = new Scopes(['openid', 'email']);

    expect(scopes.equals(new Scopes(['openid', 'email']))).toBe(true);
    expect(scopes.equals(new Scopes(['email', 'openid']))).toBe(false);
    expect(scopes.equals(new Scopes(['openid']))).toBe(false);
  });

  it('treats an absent optional attribute as different from a present one', () => {
    expect(new Profile('Alice').equals(new Profile('Alice'))).toBe(true);
    expect(new Profile('Alice').equals(new Profile('Alice', 'a@b.com'))).toBe(
      false,
    );
  });

  it('ignores derived getters: they are not attributes', () => {
    const pin = new Pin('1234');

    // Тот же результат, что и без геттера — он живёт на прототипе.
    expect(pin.length).toBe(4);
    expect(pin.equals(new Pin('1234'))).toBe(true);
  });
});
