/**
 * POST /apple/revoke (src/apple.ts): the client secret is a JWT Apple can verify, the code is
 * swapped for a refresh token and that token revoked, and the route says so plainly when the key
 * is not configured or the caller is not signed in. Apple and Supabase are faked at fetch.
 */
import { describe, expect, it } from 'vitest';
import worker from '../src/index';
import { APPLE, appleFetch, clientSecret, type AppleEnv } from '../src/apple';
import { SB_URL } from '../src/supabase';

const pem = (der: ArrayBuffer) => `-----BEGIN PRIVATE KEY-----\n${btoa(String.fromCharCode(...new Uint8Array(der))).replace(/(.{64})/g, '$1\n')}\n-----END PRIVATE KEY-----\n`;
const unb64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));

const keys = async () => {
  const pair = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])) as CryptoKeyPair;
  const env: Required<AppleEnv> = { APPLE_TEAM_ID: 'TEAM123456', APPLE_CLIENT_ID: 'dev.example.app', APPLE_KEY_ID: 'KEY1234567', APPLE_PRIVATE_KEY: pem((await crypto.subtle.exportKey('pkcs8', pair.privateKey)) as ArrayBuffer) };
  return { env, publicKey: pair.publicKey };
};

/** Supabase knows one token; Apple hands a refresh token for one code and records what it revoked. */
const world = () => {
  const calls: { url: string; body: URLSearchParams }[] = [];
  const f = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === `${SB_URL}/auth/v1/user`) return new Response('{}', { status: new Headers(init?.headers).get('authorization') === 'Bearer good' ? 200 : 401 });
    const body = new URLSearchParams(String(init?.body ?? ''));
    calls.push({ url, body });
    if (url === `${APPLE}/auth/token`) return body.get('code') === 'fresh' ? Response.json({ refresh_token: 'r-1', access_token: 'a-1' }) : Response.json({ error: 'invalid_grant' }, { status: 400 });
    if (url === `${APPLE}/auth/revoke`) return new Response('', { status: 200 });
    return new Response('', { status: 404 });
  }) as typeof fetch;
  return { calls, f };
};

const post = (code: unknown, bearer = 'good') => new Request('https://mcp.example.test/apple/revoke', { method: 'POST', headers: { authorization: `Bearer ${bearer}`, 'content-type': 'application/json' }, body: JSON.stringify({ code }) });

describe('POST /apple/revoke', () => {
  it('signs a client secret Apple can verify: ES256, from the team, for the app, five minutes', async () => {
    const { env, publicKey } = await keys();
    const now = Date.parse('2026-11-15T12:00:00Z');
    const [header, claims, signature] = (await clientSecret(env, now)).split('.');
    expect(JSON.parse(new TextDecoder().decode(unb64url(header)))).toEqual({ alg: 'ES256', kid: 'KEY1234567' });
    expect(JSON.parse(new TextDecoder().decode(unb64url(claims)))).toEqual({ iss: 'TEAM123456', iat: now / 1000, exp: now / 1000 + 300, aud: 'https://appleid.apple.com', sub: 'dev.example.app' });
    expect(await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, publicKey, unb64url(signature), new TextEncoder().encode(`${header}.${claims}`))).toBe(true);
  });

  it('swaps the code for a refresh token and revokes it', async () => {
    const { env } = await keys();
    const { calls, f } = world();
    const res = await appleFetch(post('fresh'), env, f);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ revoked: true });
    expect(calls.map(c => c.url)).toEqual([`${APPLE}/auth/token`, `${APPLE}/auth/revoke`]);
    expect(calls[0].body.get('grant_type')).toBe('authorization_code');
    expect(calls[0].body.get('client_id')).toBe('dev.example.app');
    expect(calls[1].body.get('token')).toBe('r-1');
    expect(calls[1].body.get('token_type_hint')).toBe('refresh_token');
    expect(calls[1].body.get('client_secret')?.split('.')).toHaveLength(3);
  });

  it('says so when Apple refuses the code, and revokes nothing', async () => {
    const { env } = await keys();
    const { calls, f } = world();
    const res = await appleFetch(post('stale'), env, f);
    expect(res.status).toBe(502);
    expect(((await res.json()) as { error: string }).error).toBe('apple_refused');
    expect(calls.map(c => c.url)).toEqual([`${APPLE}/auth/token`]);
  });

  it('needs a signed-in account, a code, and the key', async () => {
    const { env } = await keys();
    const { calls, f } = world();
    expect((await appleFetch(post('fresh', 'bad'), env, f)).status).toBe(401);
    expect((await appleFetch(post(''), env, f)).status).toBe(400);
    expect((await appleFetch(post(7), env, f)).status).toBe(400);
    const unset = await appleFetch(post('fresh'), { ...env, APPLE_PRIVATE_KEY: undefined }, f);
    expect(unset.status).toBe(503);
    expect(await unset.json()).toEqual({ error: 'not_configured' });
    expect((await appleFetch(new Request('https://mcp.example.test/apple/revoke'), env, f)).status).toBe(405);
    expect(calls).toHaveLength(0);
  });

  it('is routed by the worker without an OAuth grant', async () => {
    const res = await worker.fetch(new Request('https://mcp.example.test/apple/revoke'), {} as never, {} as ExecutionContext);
    expect(res.status).toBe(405);
  });
});
