export interface Store {
  set<T>(key: string, value: T): Promise<boolean>;

  get<T>(key: string): Promise<T | null>;

  delete(service: string): Promise<boolean>;
}

export const Store = {
  $: Symbol.for('Store'),
};
