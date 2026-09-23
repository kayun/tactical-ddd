import {
  HttpMethod,
  type HttpQuery,
  HttpResolver,
  type HttpRequest,
  type HttpTransport,
  type Resolver,
} from './resolver.js';

type AccountDto = Readonly<{ id: string; display_name: string }>;
type Account = Readonly<{ id: string; name: string }>;
type Credentials = Readonly<{ username: string; password: string }>;
type TokenSet = Readonly<{ access: string; refresh: string }>;
type AccountFilter = Readonly<{ status: 'active' | 'closed'; page?: number }>;

/** A transport that records what it was asked and answers what it was told. */
const makeTransport = (
  answer: unknown | Error,
): HttpTransport & { requests: HttpRequest[] } => {
  const requests: HttpRequest[] = [];

  return {
    requests,
    send: <TResponse>(request: HttpRequest) => {
      requests.push(request);

      return answer instanceof Error
        ? Promise.reject(answer)
        : Promise.resolve(answer as TResponse);
    },
  };
};

/** A read: the path carries the input, the wire shape differs from the domain's. */
class FindAccountResolver extends HttpResolver<string, Account, AccountDto> {
  protected readonly method = HttpMethod.Get;

  protected url(id: string): string {
    return `/accounts/${id}`;
  }

  protected override map(dto: AccountDto): Account {
    return { id: dto.id, name: dto.display_name };
  }
}

/** A write: a fixed url, the input travels as the body, the wire shape is kept. */
class SignInResolver extends HttpResolver<Credentials, TokenSet> {
  protected readonly method = HttpMethod.Post;

  protected url(): string {
    return '/auth/signin';
  }

  protected override body(credentials: Credentials): unknown {
    return credentials;
  }
}

/** A list: the input becomes the query, one header and one flag belong to this endpoint only. */
class ListAccountsResolver extends HttpResolver<AccountFilter, Account[]> {
  protected readonly method = HttpMethod.Get;

  protected url(): string {
    return '/accounts';
  }

  protected override query(filter: AccountFilter): HttpQuery {
    return { status: filter.status, page: filter.page };
  }

  protected override headers(): Readonly<Record<string, string>> {
    return { 'If-None-Match': '"etag"' };
  }

  protected override meta(): Readonly<Record<string, unknown>> {
    return { skipAuth: true };
  }
}

/** A write with nothing to say back: `void` in, the response is dropped. */
class SignOutResolver extends HttpResolver<void, void, { success: true }> {
  protected readonly method = HttpMethod.Post;

  protected url(): string {
    return '/auth/signout';
  }

  protected override map(): void {
    return undefined;
  }
}

describe('HttpResolver', () => {
  it('sends the declared method and the url built from the input', async () => {
    const transport = makeTransport({ id: '42', display_name: 'Ada' });
    const resolver = new FindAccountResolver(transport);

    await resolver.resolve('42');

    expect(transport.requests).toEqual([
      { method: HttpMethod.Get, url: '/accounts/42', body: undefined },
    ]);
  });

  it('maps the wire shape into the domain shape', async () => {
    const resolver = new FindAccountResolver(
      makeTransport({ id: '42', display_name: 'Ada' }),
    );

    await expect(resolver.resolve('42')).resolves.toEqual({
      id: '42',
      name: 'Ada',
    });
  });

  it('sends the body a write declares and keeps the response as is by default', async () => {
    const tokens: TokenSet = { access: 'a', refresh: 'r' };
    const transport = makeTransport(tokens);
    const resolver = new SignInResolver(transport);

    const result = await resolver.resolve({ username: 'ada', password: 'pw' });

    expect(transport.requests[0]).toEqual({
      method: HttpMethod.Post,
      url: '/auth/signin',
      body: { username: 'ada', password: 'pw' },
    });
    expect(result).toBe(tokens);
  });

  it('accepts a void input and a void output', async () => {
    const transport = makeTransport({ success: true });
    const resolver = new SignOutResolver(transport);

    await expect(resolver.resolve()).resolves.toBeUndefined();
    expect(transport.requests[0]).toEqual({
      method: HttpMethod.Post,
      url: '/auth/signout',
      body: undefined,
    });
  });

  it('hands query, endpoint headers and interceptor flags to the transport', async () => {
    const transport = makeTransport([]);
    const resolver = new ListAccountsResolver(transport);

    await resolver.resolve({ status: 'active' });

    expect(transport.requests[0]).toEqual({
      method: HttpMethod.Get,
      url: '/accounts',
      query: { status: 'active', page: undefined },
      headers: { 'If-None-Match': '"etag"' },
      body: undefined,
      meta: { skipAuth: true },
    });
  });

  it('sends nothing but method and url when a resolver declares nothing else', async () => {
    const transport = makeTransport({ success: true });

    await new SignOutResolver(transport).resolve();

    const request = transport.requests[0];
    expect(request.query).toBeUndefined();
    expect(request.headers).toBeUndefined();
    expect(request.meta).toBeUndefined();
  });

  it('lets a transport failure through untouched', async () => {
    const failure = new Error('401');
    const resolver = new SignInResolver(makeTransport(failure));

    await expect(
      resolver.resolve({ username: 'ada', password: 'wrong' }),
    ).rejects.toBe(failure);
  });

  it('is a Resolver, so a port may be declared without naming the transport', () => {
    const port: Resolver<string, Account> = new FindAccountResolver(
      makeTransport({ id: '1', display_name: 'x' }),
    );

    expect(typeof port.resolve).toBe('function');
  });
});
