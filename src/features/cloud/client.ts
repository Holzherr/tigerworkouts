import { createClient, type Session, type User } from '@supabase/supabase-js';
import { useSyncExternalStore } from 'react';
import { SB_KEY, SB_URL } from '@/app/config';

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
  const { error } = await sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.origin + location.pathname + '#/me' } });
  if (error) throw error;
};
export const signOut = async () => {
  await sb.auth.signOut();
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
