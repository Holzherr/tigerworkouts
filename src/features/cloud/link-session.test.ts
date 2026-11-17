import { describe, expect, it, vi } from 'vitest';

vi.mock('@/features/cloud/supabase', () => ({ createClient: () => ({ auth: { onAuthStateChange: () => {} } }) }));
const { handoffLink, linkSession } = await import('./client');

describe('linkSession', () => {
  it('reads the session a confirmation link carries', () => {
    expect(linkSession('#access_token=a.b.c&expires_in=3600&refresh_token=r1&token_type=bearer&type=email_change')).toEqual({ access_token: 'a.b.c', refresh_token: 'r1' });
  });
  it('ignores app routes and link errors', () => {
    expect(linkSession('#/me')).toBeNull();
    expect(linkSession('#error=access_denied&error_code=otp_expired')).toBeNull();
  });
});

describe('handoffLink', () => {
  it('reads the iPhone app\'s one-time sign-in and the page to open', () => {
    expect(handoffLink('#handoff=h-123&to=%2Fcoach')).toEqual({ tokenHash: 'h-123', to: '/coach' });
  });
  it('opens only pages it knows, and ignores everything else', () => {
    expect(handoffLink('#handoff=h-1&to=https%3A%2F%2Fevil.test')).toEqual({ tokenHash: 'h-1', to: '/coach' });
    expect(handoffLink('#/coach')).toBeNull();
    expect(handoffLink('#access_token=a&refresh_token=r')).toBeNull();
  });
});
