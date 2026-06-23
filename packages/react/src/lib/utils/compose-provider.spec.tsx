import {
  ComponentType,
  PropsWithChildren,
  createContext,
  useContext,
} from 'react';
import { render, screen } from '@testing-library/react';

import { createComposeProviders, createProvider } from './compose-provider';

describe('createProvider', () => {
  it('returns an object with the given Component and props', () => {
    const Component: ComponentType<PropsWithChildren> = ({ children }) =>
      children;
    const props = { value: 'test' };

    const provider = createProvider(Component, props);

    expect(provider).toEqual({ Component, props });
  });

  it('returns an object with undefined props when none are provided', () => {
    const Component: ComponentType<PropsWithChildren> = ({ children }) =>
      children;

    const provider = createProvider(Component);

    expect(provider).toEqual({ Component, props: undefined });
  });
});

describe('createComposeProviders', () => {
  it('renders children when no providers are given', () => {
    const Composed = createComposeProviders([]);

    render(
      <Composed>
        <span>child content</span>
      </Composed>,
    );

    expect(screen.getByText('child content')).toBeTruthy();
  });

  it('renders children wrapped by a single provider', () => {
    const PassThrough: ComponentType<PropsWithChildren> = ({ children }) =>
      children;

    const Composed = createComposeProviders([createProvider(PassThrough)]);

    render(
      <Composed>
        <span>wrapped child</span>
      </Composed>,
    );

    expect(screen.getByText('wrapped child')).toBeTruthy();
  });

  it('passes props to each provider component', () => {
    const ValueContext = createContext<string | undefined>(undefined);

    const ValueProvider: ComponentType<
      PropsWithChildren<{ value: string }>
    > = ({ value, children }) => (
      <ValueContext.Provider value={value}>{children}</ValueContext.Provider>
    );

    const Consumer = () => {
      const value = useContext(ValueContext);

      return <span>{value}</span>;
    };

    const Composed = createComposeProviders([
      createProvider(ValueProvider, { value: 'provided value' }),
    ]);

    render(
      <Composed>
        <Consumer />
      </Composed>,
    );

    expect(screen.getByText('provided value')).toBeTruthy();
  });

  it('nests multiple providers from outermost (first) to innermost (last)', () => {
    const order: string[] = [];

    const makeProvider = (name: string): ComponentType<PropsWithChildren> => {
      const Provider: ComponentType<PropsWithChildren> = ({ children }) => {
        order.push(name);

        return children;
      };

      return Provider;
    };

    const Composed = createComposeProviders([
      createProvider(makeProvider('outer')),
      createProvider(makeProvider('middle')),
      createProvider(makeProvider('inner')),
    ]);

    render(
      <Composed>
        <span>deeply nested</span>
      </Composed>,
    );

    expect(screen.getByText('deeply nested')).toBeTruthy();
    // React renders parents before children, so the first provider in the
    // array (outermost wrapper) renders first.
    expect(order).toEqual(['outer', 'middle', 'inner']);
  });

  it('makes the value of an outer provider available to an inner one', () => {
    const OuterContext = createContext('default');

    const OuterProvider: ComponentType<
      PropsWithChildren<{ value: string }>
    > = ({ value, children }) => (
      <OuterContext.Provider value={value}>{children}</OuterContext.Provider>
    );

    const InnerProvider: ComponentType<PropsWithChildren> = () => {
      const outerValue = useContext(OuterContext);

      return <span>inner sees: {outerValue}</span>;
    };

    const Composed = createComposeProviders([
      createProvider(OuterProvider, { value: 'from outer' }),
      createProvider(InnerProvider),
    ]);

    render(
      <Composed>
        <span>children</span>
      </Composed>,
    );

    expect(screen.getByText('inner sees: from outer')).toBeTruthy();
  });

  it('renders children even when a provider defines no props', () => {
    const NoPropsProvider: ComponentType<PropsWithChildren> = ({ children }) =>
      children;

    // Build the provider descriptor without props to exercise the default `{}`.
    const Composed = createComposeProviders([{ Component: NoPropsProvider }]);

    render(
      <Composed>
        <span>no props content</span>
      </Composed>,
    );

    expect(screen.getByText('no props content')).toBeTruthy();
  });
});
