/**
 * The Instagram bot: Meta's webhook handshake and signature, the payload shapes from Meta's docs,
 * the pipeline (dedupe, one Claude call per new reel, pending imports, replies), the import queue's
 * admin gating, and pending imports staying off creator pages and search. Claude and the Graph API
 * are mocked; Supabase is the in-memory one with row-level security.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { creditedCreators } from '@/features/creators/credited';
import { workoutFromRow } from '@/features/cloud/rows';
import type { Runsheet } from '@/features/runsheet/model';
import { handleMcp } from '../src/server';
import { db as makeDb } from '../src/supabase';
import * as T from '../src/tools';
import { copiesCaption, extractWorkout } from '../src/instagram/extract';
import { GraphError, shortcode, type Graph } from '../src/instagram/graph';
import { handleJob, LIMITS, REPLIES, resolveShortLink, type Deps } from '../src/instagram/pipeline';
import { botFetch, type BotEnv } from '../src/instagram/routes';
import { SESSION_KEY } from '../src/instagram/session';
import { parseWebhook, signatureOk, verifyHandshake, type Job } from '../src/instagram/webhook';
import { normalise, runsheetInput } from '../src/runsheet';
import { libraryRef } from '../src/catalogue';
import { fakeSupabase, tokenFor, type Tables } from './fake-supabase';

const NICK = '71ee1910-ef0a-471d-81bb-345ce7b9c2e3';
const OTHER = '00000000-0000-4000-8000-000000000002';
const OURS = { id: '17841400000000001', username: 'tigerworkouts' };
const ORIGIN = 'https://mcp.tigerworkouts.com';

const memoryKv = () => {
  const m = new Map<string, string>();
  return {
    m,
    get: async (k: string, t?: unknown) => {
      const v = m.get(k);
      if (v === undefined) return null;
      return t === 'json' ? JSON.parse(v) : v;
    },
    put: async (k: string, v: string) => void m.set(k, v),
    delete: async (k: string) => void m.delete(k),
  } as unknown as KVNamespace & { m: Map<string, string> };
};

// ── fixtures, in the shapes of Meta's examples (developers.facebook.com/documentation/instagram-platform/webhooks/examples) ──
const mentionFb = { object: 'instagram', entry: [{ id: OURS.id, time: 1520622968, changes: [{ field: 'mentions', value: { comment_id: '17894227972186120', media_id: '17918195224117851' } }] }] };
const mentionIgLogin = (text = 'workout please @tigerworkouts', from = { id: '1789', username: 'fan.one' }) => ({ object: 'instagram', entry: [{ id: OURS.id, time: 1, changes: [{ field: 'comments', value: { id: '1801', from, text, media: { id: '17918195224117851', media_product_type: 'REELS' } } }] }] });
const dmReel = (mid = 'aWdfZAG1faXRlbToxOklH', sender = '5551') => ({ object: 'instagram', entry: [{ id: OURS.id, time: 1, messaging: [{ sender: { id: sender }, recipient: { id: OURS.id }, timestamp: 1, message: { mid, attachments: [{ type: 'ig_reel', payload: { url: 'https://lookaside.fbsbx.com/ig_messaging_cdn/?asset_id=1791&signature=x', reel_video_id: '17918195224117851', title: 'Leg day finisher' } }] } }] }] });
const dmEcho = { object: 'instagram', entry: [{ id: OURS.id, time: 1, messaging: [{ sender: { id: OURS.id }, recipient: { id: '5551' }, timestamp: 1, message: { mid: 'echo1', is_echo: true, text: 'Here is the workout' } }] }] };

const CAPTION = 'Burpee blast 🔥 3 rounds: 10 burpees, 20 push ups, 30s plank. Rest 60s between rounds. #fitness';
const reel = { id: '17918195224117851', caption: CAPTION, permalink: 'https://www.instagram.com/reel/C9xYz123/', username: 'coach.amy', mediaType: 'VIDEO' };

const goodWorkout = {
  title: 'Burpee, push-up and plank circuit',
  description: 'Three rounds of burpees, push-ups and a plank hold with a minute of rest between rounds.',
  level: 'Medium',
  items: [{ kind: 'block', name: 'Circuit', repeat: 3, restBetweenSec: 60, steps: [{ kind: 'exercise', exercise: 'bw_burpee', forMode: 'reps', forValue: 10 }, { kind: 'exercise', exercise: 'bw_pushup', forMode: 'reps', forValue: 20 }, { kind: 'exercise', exercise: 'bw_plank', forMode: 'seconds', forValue: 30 }] }],
};
const runsheetFor = (w = goodWorkout): Runsheet => normalise(runsheetInput.parse(w), libraryRef);

let tables: Tables;
let fake: ReturnType<typeof fakeSupabase>;
let kv: ReturnType<typeof memoryKv>;
let sent: { kind: string; to?: unknown; text: string }[];
let extracts: number;
let graphMock: Graph;
let extractResult: () => Promise<Awaited<ReturnType<NonNullable<Deps['extract']>>>>;
const as = (uid: string) => makeDb({ userId: uid, accessToken: tokenFor(uid) }, fake.fetch);

const deps = (over: Partial<Deps> = {}): Deps => ({
  kv,
  graph: graphMock,
  db: async () => as(NICK),
  extract: async () => {
    extracts++;
    return extractResult();
  },
  origin: ORIGIN,
  ...over,
});

beforeEach(() => {
  tables = { profiles: [], user_state: [], workouts: [], sessions: [], exercises: [] };
  fake = fakeSupabase(tables);
  kv = memoryKv();
  sent = [];
  extracts = 0;
  extractResult = async () => ({ found: true, runsheet: runsheetFor(), calls: 1 });
  graphMock = {
    mentionedComment: async () => ({ text: '@tigerworkouts', media: reel }),
    mentionedMedia: async () => reel,
    media: async () => reel,
    replyToMention: async a => (sent.push({ kind: 'comment', to: a.commentId, text: a.message }), { id: 'r1' }),
    sendMessage: async (to, text) => (sent.push({ kind: 'dm', to, text }), { message_id: 'm1' }),
  };
});

const job = (p: unknown) => parseWebhook(p, OURS).jobs[0] as Job;
const link = (text: string) => text.match(/https:\/\/mcp\.tigerworkouts\.com\/i\/(\S+)/)?.[1];

describe('webhook handshake and signature', () => {
  it('echoes hub.challenge only for our verify token', async () => {
    const u = (t: string) => new URL(`${ORIGIN}/instagram/webhook?hub.mode=subscribe&hub.verify_token=${t}&hub.challenge=1158201444`);
    const ok = verifyHandshake(u('s3cret'), 's3cret');
    expect(ok.status).toBe(200);
    expect(await ok.text()).toBe('1158201444');
    expect(verifyHandshake(u('wrong'), 's3cret').status).toBe(403);
    expect(verifyHandshake(u('s3cret'), undefined).status).toBe(503);
  });

  it('checks X-Hub-Signature-256 against the app secret', async () => {
    const body = JSON.stringify(mentionFb);
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode('appsecret'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const sig = [...new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body)))].map(b => b.toString(16).padStart(2, '0')).join('');
    expect(await signatureOk(body, `sha256=${sig}`, 'appsecret')).toBe(true);
    expect(await signatureOk(body, `sha256=${sig}`, 'other')).toBe(false);
    expect(await signatureOk(`${body} `, `sha256=${sig}`, 'appsecret')).toBe(false);
    expect(await signatureOk(body, null, 'appsecret')).toBe(false);
  });

  it('the route refuses a bad signature, and with no secrets set only logs and answers 200', async () => {
    const ctx = { waitUntil: () => {} } as unknown as ExecutionContext;
    const post = (env: BotEnv, sig = 'sha256=00') => botFetch(new Request(`${ORIGIN}/instagram/webhook`, { method: 'POST', headers: { 'x-hub-signature-256': sig }, body: JSON.stringify(mentionFb) }), env, ctx);
    expect((await post({ OAUTH_KV: kv })).status).toBe(200);
    expect((await post({ OAUTH_KV: kv, INSTAGRAM_APP_SECRET: 'appsecret' })).status).toBe(401);
    expect((await botFetch(new Request(`${ORIGIN}/instagram/webhook?hub.mode=subscribe&hub.verify_token=x&hub.challenge=1`), { OAUTH_KV: kv }, ctx)).status).toBe(503);
  });

  it('a signed delivery answers 200 at once and runs the job after the response', async () => {
    const body = JSON.stringify(mentionFb);
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode('appsecret'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const sig = [...new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body)))].map(b => b.toString(16).padStart(2, '0')).join('');
    const later: Promise<unknown>[] = [];
    const ctx = { waitUntil: (p: Promise<unknown>) => later.push(p) } as unknown as ExecutionContext;
    // Token but no account id yet: nothing is sent, nothing is scheduled.
    const res = await botFetch(new Request(`${ORIGIN}/instagram/webhook`, { method: 'POST', headers: { 'x-hub-signature-256': `sha256=${sig}` }, body }), { OAUTH_KV: kv, INSTAGRAM_APP_SECRET: 'appsecret', INSTAGRAM_ACCESS_TOKEN: 't' }, ctx);
    expect(res.status).toBe(200);
    expect(later).toHaveLength(0);
  });
});

describe('payloads', () => {
  it('reads a Facebook Login mention, an Instagram Login comment mention and a shared reel; skips echoes and our own comments', () => {
    expect(job(mentionFb)).toEqual({ kind: 'mention', eventId: 'c:17894227972186120', commentId: '17894227972186120', mediaId: '17918195224117851' });
    expect(job(mentionIgLogin())).toMatchObject({ kind: 'mention', commentId: '1801', mediaId: '17918195224117851', from: { username: 'fan.one' } });
    expect(parseWebhook(mentionIgLogin('nice reel'), OURS).jobs).toHaveLength(0);
    expect(parseWebhook(mentionIgLogin('@tigerworkoutsfan hi'), OURS).jobs).toHaveLength(0);
    expect(parseWebhook(mentionIgLogin('@tigerworkouts', { id: OURS.id, username: 'tigerworkouts' }), OURS).jobs).toHaveLength(0);
    expect(job(dmReel())).toEqual({ kind: 'dm', eventId: 'd:aWdfZAG1faXRlbToxOklH', senderId: '5551', share: { mediaId: '17918195224117851', url: expect.stringContaining('lookaside'), title: 'Leg day finisher' }, text: undefined });
    expect(parseWebhook(dmEcho, OURS).jobs).toHaveLength(0);
    expect(parseWebhook({ object: 'page', entry: [] }, OURS).jobs).toHaveLength(0);
  });

  it('one post however its link is written', () => {
    expect(shortcode('https://www.instagram.com/reel/C9xYz123/?igsh=abc')).toBe('C9xYz123');
    expect(shortcode('https://instagram.com/coach.amy/reel/C9xYz123')).toBe('C9xYz123');
    expect(shortcode('https://www.instagram.com/p/C9xYz123/')).toBe('C9xYz123');
  });
});

describe('pipeline', () => {
  it('a new reel: one Claude call, a pending private import credited to the creator, a reply with the link', async () => {
    await handleJob(job(mentionFb), deps());
    expect(extracts).toBe(1);
    expect(tables.workouts).toHaveLength(1);
    const row = tables.workouts[0];
    expect(row).toMatchObject({ owner: NICK, public: false, creator: 'coach.amy' });
    expect((row.data as Runsheet).source).toMatchObject({ kind: 'social', handle: 'coach.amy', platform: 'instagram', url: reel.permalink, review: 'pending' });
    expect(sent).toEqual([{ kind: 'comment', to: '17894227972186120', text: expect.stringContaining('@coach.amy') }]);
    expect(link(sent[0].text)).toBe(row.id);
  });

  it('a retried delivery is answered once; another request for the same reel reuses the workout without Claude', async () => {
    await handleJob(job(mentionFb), deps());
    await handleJob(job(mentionFb), deps());
    expect(sent).toHaveLength(1);
    await handleJob(job(dmReel()), deps());
    expect(extracts).toBe(1);
    expect(tables.workouts).toHaveLength(1);
    expect(sent[1]).toMatchObject({ kind: 'dm', to: { id: '5551' } });
    expect(link(sent[1].text)).toBe(tables.workouts[0].id);
  });

  it('a caption with no workout: polite reply, nothing saved, and the same reel never goes to Claude again', async () => {
    extractResult = async () => ({ found: false, reason: 'teaser', calls: 1 });
    await handleJob(job(mentionFb), deps());
    await handleJob(job(mentionIgLogin()), deps());
    expect(extracts).toBe(1);
    expect(tables.workouts).toHaveLength(0);
    expect(sent.map(s => s.text)).toEqual([REPLIES.none, REPLIES.none]);
  });

  it('a throttled comment reply falls back to a private reply', async () => {
    graphMock.replyToMention = async () => {
      throw new GraphError(400, 4, 'Application request limit reached');
    };
    await handleJob(job(mentionFb), deps());
    expect(sent).toEqual([{ kind: 'dm', to: { comment_id: '17894227972186120' }, text: expect.stringContaining('/i/') }]);
  });

  it('a reel it cannot read, and a plain DM, get a short answer (the plain DM once a day)', async () => {
    graphMock.media = async () => ({ id: 'x' });
    await handleJob(job(dmReel('m1')), deps());
    const plain = { object: 'instagram', entry: [{ id: OURS.id, messaging: [{ sender: { id: '777' }, recipient: { id: OURS.id }, message: { mid: 'p1', text: 'hi' } }] }] };
    await handleJob(job(plain), deps());
    await handleJob(job({ ...plain, entry: [{ ...plain.entry[0], messaging: [{ ...plain.entry[0].messaging[0], message: { mid: 'p2', text: 'hello?' } }] }] }), deps());
    expect(sent.map(s => s.text)).toEqual([REPLIES.unreadable, REPLIES.help]);
    expect(extracts).toBe(0);
  });

  it('rate limits: per requester per hour, and new reels per day', async () => {
    const t = 1_800_000_000_000;
    for (let i = 0; i < LIMITS.perRequesterHour + 2; i++) await handleJob(job(dmReel(`r${i}`, '42')), deps({ now: () => t }));
    expect(sent).toHaveLength(LIMITS.perRequesterHour);
    await kv.put(`ig:rl:claude:${Math.floor(t / 86400_000)}`, String(LIMITS.newReelsDay));
    graphMock.media = async () => ({ ...reel, id: 'new-reel', permalink: 'https://www.instagram.com/reel/NEWREEL1/' });
    await handleJob(job(dmReel('fresh', '43')), deps({ now: () => t }));
    expect(sent.at(-1)?.text).toBe(REPLIES.busy);
  });

  it('without Claude or the owner connected, a new reel is logged and left unanswered', async () => {
    await handleJob(job(mentionFb), deps({ extract: null }));
    await handleJob(job(mentionIgLogin()), deps({ db: async () => null }));
    expect(sent).toHaveLength(0);
    expect(tables.workouts).toHaveLength(0);
  });
});

describe('pending imports and the queue', () => {
  const importOne = async () => {
    await handleJob(job(mentionFb), deps());
    return tables.workouts[0].id as string;
  };

  it('pending: the link opens for anyone (share link), but no creator page, Discover or search lists it until approved', async () => {
    const id = await importOne();
    const before = await resolveShortLink(id, as(NICK));
    expect(before).toEqual({ to: expect.stringContaining('https://tigerworkouts.com/#/import/') });
    // Someone else: not in public workouts or search, and the creator page has nothing.
    const theirs = await T.listWorkouts(as(OTHER), { scope: 'public', query: 'coach.amy' });
    expect(theirs.total).toBe(0);
    expect(creditedCreators(tables.workouts.map(r => workoutFromRow(r as never))).get('coach-amy')).toBeUndefined();

    await T.approveImport(as(NICK), { id }, { admin: true });
    expect(tables.workouts[0].public).toBe(true);
    expect((tables.workouts[0].data as Runsheet).source?.review).toBeUndefined();
    expect((await T.listWorkouts(as(OTHER), { scope: 'public', query: 'coach.amy' })).total).toBe(1);
    expect(creditedCreators(tables.workouts.map(r => workoutFromRow(r as never))).get('coach-amy')?.workouts).toHaveLength(1);
    expect(await resolveShortLink(id, as(NICK))).toEqual({ to: `https://tigerworkouts.com/#/w/${id}` });
  });

  it('list, reject: rejected is deleted, its link is not available and the bot says so for that reel', async () => {
    const id = await importOne();
    const q = await T.listPendingImports(as(NICK), { admin: true });
    expect(q.imports.map(i => i.id)).toEqual([id]);
    expect(q.imports[0].adaptedFrom).toMatchObject({ handle: 'coach.amy' });
    await T.rejectImport(as(NICK), { id }, { admin: true });
    expect(tables.workouts).toHaveLength(0);
    expect(await resolveShortLink(id, as(NICK))).toEqual({ status: 404 });
    await handleJob(job(mentionIgLogin()), deps());
    expect(sent.at(-1)?.text).toBe(REPLIES.gone);
    expect(extracts).toBe(1);
  });

  it('the queue is admins only, and its tools are listed only to admins', async () => {
    const id = await importOne();
    await expect(T.listPendingImports(as(NICK), {})).rejects.toThrow(T.NOT_ADMIN_QUEUE);
    await expect(T.approveImport(as(NICK), { id }, {})).rejects.toThrow(T.NOT_ADMIN_QUEUE);
    await expect(T.rejectImport(as(NICK), { id }, { admin: false })).rejects.toThrow(T.NOT_ADMIN_QUEUE);
    await expect(T.approveImport(as(NICK), { id: 'u-nope' }, { admin: true })).rejects.toThrow(/not in the import queue/);
    const tools = async (admin: boolean) => {
      const res = await handleMcp(new Request('https://mcp.test/mcp', { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }) }), as(NICK), { admin });
      return ((await res.json()) as { result: { tools: { name: string }[] } }).result.tools.map(t => t.name);
    };
    expect(await tools(true)).toEqual(expect.arrayContaining(['list_pending_imports', 'approve_import', 'reject_import']));
    expect(await tools(false)).not.toContain('list_pending_imports');
  });

  it('the short link route redirects through the connected owner session', async () => {
    const id = await importOne();
    const ctx = { waitUntil: () => {} } as unknown as ExecutionContext;
    const res0 = await botFetch(new Request(`${ORIGIN}/i/${id}`), { OAUTH_KV: kv }, ctx);
    expect(res0.status).toBe(503); // owner never connected
    await kv.put(SESSION_KEY, JSON.stringify({ userId: NICK, accessToken: tokenFor(NICK), refreshToken: 'r', expiresAt: Date.now() / 1000 + 3600 }));
    const orig = globalThis.fetch;
    globalThis.fetch = fake.fetch as typeof fetch;
    try {
      const res = await botFetch(new Request(`${ORIGIN}/i/${id}`), { OAUTH_KV: kv }, ctx);
      expect(res.status).toBe(302);
      expect(res.headers.get('location')).toMatch(/#\/import\//);
    } finally {
      globalThis.fetch = orig;
    }
  });
});

describe('Claude extraction (API mocked)', () => {
  const claude = (...replies: string[]) => {
    const bodies: { model: string; system: { cache_control?: unknown }[]; messages: unknown[] }[] = [];
    const f = async (_url: RequestInfo | URL, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body)));
      const text = replies.shift() ?? '{}';
      return Response.json({ id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-haiku-5-5', content: [{ type: 'text', text }], stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 10, output_tokens: 10 } });
    };
    return { f: f as typeof fetch, bodies };
  };

  it('a valid reply becomes a checked runsheet in one call, with the library in a cached system prompt', async () => {
    const c = claude(JSON.stringify({ found: true, workout: goodWorkout }));
    const out = await extractWorkout({ caption: CAPTION, apiKey: 'k', fetch: c.f });
    expect(out).toMatchObject({ found: true, calls: 1 });
    if (out.found) expect(out.runsheet.items[0]).toMatchObject({ kind: 'block', repeat: 3 });
    expect(c.bodies[0].model).toBe('claude-haiku-5-5');
    expect(c.bodies[0].system[0].cache_control).toEqual({ type: 'ephemeral' });
    expect(JSON.stringify(c.bodies[0].system)).toContain('bw_burpee | ');
    expect(JSON.stringify(c.bodies[0].messages)).toContain('<caption>');
  });

  it('an unknown exercise key gets one repair turn listing the problem', async () => {
    const bad = { ...goodWorkout, items: [{ ...goodWorkout.items[0], steps: [{ kind: 'exercise', exercise: 'burpeez', forMode: 'reps', forValue: 10 }] }] };
    const c = claude(JSON.stringify({ found: true, workout: bad }), JSON.stringify({ found: true, workout: goodWorkout }));
    const out = await extractWorkout({ caption: CAPTION, apiKey: 'k', fetch: c.f });
    expect(out).toMatchObject({ found: true, calls: 2 });
    expect(JSON.stringify(c.bodies[1].messages)).toContain('unknown exercise key \\"burpeez\\"');
  });

  it('no workout, a second bad reply, and a copied caption', async () => {
    expect(await extractWorkout({ caption: 'link in bio', apiKey: 'k', fetch: claude('{"found": false, "reason": "Teaser only."}').f })).toEqual({ found: false, reason: 'Teaser only.', calls: 1 });
    await expect(extractWorkout({ caption: CAPTION, apiKey: 'k', fetch: claude('nope', 'still nope').f })).rejects.toThrow(/JSON/);
    const copied = { ...goodWorkout, description: 'Burpee blast 3 rounds 10 burpees 20 push ups 30s plank rest' };
    const out = await extractWorkout({ caption: CAPTION, apiKey: 'k', fetch: claude(JSON.stringify({ found: true, workout: copied })).f });
    expect(out.found && out.runsheet.description).toBeFalsy();
    expect(copiesCaption('Three rounds of three moves.', CAPTION)).toBe(false);
  });
});
