import { describe, expect, it, vi } from 'vitest';

vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ auth: { onAuthStateChange: () => {} } }) }));
const { returnHash } = await import('./client');

const at = 1_800_000_000_000;
const kept = (h: string, t = at) => JSON.stringify({ h, t });

describe('the page a Google sign-in comes back to', () => {
  it('is the invite it was started from, when Google returns to the bare app', () => {
    expect(returnHash(kept('#/join/abc123'), '', at + 30_000)).toBe('#/join/abc123');
    expect(returnHash(kept('#/w/u-abc'), '#', at + 30_000)).toBe('#/w/u-abc');
    expect(returnHash(kept('#/coach'), '#/', at + 30_000)).toBe('#/coach');
  });
  it('never replaces a page the browser is already on', () => {
    expect(returnHash(kept('#/join/abc123'), '#/history', at)).toBeNull();
    expect(returnHash(kept('#/join/abc123'), '#error=access_denied', at)).toBeNull();
  });
  it('is nothing for a tab, an old sign-in, or a value it did not write', () => {
    expect(returnHash(kept('#/me'), '', at)).toBeNull();
    expect(returnHash(kept('#/join/abc123'), '', at + 16 * 60_000)).toBeNull();
    expect(returnHash('#/join/abc123', '', at)).toBeNull();
    expect(returnHash(null, '', at)).toBeNull();
  });
});
