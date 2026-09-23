/** Who may connect, and how long a client token lives. Kept apart from index.ts so tests can load it. */
import type { SupabaseSession } from './supabase';

/** ALLOWED_USER_IDS: comma-separated Supabase user ids. Empty = every TigerWorkouts account (public). */
export const allowed = (env: { ALLOWED_USER_IDS?: string }, userId: string) => {
  const list = (env.ALLOWED_USER_IDS ?? '').split(/[\s,]+/).filter(Boolean);
  return list.length === 0 || list.includes(userId);
};

/** Seconds the client's access token may live: until shortly before the Supabase token expires. */
export const ttlFor = (s: Pick<SupabaseSession, 'expiresAt'>, now = Date.now() / 1000) => Math.max(60, Math.floor(s.expiresAt - now - 120));

