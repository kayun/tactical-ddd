/**
 * One remote read or write, answered once. One implementation is one endpoint,
 * and `resolve` is its only public method: what goes in is the input the
 * endpoint needs, what comes out is the shape the domain wants, and a failure
 * is reported by rejecting.
 *
 * A resolver holds no state and keeps no cache. Freshness — whether a value is
 * stale, whether a refresh is in flight — belongs to the port that reads the
 * result and publishes it as a watch; a resolver that must be cached is wrapped
 * in a decorator that implements the same `resolve`.
 *
 * ```ts
 * // application — the port, named for the call it makes
 * export type FindAccountPort = Resolver<string, Account>;
 * export const FindAccountPort = { $: Symbol.for('accounts/FindAccountPort') };
 *
 * // infrastructure — the adapter
 * export class FindAccountResolver extends HttpResolver<string, Account, AccountDto> {
 *   protected readonly method = HttpMethod.Get;
 *   protected url(id: string): string {
 *     return `/accounts/${id}`;
 *   }
 *   protected map(dto: AccountDto): Account {
 *     return Account.fromDto(dto);
 *   }
 * }
 * ```
 */
export interface Resolver<TInput, TOutput> {
  resolve(input: TInput): Promise<TOutput>;
}

/** The verbs a resolver may use; a string enum so a request can be logged as is. */
export enum HttpMethod {
  Get = 'GET',
  Post = 'POST',
  Put = 'PUT',
  Patch = 'PATCH',
  Delete = 'DELETE',
}

/** A query string before it is one: `undefined` entries are dropped, the rest are stringified. */
export type HttpQuery = Readonly<
  Record<string, string | number | boolean | undefined>
>;

/**
 * What a resolver hands to the transport. Everything here is about *this*
 * endpoint: its verb, its path, the query it filters by, the headers only it
 * needs (`Idempotency-Key`, `If-None-Match`), its body. What applies to every
 * request the same way — credentials, retries, a language header — is the
 * transport's business and never appears here.
 *
 * `meta` is not sent. It is a bag of flags the transport's interceptors read —
 * "skip the session header on this one", "already retried" — so an endpoint
 * can opt out of a policy without the policy knowing the endpoint.
 */
export type HttpRequest = Readonly<{
  method: HttpMethod;
  url: string;
  query?: HttpQuery;
  headers?: Readonly<Record<string, string>>;
  body?: unknown;
  meta?: Readonly<Record<string, unknown>>;
}>;

/**
 * The driven port a resolver speaks to. An adapter wraps whatever the platform
 * has — `fetch`, axios, the workspace's own HTTP client — and is bound once at
 * the composition root.
 */
export interface HttpTransport {
  send<TResponse>(request: HttpRequest): Promise<TResponse>;
}

/**
 * A resolver over HTTP. A subclass declares the endpoint — its method, its url
 * and, for a write, its body — and how the wire shape becomes the domain
 * shape. Everything else is fixed here, so two resolvers differ only in what
 * makes their endpoints different.
 *
 * `TResponse` is the shape the server sends. It defaults to `TOutput`, which is
 * right whenever the wire shape is already the domain shape; when it is not,
 * name both and override `map`.
 *
 * Transport failures are not caught. Which of them mean "wrong password" and
 * which mean "try later" is a decision for the use case that called `resolve`,
 * not for the class that knows only the url.
 */
export abstract class HttpResolver<
  TInput,
  TOutput,
  TResponse = TOutput,
> implements Resolver<TInput, TOutput> {
  /** The verb of this endpoint; a field rather than an argument, because an endpoint has exactly one. */
  protected abstract readonly method: HttpMethod;

  constructor(protected readonly transport: HttpTransport) {}

  /** The url of this endpoint, built from the input when the path carries part of it. */
  protected abstract url(input: TInput): string;

  /** The query string. Nothing by default. */
  protected query(input: TInput): HttpQuery | undefined {
    void input;

    return undefined;
  }

  /** Headers only this endpoint needs. Nothing by default: the transport adds the common ones. */
  protected headers(
    input: TInput,
  ): Readonly<Record<string, string>> | undefined {
    void input;

    return undefined;
  }

  /** The request body. Nothing by default: a read has none, a write overrides. */
  protected body(input: TInput): unknown {
    void input;

    return undefined;
  }

  /** Flags for the transport's interceptors. Nothing by default. */
  protected meta(input: TInput): Readonly<Record<string, unknown>> | undefined {
    void input;

    return undefined;
  }

  /** The wire shape into the domain shape. Identity by default. */
  protected map(response: TResponse, input: TInput): TOutput {
    void input;

    return response as unknown as TOutput;
  }

  async resolve(input: TInput): Promise<TOutput> {
    const response = await this.transport.send<TResponse>({
      method: this.method,
      url: this.url(input),
      query: this.query(input),
      headers: this.headers(input),
      body: this.body(input),
      meta: this.meta(input),
    });

    return this.map(response, input);
  }
}
