/**
 * Limits on the sign-in endpoints that create accounts or send email (review A5, 17 Nov 2026).
 *
 * Two layers, both per key (an IP address, or a user id where the caller is the assistant's server):
 *  - a Cloudflare rate-limit binding (wrangler.jsonc "ratelimits"): a burst limit per minute;
 *  - a day count in KV: a ceiling per day.
 * A missing binding (tests, `wrangler dev`) skips that layer; a failing one lets the call through,
 * so a Cloudflare hiccup never locks people out of signing in.
 */

export interface RateLimiter {
  limit(o: { key: string }): Promise<{ success: boolean }>;
}

export interface LimitEnv {
  OAUTH_KV: KVNamespace;
  /** "Start now" (anonymous account): per IP. */
  SIGNUP_LIMITER?: RateLimiter;
  /** Claim emails: per IP on /claim, per user for claim_account. */
  CLAIM_LIMITER?: RateLimiter;
}

export type LimitKind = 'signup' | 'claim';

/** Most a key may do in a day. */
export const DAY_CAP: Record<LimitKind, number> = { signup: 10, claim: 5 };

const binding = (env: LimitEnv, kind: LimitKind) => (kind === 'signup' ? env.SIGNUP_LIMITER : env.CLAIM_LIMITER);

/** The caller's IP as Cloudflare saw it. */
export const clientIp = (req: Request) => req.headers.get('cf-connecting-ip') ?? 'unknown';

/** True when the call may go ahead; counts it. */
export const allow = async (env: LimitEnv, kind: LimitKind, key: string, now = Date.now()): Promise<boolean> => {
  const b = binding(env, kind);
  if (b) {
    try {
      if (!(await b.limit({ key: `${kind}:${key}` })).success) return false;
    } catch {
      /* binding unavailable: fall through to the day count */
    }
  }
  const day = new Date(now).toISOString().slice(0, 10);
  const k = `limit:${kind}:${day}:${key}`;
  const n = Number((await env.OAUTH_KV.get(k)) ?? 0);
  if (n >= DAY_CAP[kind]) return false;
  await env.OAUTH_KV.put(k, String(n + 1), { expirationTtl: 2 * 86400 });
  return true;
};

/** Wrong codes allowed per code sent; the next wrong one ends the sign-in. */
export const CODE_TRIES = 5;
