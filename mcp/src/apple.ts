/**
 * Sign in with Apple, revoked when the account is deleted (App Review guideline 5.1.1(v); Nick,
 * review D15, 15 Nov 2026).
 *
 *   POST /apple/revoke   Authorization: Bearer <the person's Supabase access token>
 *                        { "code": "<authorization code from a fresh Sign in with Apple>" }
 *
 * The iPhone app asks Apple for a fresh authorization code just before it deletes the account and
 * sends it here. This worker swaps the code for a refresh token at Apple's /auth/token and hands
 * that to /auth/revoke, which ends the app's access to the Apple ID. Nothing is stored.
 *
 * Both Apple calls need a client secret: a JWT signed with a Sign in with Apple key. Until the
 * four values below are set the route answers 503 `not_configured` and the app deletes the
 * account without it:
 *   APPLE_TEAM_ID      the developer team id (var)
 *   APPLE_CLIENT_ID    the app's bundle id (var)
 *   APPLE_KEY_ID       the key's id (var)
 *   APPLE_PRIVATE_KEY  the key's .p8 contents (secret: wrangler secret put APPLE_PRIVATE_KEY)
 */
import { b64url, SB_KEY, SB_URL } from './supabase';

export interface AppleEnv {
  APPLE_TEAM_ID?: string;
  APPLE_CLIENT_ID?: string;
  APPLE_KEY_ID?: string;
  /** Secret. The PEM text of the .p8 key, header and footer lines included or not. */
  APPLE_PRIVATE_KEY?: string;
}

type Fetch = typeof fetch;

export const APPLE = 'https://appleid.apple.com';
export const isApplePath = (p: string) => p === '/apple/revoke';

const configured = (env: AppleEnv): env is Required<AppleEnv> => !!(env.APPLE_TEAM_ID && env.APPLE_CLIENT_ID && env.APPLE_KEY_ID && env.APPLE_PRIVATE_KEY);

const text = (s: string) => new TextEncoder().encode(s);

/** The .p8 as WebCrypto wants it: the base64 between the PEM lines, as bytes. */
const pkcs8 = (pem: string) => Uint8Array.from(atob(pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '')), c => c.charCodeAt(0));

/**
 * Apple's client secret: an ES256 JWT from the team, for the app, good for five minutes.
 * https://developer.apple.com/documentation/accountorganizationaldatasharing/creating-a-client-secret
 */
export const clientSecret = async (env: Required<AppleEnv>, now = Date.now()) => {
  const header = b64url(text(JSON.stringify({ alg: 'ES256', kid: env.APPLE_KEY_ID })));
  const iat = Math.floor(now / 1000);
  const claims = b64url(text(JSON.stringify({ iss: env.APPLE_TEAM_ID, iat, exp: iat + 300, aud: APPLE, sub: env.APPLE_CLIENT_ID })));
  const key = await crypto.subtle.importKey('pkcs8', pkcs8(env.APPLE_PRIVATE_KEY), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, text(`${header}.${claims}`));
  return `${header}.${claims}.${b64url(new Uint8Array(signature))}`;
};

const form = (f: Fetch, path: string, fields: Record<string, string>) =>
  f(`${APPLE}${path}`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(fields).toString() });

/** Swap the authorization code for a refresh token, then revoke it. Throws with Apple's reason. */
export const revoke = async (env: Required<AppleEnv>, code: string, f: Fetch = fetch) => {
  const secret = await clientSecret(env);
  const id = { client_id: env.APPLE_CLIENT_ID, client_secret: secret };
  const swapped = await form(f, '/auth/token', { ...id, grant_type: 'authorization_code', code });
  const tokens = (await swapped.json().catch(() => ({}))) as { refresh_token?: string; access_token?: string; error?: string };
  const token = tokens.refresh_token ?? tokens.access_token;
  if (!swapped.ok || !token) throw new Error(`Apple did not take the code (${tokens.error ?? swapped.status})`);
  const revoked = await form(f, '/auth/revoke', { ...id, token, token_type_hint: tokens.refresh_token ? 'refresh_token' : 'access_token' });
  if (!revoked.ok) throw new Error(`Apple did not revoke the token (${revoked.status})`);
};

const json = (body: unknown, status = 200) => Response.json(body, { status });

/** Only a signed-in TigerWorkouts account may ask: the bearer is checked with Supabase. */
const signedIn = async (request: Request, f: Fetch) => {
  const bearer = request.headers.get('authorization')?.match(/^Bearer (.+)$/i)?.[1];
  if (!bearer) return false;
  const res = await f(`${SB_URL}/auth/v1/user`, { headers: { apikey: SB_KEY, authorization: `Bearer ${bearer}` } });
  return res.ok;
};

export const appleFetch = async (request: Request, env: AppleEnv, f: Fetch = fetch): Promise<Response> => {
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  if (!(await signedIn(request, f))) return json({ error: 'unauthorized' }, 401);
  if (!configured(env)) return json({ error: 'not_configured' }, 503);
  const body = (await request.json().catch(() => null)) as { code?: unknown } | null;
  const code = typeof body?.code === 'string' ? body.code.trim() : '';
  if (!code || code.length > 2048) return json({ error: 'invalid_request', error_description: 'code is required' }, 400);
  try {
    await revoke(env, code, f);
    return json({ revoked: true });
  } catch (e) {
    return json({ error: 'apple_refused', error_description: e instanceof Error ? e.message : String(e) }, 502);
  }
};
