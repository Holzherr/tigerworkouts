/**
 * The whole OAuth round trip through the real worker (index.ts + workers-oauth-provider), with KV
 * in memory and Supabase faked at fetch: register a client, sign in by email code, swap the code
 * for tokens, call /mcp, refresh, and check the allowlist turns other accounts away.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker from '../src/index';
import { SB_URL } from '../src/supabase';
import { fakeSupabase, tokenFor } from './fake-supabase';

const NICK = '71ee1910-ef0a-471d-81bb-345ce7b9c2e3';
const STRANGER = '00000000-0000-4000-8000-000000000009';
const ORIGIN = 'https://mcp.example.test';
const REDIRECT = 'http://localhost:9999/cb';

const memoryKv = () => {
  const m = new Map<string, string>();
  return {
    get: async (k: string, t?: unknown) => {
      const v = m.get(k);
      if (v === undefined) return null;
      return t === 'json' || (t as { type?: string })?.type === 'json' ? JSON.parse(v) : v;
    },
    put: async (k: string, v: string) => void m.set(k, v),
    delete: async (k: string) => void m.delete(k),
    list: async ({ prefix = '' }: { prefix?: string } = {}) => ({ keys: [...m.keys()].filter(k => k.startsWith(prefix)).map(name => ({ name })), list_complete: true, cursor: '' }),
  };
};

let env: Record<string, unknown>;
let refreshes = 0;
let emailUser = NICK;
const ctx = { waitUntil: () => {}, passThroughOnException: () => {}, props: {} } as unknown as ExecutionContext;
const call = (path: string, init?: RequestInit) => worker.fetch(new Request(`${ORIGIN}${path}`, init), env as never, ctx);

beforeEach(() => {
  env = { OAUTH_KV: memoryKv(), ALLOWED_USER_IDS: NICK, GOOGLE_SIGNIN: 'false' };
  refreshes = 0;
  emailUser = NICK;
  const rest = fakeSupabase({ profiles: [{ id: NICK, name: 'Nick', units: 'metric' }], user_state: [], workouts: [], sessions: [], exercises: [] });
  const session = (uid: string) => ({ access_token: tokenFor(uid), refresh_token: `refresh-${uid}-${refreshes}`, expires_in: 3600, user: { id: uid, email: `${uid}@example.com` } });
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === `${SB_URL}/auth/v1/otp`) return Response.json({});
    if (url === `${SB_URL}/auth/v1/verify`) return JSON.parse(String(init?.body)).token === '123456' ? Response.json(session(emailUser)) : Response.json({ msg: 'Token has expired or is invalid' }, { status: 403 });
    if (url === `${SB_URL}/auth/v1/token?grant_type=refresh_token`) return (refreshes++, Response.json(session(NICK)));
    return rest.fetch(input, init);
  });
});
afterEach(() => vi.unstubAllGlobals());

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const json = async (r: Response | Promise<Response>): Promise<any> => (await r).json();

const form = (o: Record<string, string>) => ({ method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(o).toString() });

const pkce = async () => {
  const verifier = 'v'.repeat(64);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
  return { verifier, challenge: btoa(String.fromCharCode(...digest)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') };
};

/** Register, open /authorize, submit email and code; returns the final response and PKCE verifier. */
const signIn = async () => {
  const reg = await json(call('/oauth/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ client_name: 'Claude', redirect_uris: [REDIRECT], token_endpoint_auth_method: 'none' }) }));
  const { verifier, challenge } = await pkce();
  const q = new URLSearchParams({ response_type: 'code', client_id: reg.client_id, redirect_uri: REDIRECT, code_challenge: challenge, code_challenge_method: 'S256', state: 'st8', scope: 'workouts', resource: `${ORIGIN}/mcp` });
  const page = await (await call(`/authorize?${q}`)).text();
  expect(page).toContain('Connecting <b>Claude</b>');
  const rid = page.match(/name="rid" value="([^"]+)"/)![1];
  expect(await (await call('/authorize/email', form({ rid, email: 'nick@example.com' }))).text()).toContain('Check your email');
  const wrong = await (await call('/authorize/code', form({ rid, code: '000000' }))).text();
  expect(wrong).toContain('That code did not work');
  return { res: await call('/authorize/code', form({ rid, code: '123 456' })), verifier, clientId: reg.client_id as string };
};

describe('OAuth end to end', () => {
  it('an unauthenticated /mcp call points the client at the metadata', async () => {
    const res = await call('/mcp', { method: 'POST' });
    expect(res.status).toBe(401);
    expect(res.headers.get('www-authenticate')).toContain(`${ORIGIN}/.well-known/oauth-protected-resource/mcp`);
    const meta = await json(call('/.well-known/oauth-protected-resource/mcp'));
    expect(meta).toMatchObject({ resource: `${ORIGIN}/mcp`, authorization_servers: [ORIGIN] });
    const as = await json(call('/.well-known/oauth-authorization-server'));
    expect(as).toMatchObject({ authorization_endpoint: `${ORIGIN}/authorize`, token_endpoint: `${ORIGIN}/oauth/token`, registration_endpoint: `${ORIGIN}/oauth/register` });
  });

  it('sign in by email code, get tokens, use /mcp, refresh', async () => {
    const { res, verifier, clientId } = await signIn();
    expect(res.status).toBe(302);
    const back = new URL(res.headers.get('location')!);
    expect(back.origin + back.pathname).toBe(REDIRECT);
    expect(back.searchParams.get('state')).toBe('st8');

    const tok = await json(call('/oauth/token', form({ grant_type: 'authorization_code', code: back.searchParams.get('code')!, redirect_uri: REDIRECT, client_id: clientId, code_verifier: verifier, resource: `${ORIGIN}/mcp` })));
    expect(tok.access_token).toBeTruthy();
    expect(tok.expires_in).toBeLessThanOrEqual(3600 - 120);

    const mcp = (token: string) =>
      call('/mcp', { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', accept: 'application/json, text/event-stream' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'get_profile', arguments: {} } }) });
    const out = await json(mcp(tok.access_token));
    expect(JSON.parse(out.result.content[0].text)).toMatchObject({ userId: NICK, name: 'Nick' });

    const next = await json(call('/oauth/token', form({ grant_type: 'refresh_token', refresh_token: tok.refresh_token, client_id: clientId })));
    expect(refreshes).toBe(1);
    expect((await mcp(next.access_token)).status).toBe(200);
  });

  it('an account outside the allowlist gets "not open yet" and no code', async () => {
    emailUser = STRANGER;
    const { res } = await signIn();
    expect(res.status).toBe(403);
    expect(await res.text()).toContain('Not open yet');
  });

  it('clearing the allowlist opens it to every account', async () => {
    env.ALLOWED_USER_IDS = '';
    emailUser = STRANGER;
    expect((await signIn()).res.status).toBe(302);
  });

  it('serves the landing page and llms.txt', async () => {
    expect(await (await call('/')).text()).toContain(`${ORIGIN}/mcp`);
    expect(await (await call('/llms.txt')).text()).toContain('claude mcp add --transport http tigerworkouts');
  });
});
