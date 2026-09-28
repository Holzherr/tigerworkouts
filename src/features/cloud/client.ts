import { createClient, type Session, type User } from '@supabase/supabase-js';
import { useSyncExternalStore } from 'react';
import { SB_KEY, SB_URL } from '@/app/config';
import { clearDevice, getState, setState } from '@/app/store';
import { rebase } from './rebase';
import { clearSnap, dirtyCount, sync } from './sync';

export const sb = createClient(SB_URL, SB_KEY, { auth: { persistSession: true, detectSessionInUrl: true, flowType: 'pkce' } });

interface AuthState {
  user: User | null;
  ready: boolean;
}
let auth: AuthState = { user: null, ready: false };
const listeners = new Set<() => void>();
const set = (next: AuthState) => {
  auth = next;
  listeners.forEach(l => l());
};

sb.auth.onAuthStateChange((_event: string, session: Session | null) => set({ user: session?.user ?? null, ready: true }));

export const useAuth = () => useSyncExternalStore(cb => (listeners.add(cb), () => listeners.delete(cb)), () => auth);
export const currentUser = () => auth.user;

/** Passwordless: a 6-digit code by email. */
export const sendCode = async (email: string) => {
  const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin + location.pathname } });
  if (error) throw error;
};
export const verifyCode = async (email: string, token: string) => {
  const { error } = await sb.auth.verifyOtp({ email, token: token.replace(/\s+/g, ''), type: 'email' });
  if (error) throw error;
};
export const signInGoogle = async () => {
  // Return to the app root (no hash): Supabase appends ?code=… and the client exchanges it on load.
  const { error } = await sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.origin + location.pathname } });
  if (error) throw error;
};
/**
 * Pushes what this device holds, then signs out and clears the device for the next account,
 * including what the server was last seen holding (`tiger:synced`). When the push fails, or a
 * session is still unsaved to the account afterwards, nothing changes and the reason comes back
 * as a message: clearing then would delete the only copy.
 */
export const signOut = async (): Promise<string | undefined> => {
  const local = getState();
  const out = await sync(local);
  // Applied as use-sync does: the sync has already noted what it pulled as seen, so the store must hold it too.
  if (out.changed || out.error !== getState().syncError) setState({ ...rebase(getState(), local, out.patch), lastSync: new Date().toISOString(), syncError: out.error });
  if (out.error || dirtyCount(getState())) return 'Some sessions are not saved to your account yet; try again when online.';
  await sb.auth.signOut();
  clearDevice();
  clearSnap();
};

/** Which external providers the project has enabled (Google shows only when configured). */
export const providers = async (): Promise<Record<string, boolean>> => {
  try {
    const r = await fetch(`${SB_URL}/auth/v1/settings`, { headers: { apikey: SB_KEY } });
    const d = await r.json();
    return d.external ?? {};
  } catch {
    return {};
  }
};
