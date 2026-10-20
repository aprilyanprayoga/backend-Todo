import { vi } from 'vitest';

export const USER_A = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', email: 'a@example.com' };
export const USER_B = { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', email: 'b@example.com' };

/** Peta token -> user, dipakai mock auth.getUser. */
export const tokens: Record<string, { id: string; email: string }> = {
  'token-a': USER_A,
  'token-b': USER_B,
};

export const getUserMock = vi.fn(async (token: string) => {
  if (token === 'expired-token') {
    return { data: { user: null }, error: { name: 'AuthApiError', status: 401, message: 'invalid JWT: token is expired' } };
  }
  const u = tokens[token];
  if (!u) {
    return { data: { user: null }, error: { name: 'AuthApiError', status: 401, message: 'invalid JWT: unable to parse' } };
  }
  return {
    data: { user: { ...u, created_at: '2026-01-01T00:00:00Z', last_sign_in_at: null, user_metadata: {} } },
    error: null,
  };
});

/** Query builder palsu: mencatat semua pemanggilan method dan bisa di-await. */
export function makeBuilder(result: unknown) {
  const calls: Array<[string, unknown[]]> = [];
  const proxy: unknown = new Proxy(
    {},
    {
      get(_t, prop: string) {
        if (prop === 'then') {
          return (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
            Promise.resolve(result).then(resolve, reject);
        }
        return (...args: unknown[]) => {
          calls.push([prop, args]);
          return proxy;
        };
      },
    },
  );
  return { builder: proxy, calls };
}
