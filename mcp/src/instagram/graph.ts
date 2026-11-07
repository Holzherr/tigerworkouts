/**
 * The few Instagram Graph API calls the bot makes. Endpoints and fields are sourced in
 * specs/instagram-bot.md (Meta's docs, checked 7 Nov 2026); the host and version are vars so the
 * Instagram Login host (graph.instagram.com) can replace the Facebook Login one without a code change.
 */

type Fetch = typeof fetch;

export interface GraphConfig {
  /** Long-lived token for the @tigerworkouts account (secret). */
  token: string;
  /** The @tigerworkouts IG user id: the node every call hangs off. */
  accountId: string;
  /** Default https://graph.facebook.com/v27.0. */
  base?: string;
  /** Node DMs are sent from. Default accountId; with Facebook Login it is the linked Page's id. */
  sendNode?: string;
}

/** The reel (or post) someone asked about, as far as the API tells us. */
export interface Media {
  id: string;
  caption?: string;
  permalink?: string;
  /** The owner's username (the API returns username, not owner, for media we did not post). */
  username?: string;
  mediaType?: string;
}

export class GraphError extends Error {
  constructor(
    readonly status: number,
    readonly code: number | undefined,
    message: string,
  ) {
    super(message);
  }
  /** Meta's throttling codes (4, 17, 32, 613) or HTTP 429. */
  get rateLimited() {
    return this.status === 429 || [4, 17, 32, 613].includes(this.code ?? -1);
  }
}

const MEDIA_FIELDS = 'id,caption,permalink,username,media_type';

interface RawMedia {
  id: string;
  caption?: string;
  permalink?: string;
  username?: string;
  media_type?: string;
}
const toMedia = (m: RawMedia): Media => ({ id: m.id, caption: m.caption, permalink: m.permalink, username: m.username, mediaType: m.media_type });

export const graph = (c: GraphConfig, f: Fetch = fetch) => {
  const base = (c.base || 'https://graph.facebook.com/v27.0').replace(/\/+$/, '');
  const call = async <T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> => {
    const res = await f(`${base}/${path}`, { method, headers: { authorization: `Bearer ${c.token}`, ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const text = await res.text();
    const json = (text ? JSON.parse(text) : {}) as T & { error?: { message?: string; code?: number } };
    if (!res.ok || json.error) throw new GraphError(res.status, json.error?.code, json.error?.message ?? res.statusText);
    return json;
  };
  const id = (s: string) => encodeURIComponent(s);
  return {
    /** A comment that @mentions us, with the media it sits under (mentioned_comment). */
    async mentionedComment(commentId: string): Promise<{ text?: string; media?: Media }> {
      const r = await call<{ mentioned_comment?: { text?: string; media?: RawMedia } }>('GET', `${id(c.accountId)}?fields=${encodeURIComponent(`mentioned_comment.comment_id(${commentId}){id,text,timestamp,media{${MEDIA_FIELDS}}}`)}`);
      const m = r.mentioned_comment;
      return { text: m?.text, media: m?.media ? toMedia(m.media) : undefined };
    },
    /** Media whose caption @mentions us (mentioned_media). */
    async mentionedMedia(mediaId: string): Promise<Media | undefined> {
      const r = await call<{ mentioned_media?: RawMedia }>('GET', `${id(c.accountId)}?fields=${encodeURIComponent(`mentioned_media.media_id(${mediaId}){${MEDIA_FIELDS}}`)}`);
      return r.mentioned_media ? toMedia(r.mentioned_media) : undefined;
    },
    /** A media object by id: works for our own media; for other people's it is unconfirmed (spec, open questions). */
    async media(mediaId: string): Promise<Media> {
      return toMedia(await call<RawMedia>('GET', `${id(mediaId)}?fields=${MEDIA_FIELDS}`));
    },
    /** Reply in the thread of a comment that mentioned us (POST /{ig-user-id}/mentions). */
    replyToMention: (a: { mediaId: string; commentId?: string; message: string }) => call<{ id: string }>('POST', `${id(c.accountId)}/mentions`, { media_id: a.mediaId, ...(a.commentId ? { comment_id: a.commentId } : {}), message: a.message }),
    /** A DM: to a person who messaged us (IGSID), or a private reply to a comment (comment_id). */
    sendMessage: (to: { id: string } | { comment_id: string }, text: string) => call<{ message_id?: string }>('POST', `${id(c.sendNode || c.accountId)}/messages`, { recipient: to, message: { text } }),
  };
};
export type Graph = ReturnType<typeof graph>;

/** "https://www.instagram.com/reel/C9xYz123/?igsh=…" → "C9xYz123": one post however the link is written. */
export const shortcode = (url: string | undefined): string | undefined => url?.match(/instagram\.com\/(?:[\w.]+\/)?(?:reels?|p|tv)\/([\w-]{5,})/i)?.[1];
