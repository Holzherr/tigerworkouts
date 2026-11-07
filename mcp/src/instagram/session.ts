/**
 * The bot writes as the import owner (Nick's admin account), through row-level security like every
 * other call in this worker: no service-role key. The owner signs in once at /bot/connect (email
 * code, as when connecting Claude); that Supabase session lives in KV and is refreshed here.
 */
import { auth, db, SupabaseError, type Db, type SupabaseSession } from '../supabase';

export const SESSION_KEY = 'bot:session';
type Fetch = typeof fetch;

/** The owner's Db, or null when nobody connected the bot or the session has ended. */
export const botDb = async (kv: KVNamespace, f: Fetch = fetch, now = () => Date.now() / 1000): Promise<Db | null> => {
  const s = (await kv.get(SESSION_KEY, 'json')) as SupabaseSession | null;
  if (!s) return null;
  if (s.expiresAt - now() > 300) return db(s, f);
  try {
    const next = await auth(f).refresh(s.refreshToken);
    await kv.put(SESSION_KEY, JSON.stringify(next));
    return db(next, f);
  } catch (e) {
    // Another request may have refreshed it a moment ago (a refresh token is single-use).
    await new Promise(r => setTimeout(r, 1500));
    const again = (await kv.get(SESSION_KEY, 'json')) as SupabaseSession | null;
    if (again && again.refreshToken !== s.refreshToken && again.expiresAt - now() > 60) return db(again, f);
    console.error(JSON.stringify({ ig: 'bot session ended', status: e instanceof SupabaseError ? e.status : undefined }));
    return null;
  }
};

export const saveBotSession = (kv: KVNamespace, s: SupabaseSession) => kv.put(SESSION_KEY, JSON.stringify(s));
