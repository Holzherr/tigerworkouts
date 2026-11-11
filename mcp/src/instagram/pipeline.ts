/**
 * One job from the webhook, start to reply: answer each comment or DM at most once, find the reel,
 * reuse the workout when that reel was imported before (no second Claude call), otherwise adapt the
 * caption, save it as a pending credited import owned by the import owner, and reply with its link.
 */
import { workoutFromRow } from '@/features/cloud/rows';
import { cleanHandle, HANDLE_RE } from '@/features/creators/credited';
import type { Db } from '../supabase';
import { creditFrom, insertCredited, previewUrl, SITE } from '../tools';
import type { Extraction } from './extract';
import { GraphError, shortcode, type Graph, type Media } from './graph';
import type { Job } from './webhook';

export interface Deps {
  kv: KVNamespace;
  graph: Graph;
  /** The import owner's Supabase access (null: the bot is not connected at /bot/connect). */
  db: () => Promise<Db | null>;
  /** null when ANTHROPIC_API_KEY is not set: known reels are still answered, new ones are not. */
  extract: ((caption: string) => Promise<Extraction>) | null;
  /** Where short links live: https://mcp.tigerworkouts.com */
  origin: string;
  now?: () => number;
}

export const LIMITS = {
  /** Requests answered per person (a DM sender) or per reel (a comment mention), per hour. */
  perRequesterHour: 5,
  /** Replies of any kind, per hour, across everyone. */
  repliesHour: 200,
  /** New reels sent to Claude per day, across everyone. */
  newReelsDay: 100,
};

const DAY = 86400;
export const log = (event: string, data: Record<string, unknown> = {}) => console.log(JSON.stringify({ ig: event, ...data }));

export const shortLink = (origin: string, id: string) => `${origin}/i/${encodeURIComponent(id)}`;

export const REPLIES = {
  found: (handle: string, link: string) => `Here's the workout from @${handle}'s post, ready to run with a timer: ${link}`,
  none: "Sorry, I couldn't find a workout written out in this post's caption, so I didn't save anything.",
  gone: "Sorry, that workout isn't available on TigerWorkouts.",
  unreadable: "Sorry, I couldn't open that post. Try commenting @tigerworkoutsdotcom under the reel instead.",
  busy: "Lots of requests right now. Please try again in a little while.",
  help: 'Share a workout reel with me and I will send back a link to the workout with a timer.',
};

interface Known {
  workoutId?: string;
  none?: true;
}

/** A KV counter for a window; returns the count after this hit. Not atomic, which is fine for a limit. */
const hit = async (kv: KVNamespace, key: string, ttl: number) => {
  const n = Number((await kv.get(key)) ?? 0) + 1;
  await kv.put(key, String(n), { expirationTtl: Math.max(60, ttl) });
  return n;
};

