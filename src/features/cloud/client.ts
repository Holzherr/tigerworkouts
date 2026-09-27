import { createClient, type Session, type User } from '@supabase/supabase-js';
import { useSyncExternalStore } from 'react';
import { SB_KEY, SB_URL } from '@/app/config';
import { setState, type AppState } from '@/app/store';
import { clearSnap, sync } from './sync';
import { pick } from './use-sync';

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
/** The store as it is now: a write of nothing hands its state over without notifying anyone. */
const readState = (s?: AppState) => (setState(cur => ((s = cur), {})), s!);
/** Pushes what this device holds, signs out, then clears the device for the next account. A failed push, or a session saved mid-push, holds the sign-out instead: `syncError` says so and the promise rejects. */
export const signOut = async () => {
  const local = pick(readState());
  const out = await sync(local);
  const held = out.error ? `could not upload this device's sessions (${out.error})` : JSON.stringify(pick(readState())) !== JSON.stringify(local) ? 'a session was saved just now' : '';
  if (held) {
    setState({ syncError: `Not signed out: ${held}. Try again.` });
    throw new Error(held);
  }
  await sb.auth.signOut();
  clearSnap();
  setState({ results: [], workouts: [], favorites: [], saved: [], exercises: {}, trainingMaxes: {}, bodyweightKg: undefined, name: 'Nick', avatar: undefined, signedIn: false, lastSync: undefined, syncError: undefined });
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
