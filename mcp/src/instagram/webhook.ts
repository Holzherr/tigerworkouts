/**
 * Meta webhooks for the @tigerworkouts Instagram account: the GET verification handshake, the
 * X-Hub-Signature-256 check, and turning a POST body into jobs for the pipeline. Payload shapes are
 * Meta's own examples (specs/instagram-bot.md); test/instagram.test.ts replays them.
 */

/** Something to answer: a comment that @mentions us under a reel, or a reel shared to us by DM. */
export type Job =
  | { kind: 'mention'; eventId: string; commentId?: string; mediaId: string; from?: { id?: string; username?: string } }
  | { kind: 'dm'; eventId: string; senderId: string; share?: { mediaId?: string; url?: string; title?: string }; text?: string };

/** GET ?hub.mode=subscribe&hub.verify_token=…&hub.challenge=…: echo the challenge when the token is ours. */
export const verifyHandshake = (url: URL, verifyToken: string | undefined): Response => {
  const mode = url.searchParams.get('hub.mode');
  const token = url.searchParams.get('hub.verify_token');
  const challenge = url.searchParams.get('hub.challenge');
  if (!verifyToken) return new Response('Not configured', { status: 503 });
  if (mode === 'subscribe' && challenge && token !== null && safeEqual(token, verifyToken)) return new Response(challenge, { headers: { 'content-type': 'text/plain' } });
  return new Response('Forbidden', { status: 403 });
};

/** Constant-time string compare (lengths may differ; that alone is not secret). */
export const safeEqual = (a: string, b: string) => {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
};

const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');

/** X-Hub-Signature-256 is "sha256=" + HMAC-SHA256 of the raw body, keyed with the app secret. */
export const signatureOk = async (rawBody: string, header: string | null, appSecret: string): Promise<boolean> => {
  if (!header?.startsWith('sha256=')) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(appSecret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = hex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody)));
  return safeEqual(sig, header.slice(7).toLowerCase());
};

interface Change {
  field: string;
  value: { comment_id?: string; media_id?: string; id?: string; text?: string; from?: { id?: string; username?: string }; media?: { id?: string } };
}
interface Messaging {
  sender?: { id?: string };
  recipient?: { id?: string };
  message?: { mid?: string; text?: string; is_echo?: boolean; is_self?: boolean; is_deleted?: boolean; attachments?: { type?: string; payload?: { url?: string; title?: string; ig_post_media_id?: string; reel_video_id?: string | number } }[] };
}
interface Body {
  object?: string;
  entry?: { id?: string; changes?: Change[]; messaging?: Messaging[] }[];
}

const SHARE_TYPES = new Set(['ig_reel', 'reel', 'ig_post', 'share']);

/**
 * Jobs in a webhook body. `ourId` is our IG user id and `ourUsername` our handle, so our own replies
 * (echoes, our comments) never become jobs. Anything else is ignored and reported in `skipped`.
 */
export const parseWebhook = (body: unknown, ours: { id?: string; username: string }): { jobs: Job[]; skipped: string[] } => {
  const jobs: Job[] = [];
  const skipped: string[] = [];
  const b = body as Body;
  if (b?.object !== 'instagram') return { jobs, skipped: [`object ${String(b?.object)}`] };
  const mentionRe = new RegExp(`(^|[^\\w.])@${ours.username.replace(/\./g, '\\.')}(?![\\w.])`, 'i');
  for (const e of b.entry ?? []) {
    for (const c of e.changes ?? []) {
      const v = c.value ?? {};
      if (c.field === 'mentions' && v.media_id) {
        // Facebook Login: a comment mention carries comment_id and media_id; a caption mention only media_id.
        jobs.push({ kind: 'mention', eventId: `c:${v.comment_id ?? `m${v.media_id}`}`, commentId: v.comment_id, mediaId: v.media_id });
      } else if (c.field === 'comments' && v.id && v.media?.id && mentionRe.test(v.text ?? '')) {
        // Instagram Login folds mentions into comments: {id, from, text, media}.
        if (v.from?.id === ours.id || v.from?.username?.toLowerCase() === ours.username.toLowerCase()) skipped.push(`own comment ${v.id}`);
        else jobs.push({ kind: 'mention', eventId: `c:${v.id}`, commentId: v.id, mediaId: v.media.id, from: v.from });
      } else skipped.push(`change ${c.field}`);
    }
    for (const m of e.messaging ?? []) {
      const msg = m.message;
      const from = m.sender?.id;
      if (!msg?.mid || !from) {
        skipped.push('messaging event without a message');
        continue;
      }
      if (msg.is_echo || msg.is_self || from === ours.id || from === e.id) {
        skipped.push(`echo ${msg.mid}`);
        continue;
      }
      if (msg.is_deleted) {
        skipped.push(`deleted ${msg.mid}`);
        continue;
      }
      const a = msg.attachments?.find(x => SHARE_TYPES.has(x.type ?? ''));
      const p = a?.payload;
      const mediaId = p?.ig_post_media_id ?? (p?.reel_video_id !== undefined ? String(p.reel_video_id) : undefined);
      jobs.push({ kind: 'dm', eventId: `d:${msg.mid}`, senderId: from, ...(a ? { share: { mediaId, url: p?.url, title: p?.title } } : {}), text: msg.text });
    }
  }
  return { jobs, skipped };
};