export const handleJob = async (job: Job, d: Deps) => {
  const now = d.now?.() ?? Date.now();
  const hour = Math.floor(now / 3600_000);
  const day = Math.floor(now / 86400_000);

  // Never twice for one comment or message, whatever Meta retries.
  const eventKey = `ig:event:${job.eventId}`;
  if (await d.kv.get(eventKey)) return log('duplicate', { event: job.eventId });
  await d.kv.put(eventKey, String(now), { expirationTtl: 30 * DAY });
  log('job', { ...job });

  const requester = job.kind === 'dm' ? `u:${job.senderId}` : job.from?.id ? `u:${job.from.id}` : `m:${job.mediaId}`;
  if ((await hit(d.kv, `ig:rl:${requester}:${hour}`, 3600)) > LIMITS.perRequesterHour) return log('rate limited', { requester });

  const reply = async (text: string) => {
    if ((await hit(d.kv, `ig:rl:replies:${hour}`, 3600)) > LIMITS.repliesHour) return log('reply cap reached', { event: job.eventId });
    try {
      if (job.kind === 'dm') await d.graph.sendMessage({ id: job.senderId }, text);
      else {
        try {
          await d.graph.replyToMention({ mediaId: job.mediaId, commentId: job.commentId, message: text });
        } catch (e) {
          // Comment replies throttled or refused: answer the commenter privately instead.
          if (!job.commentId) throw e;
          log('comment reply failed, trying a private reply', { event: job.eventId, error: (e as Error).message });
          await d.graph.sendMessage({ comment_id: job.commentId }, text);
        }
      }
      log('replied', { event: job.eventId, text });
    } catch (e) {
      log('reply failed', { event: job.eventId, error: (e as Error).message, code: e instanceof GraphError ? e.code : undefined });
    }
  };

  // ── which reel ──
  let media: Media | undefined;
  try {
    if (job.kind === 'mention') media = job.commentId ? (await d.graph.mentionedComment(job.commentId)).media : await d.graph.mentionedMedia(job.mediaId);
    else if (job.share?.mediaId) media = await d.graph.media(job.share.mediaId).catch(() => ({ id: job.share!.mediaId!, caption: job.share!.title }));
    else if (!job.share) {
      // A plain DM: say what the bot does, at most once a day per person.
      if (await d.kv.get(`ig:help:${job.senderId}`)) return log('no share, help already sent', { event: job.eventId });
      await d.kv.put(`ig:help:${job.senderId}`, '1', { expirationTtl: DAY });
      return reply(REPLIES.help);
    }
  } catch (e) {
    log('media lookup failed', { event: job.eventId, error: (e as Error).message });
  }
  const handle = cleanHandle(media?.username ?? '');
  const code = shortcode(media?.permalink);
  if (!media?.id || !media.permalink || !HANDLE_RE.test(handle)) {
    log('reel unreadable', { event: job.eventId, media });
    return reply(REPLIES.unreadable);
  }

  // ── seen this reel before? ──
  const keys = [`ig:media:${media.id}`, ...(code ? [`ig:post:${code}`] : [])];
  let known: Known | null = null;
  for (const k of keys) known ??= (await d.kv.get(k, 'json')) as Known | null;
  if (known?.none) return reply(REPLIES.none);
  if (known?.workoutId) {
    const db = await d.db();
    if (db) {
      const rows = await db.get<unknown[]>(`workouts?id=eq.${encodeURIComponent(known.workoutId)}&select=id`).catch(() => null);
      if (rows && !rows.length) return reply(REPLIES.gone); // rejected
    }
    log('reused', { event: job.eventId, workout: known.workoutId });
    return reply(REPLIES.found(handle, shortLink(d.origin, known.workoutId)));
  }

  // ── a new reel: one Claude call ──
  const db = await d.db();
  if (!d.extract || !db) return log('not configured: new reel left unanswered', { event: job.eventId, claude: !!d.extract, owner: !!db });
  if ((await hit(d.kv, `ig:rl:claude:${day}`, DAY)) > LIMITS.newReelsDay) {
    log('daily new-reel cap reached', { event: job.eventId });
    return reply(REPLIES.busy);
  }
  const remember = (v: Known) => Promise.all(keys.map(k => d.kv.put(k, JSON.stringify(v))));
  const caption = (media.caption ?? '').trim();
  let out: Extraction;
  try {
    out = caption ? await d.extract(caption) : { found: false, reason: 'empty caption', calls: 0 };
  } catch (e) {
    log('extraction failed', { event: job.eventId, error: (e as Error).message });
    return reply(REPLIES.none);
  }
  log('extracted', { event: job.eventId, found: out.found, calls: out.calls, ...(out.found ? {} : { reason: out.reason }) });
  if (!out.found) {
    await remember({ none: true });
    return reply(REPLIES.none);
  }
  const credit = creditFrom({ url: media.permalink, author: handle, handle, platform: 'instagram' }, { admin: true });
  const saved = await insertCredited(db, out.runsheet, credit, { public: false, pending: true });
  await remember({ workoutId: saved.id });
  log('saved pending', { event: job.eventId, workout: saved.id, handle });
  return reply(REPLIES.found(handle, shortLink(d.origin, saved.id)));
};

/** /i/<id>: the link the bot hands out. Pending → the share link (opens for anyone, no sign-in);
 * approved → the workout page; rejected or unknown → not available. */
export const resolveShortLink = async (id: string, db: Db | null): Promise<{ to: string } | { status: number }> => {
  if (!db) return { status: 503 };
  const rows = await db.get<{ id: string; owner: string; creator: string | null; title: string | null; public: boolean; data: unknown }[]>(`workouts?id=eq.${encodeURIComponent(id)}&select=id,owner,creator,title,public,data`);
  const row = rows?.[0];
  if (!row) return { status: 404 };
  const r = workoutFromRow(row);
  if (r.source?.kind !== 'social') return { status: 404 };
  return { to: row.public ? `${SITE}#/w/${encodeURIComponent(id)}` : previewUrl(r) };
};
