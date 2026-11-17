/**
 * Push notifications for coaching (review round 2, U3): a client hears of a new workout or note from
 * their coach.
 *
 *   POST /push/coaching   Authorization: Bearer <PUSH_HOOK_SECRET>
 *                         { kind: "workout" | "note", coach, title?, body?, workoutId?,
 *                           devices: [{ token, sandbox }] }
 *
 * Called by the database (migration 0017: a trigger on assignments and coach_notes posts through
 * pg_net), never by the apps. This worker signs an APNs provider token with the team's APNs key and
 * sends one alert per device. Tokens APNs calls dead are handed back to forget_push_devices.
 *
 * Off (503 not_configured) until all of these are set:
 *   PUSH_HOOK_SECRET  secret, the same string as the Vault secret push_hook_secret in Supabase
 *   APNS_KEY_ID       the APNs key's id (Apple Developer → Keys, "Apple Push Notifications service")
 *   APNS_PRIVATE_KEY  secret, the key's .p8 contents
 *   APNS_TEAM_ID      the team id; APPLE_TEAM_ID (wrangler.jsonc) is used when it is not set
 * The app's bundle id (the APNs topic) is APPLE_CLIENT_ID.
 */
import { b64url, SB_KEY, SB_URL } from './supabase';

export interface PushEnv {
  PUSH_HOOK_SECRET?: string;
  APNS_KEY_ID?: string;
  APNS_PRIVATE_KEY?: string;
  APNS_TEAM_ID?: string;
  APPLE_TEAM_ID?: string;
  APPLE_CLIENT_ID?: string;
}

type Fetch = typeof fetch;

export const isPushPath = (p: string) => p === '/push/coaching';

export const APNS = { production: 'https://api.push.apple.com', sandbox: 'https://api.sandbox.push.apple.com' };

interface Apns {
  keyId: string;
  teamId: string;
  privateKey: string;
  topic: string;
}

const apnsConfig = (env: PushEnv): Apns | null => {
  const teamId = env.APNS_TEAM_ID || env.APPLE_TEAM_ID;
  if (!env.APNS_KEY_ID || !env.APNS_PRIVATE_KEY || !teamId || !env.APPLE_CLIENT_ID) return null;
  return { keyId: env.APNS_KEY_ID, teamId, privateKey: env.APNS_PRIVATE_KEY, topic: env.APPLE_CLIENT_ID };
};

const text = (s: string) => new TextEncoder().encode(s);
const pkcs8 = (pem: string) => Uint8Array.from(atob(pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '')), c => c.charCodeAt(0));

/** The provider token: ES256, iss = team, iat. APNs refuses one older than an hour and one renewed
 * more than every 20 minutes, so it is kept for 40. */
export const providerToken = async (c: Apns, now = Date.now()) => {
  const header = b64url(text(JSON.stringify({ alg: 'ES256', kid: c.keyId })));
  const claims = b64url(text(JSON.stringify({ iss: c.teamId, iat: Math.floor(now / 1000) })));
  const key = await crypto.subtle.importKey('pkcs8', pkcs8(c.privateKey), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, text(`${header}.${claims}`));
  return `${header}.${claims}.${b64url(new Uint8Array(signature))}`;
};

let cached: { keyId: string; token: string; at: number } | null = null;
const tokenFor = async (c: Apns, now = Date.now()) => {
  if (cached && cached.keyId === c.keyId && now - cached.at < 40 * 60_000) return cached.token;
  cached = { keyId: c.keyId, token: await providerToken(c, now), at: now };
  return cached.token;
};

export interface Hook {
  kind: 'workout' | 'note';
  coach: string;
  title?: string | null;
  body?: string | null;
  workoutId?: string | null;
  devices: { token: string; sandbox?: boolean }[];
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** What the phone shows, and where a tap goes (the app reads `link`). */
export const alertFor = (h: Hook) => {
  const coach = clip(h.coach.trim() || 'Your coach', 40);
  const body = h.body?.trim();
  if (h.kind === 'note') return { aps: { alert: { title: `Note from ${coach}`, body: clip(body || 'New note', 200) }, sound: 'default' }, link: 'tigerworkouts://coach' };
  const title = h.title?.trim() || 'A workout';
  return {
    aps: { alert: { title: `${coach} sent you a workout`, body: clip(body ? `${title} · ${body}` : title, 200) }, sound: 'default' },
    link: h.workoutId ? `tigerworkouts://w/${encodeURIComponent(h.workoutId)}` : 'tigerworkouts://',
  };
};

const TOKEN = /^[0-9a-f]{32,200}$/;

export const parseHook = (raw: unknown): Hook | null => {
  const h = raw as Partial<Hook> | null;
  if (!h || (h.kind !== 'workout' && h.kind !== 'note') || typeof h.coach !== 'string' || !Array.isArray(h.devices)) return null;
  const devices = h.devices.filter(d => d && typeof d.token === 'string' && TOKEN.test(d.token)).slice(0, 20);
  return devices.length ? { ...h, devices } as Hook : null;
};

/** One alert per device. Returns the tokens APNs says are gone. */
export const send = async (c: Apns, h: Hook, f: Fetch = fetch, now = Date.now()) => {
  const jwt = await tokenFor(c, now);
  const payload = JSON.stringify(alertFor(h));
  const dead: string[] = [];
  let sent = 0;
  await Promise.all(
    h.devices.map(async d => {
      const res = await f(`${d.sandbox ? APNS.sandbox : APNS.production}/3/device/${d.token}`, {
        method: 'POST',
        headers: { authorization: `bearer ${jwt}`, 'apns-topic': c.topic, 'apns-push-type': 'alert', 'apns-priority': '10', 'content-type': 'application/json' },
        body: payload,
      }).catch(() => null);
      if (res?.ok) return void sent++;
      const reason = res ? ((await res.json().catch(() => ({}))) as { reason?: string }).reason : undefined;
      if (res?.status === 410 || reason === 'BadDeviceToken' || reason === 'Unregistered') dead.push(d.token);
    })
  );
  return { sent, dead };
};

/** Constant-time string comparison, so the secret cannot be guessed a character at a time. */
const same = (a: string, b: string) => {
  const x = text(a);
  const y = text(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
};

const json = (body: unknown, status = 200) => Response.json(body, { status });

export const pushFetch = async (request: Request, env: PushEnv, f: Fetch = fetch): Promise<Response> => {
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  if (!env.PUSH_HOOK_SECRET) return json({ error: 'not_configured' }, 503);
  const bearer = request.headers.get('authorization')?.match(/^Bearer (.+)$/i)?.[1] ?? '';
  if (!same(bearer, env.PUSH_HOOK_SECRET)) return json({ error: 'unauthorized' }, 401);
  const c = apnsConfig(env);
  if (!c) return json({ error: 'not_configured' }, 503);
  const hook = parseHook(await request.json().catch(() => null));
  if (!hook) return json({ error: 'invalid_request' }, 400);
  const { sent, dead } = await send(c, hook, f);
  if (dead.length)
    await f(`${SB_URL}/rest/v1/rpc/forget_push_devices`, {
      method: 'POST',
      headers: { apikey: SB_KEY, authorization: `Bearer ${SB_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({ p_secret: env.PUSH_HOOK_SECRET, p_tokens: dead }),
    }).catch(() => null);
  return json({ sent, forgotten: dead.length });
};
