import { ComponentType, PropsWithChildren, FC, ReactNode } from 'react';

interface Provider<TProps> {
  Component: ComponentType<PropsWithChildren<TProps>>;
  props?: Omit<TProps, 'children'>;
}

export const createComposeProviders = <TProviders extends Array<Provider<any>>>(
  providers: TProviders,
): ComponentType<PropsWithChildren> => {
  const ProviderComponent: FC<PropsWithChildren> = ({ children }) => {
    return providers.reduceRight<ReactNode>(
      (prevJSX, { Component: CurrentProvider, props = {} }) => {
        return <CurrentProvider {...props}>{prevJSX}</CurrentProvider>;
      },
      children,
    );
  };

  return ProviderComponent;
};

export const createProvider = <TProps extends object>(
  Component: ComponentType<PropsWithChildren<TProps>>,
  props?: Omit<TProps, 'children'>,
): Provider<TProps> => {
  return { Component, props };
};
