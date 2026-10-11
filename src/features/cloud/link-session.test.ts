import { describe, expect, it, vi } from 'vitest';

vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ auth: { onAuthStateChange: () => {} } }) }));
const { linkSession } = await import('./client');

describe('linkSession', () => {
  it('reads the session a confirmation link carries', () => {
    expect(linkSession('#access_token=a.b.c&expires_in=3600&refresh_token=r1&token_type=bearer&type=email_change')).toEqual({ access_token: 'a.b.c', refresh_token: 'r1' });
  });
  it('ignores app routes and link errors', () => {
    expect(linkSession('#/me')).toBeNull();
    expect(linkSession('#error=access_denied&error_code=otp_expired')).toBeNull();
  });
});
