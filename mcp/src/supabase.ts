/**
 * Supabase over plain fetch, always as the signed-in user: the anon key identifies the project and
 * the user's own access token goes in Authorization, so row-level security decides what every
 * call may read or write. There is no service-role key anywhere in this worker.
 */
import { SB_KEY, SB_URL } from '@/app/config';

export { SB_KEY, SB_URL };

/** What the worker keeps for a user, encrypted inside the OAuth grant (props). */
export interface SupabaseSession {
  userId: string;
  email?: string;
  accessToken: string;
  refreshToken: string;
  /** Unix seconds when accessToken stops working. */
  expiresAt: number;
}

type Fetch = typeof fetch;

export class SupabaseError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

const readError = async (res: Response) => {
  const text = await res.text();
  try {
    const j = JSON.parse(text) as { message?: string; msg?: string; error_description?: string; error?: string };
    return j.message ?? j.msg ?? j.error_description ?? j.error ?? text;
  } catch {
    return text || res.statusText;
  }
};

interface AuthResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  expires_at?: number;
  user: { id: string; email?: string };
}
const toSession = (r: AuthResponse): SupabaseSession => ({
  userId: r.user.id,
  email: r.user.email,
  accessToken: r.access_token,
  refreshToken: r.refresh_token,
  expiresAt: r.expires_at ?? Math.floor(Date.now() / 1000) + r.expires_in,
});

/** Sign-in and token calls against Supabase Auth (GoTrue). */
export const auth = (f: Fetch = fetch) => {
  const post = async <T>(path: string, body: unknown): Promise<T> => {
    const res = await f(`${SB_URL}/auth/v1/${path}`, { method: 'POST', headers: { apikey: SB_KEY, 'content-type': 'application/json' }, body: JSON.stringify(body) });
    if (!res.ok) throw new SupabaseError(res.status, await readError(res));
    const text = await res.text();
    return (text ? JSON.parse(text) : {}) as T;
  };
  return {
    /** Email a 6-digit code. New addresses get an account, as they do in the app. */
    sendCode: (email: string) => post<unknown>('otp', { email, create_user: true }),
    verifyCode: async (email: string, token: string) => toSession(await post<AuthResponse>('verify', { type: 'email', email, token: token.replace(/\s+/g, '') })),
    refresh: async (refreshToken: string) => toSession(await post<AuthResponse>('token?grant_type=refresh_token', { refresh_token: refreshToken })),
    /** Finish Google (PKCE): the code Supabase appended to our callback plus the verifier we kept. */
    exchangeCode: async (authCode: string, codeVerifier: string) => toSession(await post<AuthResponse>('token?grant_type=pkce', { auth_code: authCode, code_verifier: codeVerifier })),
    googleUrl: (redirectTo: string, codeChallenge: string) =>
      `${SB_URL}/auth/v1/authorize?${new URLSearchParams({ provider: 'google', redirect_to: redirectTo, code_challenge: codeChallenge, code_challenge_method: 's256' })}`,
  };
};

/** PostgREST as the user. `path` is the part after /rest/v1/, query string included. */
export interface Db {
  userId: string;
  get<T>(path: string): Promise<T>;
  post<T>(path: string, body: unknown): Promise<T>;
  patch<T>(path: string, body: unknown): Promise<T>;
}

export const db = (session: Pick<SupabaseSession, 'userId' | 'accessToken'>, f: Fetch = fetch): Db => {
  const call = async <T>(method: string, path: string, body?: unknown): Promise<T> => {
    const res = await f(`${SB_URL}/rest/v1/${path}`, {
      method,
      headers: { apikey: SB_KEY, authorization: `Bearer ${session.accessToken}`, 'content-type': 'application/json', ...(method === 'GET' ? {} : { prefer: 'return=representation' }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok) throw new SupabaseError(res.status, await readError(res));
    const text = await res.text();
    return (text ? JSON.parse(text) : null) as T;
  };
  return {
    userId: session.userId,
    get: p => call('GET', p),
    post: (p, b) => call('POST', p, b),
    patch: (p, b) => call('PATCH', p, b),
  };
};

/** PKCE S256 pair for the Google round trip. */
export const pkce = async () => {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const verifier = b64url(bytes);
  const challenge = b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
  return { verifier, challenge };
};
export const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
