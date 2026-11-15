/**
 * The Supabase client, built from the two parts the app calls: auth and PostgREST (`from`, `rpc`).
 * `createClient` from @supabase/supabase-js also builds realtime, storage and functions clients,
 * about 90 kB the app never calls (review D12, 2026-11-15). This mirrors what it does for the two
 * that are left: the same auth storage key (so nobody is signed out), the same headers, and the
 * session's token on every database request.
 */
import { AuthClient } from '@supabase/auth-js';
import { PostgrestClient } from '@supabase/postgrest-js';

export type { Session, User } from '@supabase/auth-js';

/** supabase-js's default: the project ref namespaces the session in localStorage. Never change it. */
export const authStorageKey = (url: string) => `sb-${new URL(url).hostname.split('.')[0]}-auth-token`;

export const createClient = (url: string, key: string, options: { auth: { persistSession: boolean; detectSessionInUrl: boolean; flowType: 'pkce' | 'implicit' } }) => {
  const base = url.endsWith('/') ? url : `${url}/`;
  const headers = { 'X-Client-Info': 'tigerworkouts-web' };
  const auth = new AuthClient({
    url: new URL('auth/v1', base).href,
    headers: { Authorization: `Bearer ${key}`, apikey: key, ...headers },
    storageKey: authStorageKey(url),
    autoRefreshToken: true,
    ...options.auth,
  });
  /** The signed-in user's token, else the anon key, as supabase-js sends it. */
  const authed: typeof fetch = async (input, init) => {
    const { data } = await auth.getSession();
    const h = new Headers(init?.headers);
    if (!h.has('apikey')) h.set('apikey', key);
    if (!h.has('Authorization')) h.set('Authorization', `Bearer ${data.session?.access_token ?? key}`);
    return fetch(input, { ...init, headers: h });
  };
  const rest = new PostgrestClient(new URL('rest/v1', base).href, { headers, schema: 'public', fetch: authed });
  return {
    auth,
    from: (relation: string) => rest.from(relation),
    rpc: (fn: string, args?: Record<string, unknown>) => rest.rpc(fn, args),
  };
};
