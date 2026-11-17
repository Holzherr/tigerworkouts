/**
 * POST /health/sync: the apps' anonymous sync-health ping (review A6). A signed-in app sends one
 * when a sync fails (at most hourly) and one a day when syncs work, so a failing sync in the field
 * shows up in the worker's logs (observability, wrangler.jsonc) without anyone reporting it.
 *
 * Nothing identifies the person: no account, no address, no error text; only which app and build,
 * whether the last sync worked, how many rows wait, a coarse error kind and how long since the last
 * good sync. The IP is used for the per-minute limit only and not logged.
 */
import type { RateLimiter } from './limits';

export interface HealthEnv {
  /** Rate-limit binding for pings, per IP. */
  PING_LIMITER?: RateLimiter;
}

export const isHealthPath = (p: string) => p === '/health/sync';

const KINDS = ['network', 'auth', 'refused', 'server', 'storage', 'other'] as const;
const int = (v: unknown, max: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(max, Math.round(v))) : undefined);

/** The ping as logged: only known fields, bounded. Null when it is not a ping. */
export const readPing = (raw: string) => {
  let b: Record<string, unknown>;
  try {
    b = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!b || typeof b !== 'object' || (b.app !== 'web' && b.app !== 'ios') || typeof b.ok !== 'boolean') return null;
  return {
    app: b.app,
    build: typeof b.build === 'string' ? b.build.replace(/[^\w.+-]/g, '').slice(0, 40) : undefined,
    ok: b.ok,
    waiting: int(b.waiting, 100000),
    error: KINDS.find(k => k === b.error),
    sinceOkMin: int(b.sinceOkMin, 525600),
  };
};

const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'POST', 'access-control-allow-headers': 'content-type' };

export const healthFetch = async (request: Request, env: HealthEnv, log: (line: string) => void = console.log): Promise<Response> => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: CORS });
  const raw = await request.text();
  if (raw.length > 2000) return new Response('Too large', { status: 413, headers: CORS });
  const ping = readPing(raw);
  if (!ping) return new Response('Bad ping', { status: 400, headers: CORS });
  if (env.PING_LIMITER) {
    const ok = await env.PING_LIMITER.limit({ key: `ping:${request.headers.get('cf-connecting-ip') ?? 'unknown'}` }).then(r => r.success, () => true);
    if (!ok) return new Response(null, { status: 429, headers: CORS });
  }
  log(JSON.stringify({ event: 'sync-health', ...ping }));
  return new Response(null, { status: 204, headers: CORS });
};
