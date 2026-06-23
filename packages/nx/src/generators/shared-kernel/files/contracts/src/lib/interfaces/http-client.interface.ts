export type HttpClientOptions = {
  timeout: number;
};

export interface HttpClient {
  get<T>(url: string, options?: HttpClientOptions): Promise<T>;

  post<T, K = unknown>(
    url: string,
    data?: K,
    options?: HttpClientOptions,
  ): Promise<T>;

  put<T, K = unknown>(
    url: string,
    data?: K,
    options?: HttpClientOptions,
  ): Promise<T>;

  patch<T, K = unknown>(
    url: string,
    data?: K,
    options?: HttpClientOptions,
  ): Promise<T>;

  delete<T>(url: string, options?: HttpClientOptions): Promise<T>;
}

export const HttpClient = {
  $: Symbol.for('HttpClient'),
};
