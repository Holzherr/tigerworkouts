import { afterEach, describe, expect, it, vi } from 'vitest';
import { SB_URL } from '@/app/config';
import { authStorageKey, createClient } from './supabase';

describe('the Supabase client built from its parts', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('keeps the session under the key supabase-js used, so nobody is signed out', () => {
    expect(authStorageKey(SB_URL)).toBe('sb-icpdzjohsvlpyaluxgbt-auth-token');
  });

  it('sends the anon key on a signed-out database request, to the rest endpoint', async () => {
    const seen: { url: string; headers: Headers }[] = [];
    vi.stubGlobal('fetch', async (url: RequestInfo | URL, init?: RequestInit) => (seen.push({ url: String(url), headers: new Headers(init?.headers) }), new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } })));
    const sb = createClient('https://example.supabase.co', 'anon-key', { auth: { persistSession: false, detectSessionInUrl: false, flowType: 'pkce' } });
    const { error } = await sb.from('workouts').select('id');
    expect(error).toBeNull();
    await sb.rpc('session_device', { p_started: 'x' });
    expect(seen.map(s => s.url.split('?')[0])).toEqual(['https://example.supabase.co/rest/v1/workouts', 'https://example.supabase.co/rest/v1/rpc/session_device']);
    for (const s of seen) {
      expect(s.headers.get('apikey')).toBe('anon-key');
      expect(s.headers.get('Authorization')).toBe('Bearer anon-key');
    }
  });
});
