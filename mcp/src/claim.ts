/**
 * Claiming an anonymous account (Neon-style): the same Supabase user gets an email, so everything
 * made in the chat stays where it is and the person signs in to the app with that email.
 *
 * Two ways in, both ending in Supabase's own email change on the anonymous user:
 *  - claim_account with an email: done in the chat.
 *  - claim_account without one: a short-lived link to /claim/<id> on this worker, where the person
 *    types the email themselves (it never passes through the assistant).
 *
 * The link's KV entry holds the user's current access token (never the refresh token: using that
 * here would rotate it under the grant and end the connection), so it lives no longer than the
 * token does, at most an hour.
 */
import { auth, b64url, SupabaseError, type SupabaseSession } from './supabase';
import { ToolError } from './tools';

type Fetch = typeof fetch;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const EMAIL_TAKEN =
  'That email already has a TigerWorkouts account. Workouts made here cannot be merged into it yet: keep using this connection as it is, or remove the connector, add it again and sign in with that email.';

export interface ClaimResult {
  status: 'claimed' | 'confirm';
  email: string;
  next: string;
}

/** Put the email on the user. Supabase either sets it (auto-confirm) or emails a confirmation link. */
export const sendClaim = async (accessToken: string, rawEmail: string, f: Fetch = fetch): Promise<ClaimResult> => {
  const email = rawEmail.trim().toLowerCase();
  if (!EMAIL_RE.test(email)) throw new ToolError('That email does not look right.');
  let user;
  try {
    user = await auth(f).requestEmail(accessToken, email);
  } catch (e) {
    if (e instanceof SupabaseError && (e.status === 422 || /already|exists|registered/i.test(e.message))) throw new ToolError(EMAIL_TAKEN);
    if (e instanceof SupabaseError && e.status === 429) throw new ToolError('Too many emails asked for. Wait a minute and try again.');
    throw e;
  }
  if (user.email?.toLowerCase() === email)
    return { status: 'claimed', email, next: `Done. Sign in to the TigerWorkouts app with ${email} (email code) to see these workouts there.` };
  return { status: 'confirm', email, next: `Supabase sent a confirmation link to ${email}. Once it is clicked, sign in to the TigerWorkouts app with that email to see these workouts there.` };
};

interface Pending {
  userId: string;
  accessToken: string;
}
const KEY = (id: string) => `claim:${id}`;
const LINK_MAX_SEC = 3600;

export const claimAccount = async (d: { session: SupabaseSession; origin: string; kv: KVNamespace; fetch?: Fetch }, a: { email?: string }, now = Date.now() / 1000) => {
  if (!d.session.anonymous)
    return { status: 'already-claimed' as const, email: d.session.email, next: 'This connection is already a TigerWorkouts account. Sign in to the app with the same email to see the workouts.' };
  if (a.email) return sendClaim(d.session.accessToken, a.email, d.fetch);
  const ttl = Math.min(LINK_MAX_SEC, Math.floor(d.session.expiresAt - now - 30));
  if (ttl < 60) throw new ToolError('Try again in a minute (the sign-in is being renewed).');
  const id = b64url(crypto.getRandomValues(new Uint8Array(24)));
  await d.kv.put(KEY(id), JSON.stringify({ userId: d.session.userId, accessToken: d.session.accessToken } satisfies Pending), { expirationTtl: ttl });
  return { status: 'link' as const, claimUrl: `${d.origin}/claim/${id}`, expiresInMinutes: Math.floor(ttl / 60), next: 'Give the person claimUrl. They type their email there; their workouts stay in this account.' };
};

export const readClaim = async (kv: KVNamespace, id: string): Promise<Pending | null> => (/^[\w-]{20,64}$/.test(id) ? ((await kv.get(KEY(id), 'json')) as Pending | null) : null);
export const dropClaim = (kv: KVNamespace, id: string) => kv.delete(KEY(id));
