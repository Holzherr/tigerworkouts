/**
 * POST /push/coaching (src/push.ts): only the database's secret gets in, nothing is sent until the
 * APNs key is set, each device gets one alert on the right host with a token APNs can verify, and
 * dead tokens are handed back. APNs and Supabase are faked at fetch.
 */
import { describe, expect, it } from 'vitest';
import worker from '../src/index';
import { alertFor, APNS, providerToken, pushFetch, type PushEnv } from '../src/push';
import { SB_URL } from '../src/supabase';

const pem = (der: ArrayBuffer) => `-----BEGIN PRIVATE KEY-----\n${btoa(String.fromCharCode(...new Uint8Array(der))).replace(/(.{64})/g, '$1\n')}\n-----END PRIVATE KEY-----\n`;
const unb64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));

const keys = async () => {
  const pair = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])) as CryptoKeyPair;
  const env: PushEnv = { PUSH_HOOK_SECRET: 's3cret', APNS_KEY_ID: 'APNSKEY123', APNS_PRIVATE_KEY: pem((await crypto.subtle.exportKey('pkcs8', pair.privateKey)) as ArrayBuffer), APPLE_TEAM_ID: 'TEAM123456', APPLE_CLIENT_ID: 'dev.example.app' };
  return { env, publicKey: pair.publicKey };
};

const A = 'a'.repeat(64);
const B = 'b'.repeat(64);

const world = () => {
  const calls: { url: string; headers: Headers; body: string }[] = [];
  const f = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, headers: new Headers(init?.headers), body: String(init?.body ?? '') });
    if (url.endsWith(`/3/device/${B}`)) return Response.json({ reason: 'Unregistered' }, { status: 410 });
    if (url.includes('/3/device/')) return new Response('', { status: 200 });
    return new Response('1', { status: 200 });
  }) as typeof fetch;
  return { calls, f };
};

const hook = (body: unknown, secret = 's3cret') => new Request('https://mcp.example.test/push/coaching', { method: 'POST', headers: { authorization: `Bearer ${secret}` }, body: JSON.stringify(body) });

describe('coaching push', () => {
  it('is routed by the worker and off without its secrets', async () => {
    const res = await worker.fetch(hook({}), {} as never, {} as ExecutionContext);
    expect(res.status).toBe(503);
    const { env } = await keys();
    const noKey = await pushFetch(hook({ kind: 'note', coach: 'Sam', devices: [{ token: A }] }), { ...env, APNS_PRIVATE_KEY: undefined });
    expect(noKey.status).toBe(503);
  });

  it('refuses a caller without the secret', async () => {
    const { env } = await keys();
    const { f, calls } = world();
    expect((await pushFetch(hook({ kind: 'note', coach: 'Sam', devices: [{ token: A }] }, 'guess'), env, f)).status).toBe(401);
    expect(calls).toHaveLength(0);
  });

  it('sends one alert per device, on its host, and hands back the dead ones', async () => {
    const { env, publicKey } = await keys();
    const { f, calls } = world();
    const res = await pushFetch(hook({ kind: 'workout', coach: 'Sam', title: 'Strength A', body: 'Keep the last set honest', workoutId: 'u-1', devices: [{ token: A, sandbox: true }, { token: B }] }), env, f);
    expect(await res.json()).toEqual({ sent: 1, forgotten: 1 });
    const [a, b, forget] = calls;
    expect(a.url).toBe(`${APNS.sandbox}/3/device/${A}`);
    expect(b.url).toBe(`${APNS.production}/3/device/${B}`);
    expect(a.headers.get('apns-topic')).toBe('dev.example.app');
    expect(a.headers.get('apns-push-type')).toBe('alert');
    expect(JSON.parse(a.body)).toEqual({ aps: { alert: { title: 'Sam sent you a workout', body: 'Strength A · Keep the last set honest' }, sound: 'default' }, link: 'tigerworkouts://w/u-1' });
    // The provider token verifies with the key's public half and names the team and key.
    const jwt = a.headers.get('authorization')!.replace(/^bearer /, '');
    const [h, c, s] = jwt.split('.');
    expect(JSON.parse(new TextDecoder().decode(unb64url(h)))).toEqual({ alg: 'ES256', kid: 'APNSKEY123' });
    expect(JSON.parse(new TextDecoder().decode(unb64url(c))).iss).toBe('TEAM123456');
    expect(await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, publicKey, unb64url(s), new TextEncoder().encode(`${h}.${c}`))).toBe(true);
    expect(forget.url).toBe(`${SB_URL}/rest/v1/rpc/forget_push_devices`);
    expect(JSON.parse(forget.body)).toEqual({ p_secret: 's3cret', p_tokens: [B] });
  });

  it('drops tokens that are not APNs tokens, and refuses a hook with none left', async () => {
    const { env } = await keys();
    const { f, calls } = world();
    expect((await pushFetch(hook({ kind: 'note', coach: 'Sam', devices: [{ token: '../x' }] }), env, f)).status).toBe(400);
    expect(calls).toHaveLength(0);
  });

  it('words a note and a workout plainly', () => {
    expect(alertFor({ kind: 'note', coach: 'Sam', body: 'Nice work', devices: [] })).toEqual({ aps: { alert: { title: 'Note from Sam', body: 'Nice work' }, sound: 'default' }, link: 'tigerworkouts://coach' });
    expect(alertFor({ kind: 'workout', coach: ' ', title: 'Legs', devices: [] }).aps.alert).toEqual({ title: 'Your coach sent you a workout', body: 'Legs' });
  });

  it('signs a provider token with the team as issuer', async () => {
    const { env } = await keys();
    const t = await providerToken({ keyId: env.APNS_KEY_ID!, teamId: 'T', privateKey: env.APNS_PRIVATE_KEY!, topic: 'x' }, 1_000_000);
    expect(JSON.parse(new TextDecoder().decode(unb64url(t.split('.')[1])))).toEqual({ iss: 'T', iat: 1000 });
  });
});
