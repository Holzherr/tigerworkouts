/**
 * The iPhone app opens the web coach dashboard signed in (review round 2, U7).
 *
 *   POST /web-session   Authorization: Bearer <the person's Supabase access token>
 *                       { "to": "/coach" }
 *   → { "url": "https://tigerworkouts.com/#handoff=<token_hash>&to=/coach" }
 *
 * The phone's own session cannot be handed over: its refresh token is single-use, and the web
 * spending it would sign the phone out. Instead this mints a one-time sign-in for the same account
 * (Supabase admin generate_link, type magiclink; no email is sent) and gives back its token hash.
 * The web verifies it (verifyOtp token_hash) into a session of its own. Nothing is stored.
 *
 * Needs the project's service role key as a secret (wrangler secret put SUPABASE_SERVICE_ROLE_KEY).
 * Without it the route answers 503 `not_configured` and the app opens the dashboard signed out.
 * An account with no email (anonymous) answers 409 the same way.
 */
import { SB_KEY, SB_URL } from './supabase';

export interface HandoffEnv {
  /** Secret. Only used for generate_link here. */
  SUPABASE_SERVICE_ROLE_KEY?: string;
}

type Fetch = typeof fetch;

export const isHandoffPath = (p: string) => p === '/web-session';

export const WEB = 'https://tigerworkouts.com/';
/** Web pages the app may open signed in. */
const PAGES = ['/coach'];

const json = (body: unknown, status = 200) => Response.json(body, { status });

export const handoffFetch = async (request: Request, env: HandoffEnv, f: Fetch = fetch): Promise<Response> => {
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  const bearer = request.headers.get('authorization')?.match(/^Bearer (.+)$/i)?.[1];
  if (!bearer) return json({ error: 'unauthorized' }, 401);
  const who = await f(`${SB_URL}/auth/v1/user`, { headers: { apikey: SB_KEY, authorization: `Bearer ${bearer}` } });
  if (!who.ok) return json({ error: 'unauthorized' }, 401);
  const user = (await who.json().catch(() => ({}))) as { email?: string; is_anonymous?: boolean };
  const body = (await request.json().catch(() => null)) as { to?: unknown } | null;
  const to = typeof body?.to === 'string' && PAGES.includes(body.to) ? body.to : '/coach';
  if (!env.SUPABASE_SERVICE_ROLE_KEY) return json({ error: 'not_configured' }, 503);
  if (!user.email || user.is_anonymous) return json({ error: 'no_email' }, 409);
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  const res = await f(`${SB_URL}/auth/v1/admin/generate_link`, {
    method: 'POST',
    headers: { apikey: key, authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'magiclink', email: user.email }),
  });
  const link = (await res.json().catch(() => ({}))) as { hashed_token?: string; properties?: { hashed_token?: string } };
  const hash = link.hashed_token ?? link.properties?.hashed_token;
  if (!res.ok || !hash) return json({ error: 'supabase_refused' }, 502);
  return json({ url: `${WEB}#${new URLSearchParams({ handoff: hash, to })}` });
};
