/** Who may connect, and how long a client token lives. Kept apart from index.ts so tests can load it. */
import type { SupabaseSession } from './supabase';

export interface AccessEnv {
  ALLOWED_USER_IDS?: string;
  ANONYMOUS_SIGNUP?: string;
}

/** "Start without an account" is offered (needs anonymous sign-ins on in Supabase). */
export const anonymousOn = (env: AccessEnv) => env.ANONYMOUS_SIGNUP === 'true';

/**
 * ALLOWED_USER_IDS: comma-separated Supabase user ids. Empty = every TigerWorkouts account (public).
 * A connection that started anonymously is let in by ANONYMOUS_SIGNUP instead, before and after it
 * is claimed; turning that off cuts those connections off at their next call or refresh.
 */
export const allowed = (env: AccessEnv, who: { userId: string; viaAnonymous?: boolean }) => {
  if (who.viaAnonymous) return anonymousOn(env);
  const list = (env.ALLOWED_USER_IDS ?? '').split(/[\s,]+/).filter(Boolean);
  return list.length === 0 || list.includes(who.userId);
};

/** Seconds the client's access token may live: until shortly before the Supabase token expires. */
export const ttlFor = (s: Pick<SupabaseSession, 'expiresAt'>, now = Date.now() / 1000) => Math.max(60, Math.floor(s.expiresAt - now - 120));

