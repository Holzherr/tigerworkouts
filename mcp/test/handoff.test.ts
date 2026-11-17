/**
 * POST /web-session (src/handoff.ts): a signed-in phone gets a one-time web sign-in link for the
 * same account, never its own tokens; without the service key or an email it says so. Supabase is
 * faked at fetch.
 */
import { describe, expect, it } from 'vitest';
import { handoffFetch } from '../src/handoff';
import { SB_URL } from '../src/supabase';

const world = (user: Record<string, unknown> = { email: 'pt@example.test' }) => {
  const asked: unknown[] = [];
  const f = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === `${SB_URL}/auth/v1/user`) return new Headers(init?.headers).get('authorization') === 'Bearer good' ? Response.json(user) : new Response('{}', { status: 401 });
    if (url === `${SB_URL}/auth/v1/admin/generate_link`) {
      asked.push({ auth: new Headers(init?.headers).get('authorization'), body: JSON.parse(String(init?.body)) });
      return Response.json({ hashed_token: 'h-123', action_link: 'https://x.test/verify?token=secret' });
    }
    return new Response('', { status: 404 });
  }) as typeof fetch;
  return { asked, f };
};
const post = (bearer = 'good', to: unknown = '/coach') => new Request('https://mcp.example.test/web-session', { method: 'POST', headers: { authorization: `Bearer ${bearer}` }, body: JSON.stringify({ to }) });
const env = { SUPABASE_SERVICE_ROLE_KEY: 'service' };

describe('POST /web-session', () => {
  it('mints a one-time sign-in for the caller and links the web page to it', async () => {
    const { asked, f } = world();
    const res = await handoffFetch(post(), env, f);
    expect(res.status).toBe(200);
    const { url } = (await res.json()) as { url: string };
    const u = new URL(url);
    expect(u.origin).toBe('https://tigerworkouts.com');
    const h = new URLSearchParams(u.hash.slice(1));
    expect(h.get('handoff')).toBe('h-123');
    expect(h.get('to')).toBe('/coach');
    expect(asked).toEqual([{ auth: 'Bearer service', body: { type: 'magiclink', email: 'pt@example.test' } }]);
  });
  it('opens only pages it knows', async () => {
    const { f } = world();
    const { url } = (await (await handoffFetch(post('good', 'https://evil.test'), env, f)).json()) as { url: string };
    expect(new URLSearchParams(new URL(url).hash.slice(1)).get('to')).toBe('/coach');
  });
  it('refuses a caller who is not signed in, says when it is not set up, and skips accounts with no email', async () => {
    expect((await handoffFetch(post('bad'), env, world().f)).status).toBe(401);
    expect((await handoffFetch(post(), {}, world().f)).status).toBe(503);
    expect((await handoffFetch(post(), env, world({ is_anonymous: true }).f)).status).toBe(409);
  });
});
