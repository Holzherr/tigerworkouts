/**
 * The anonymous sync-health ping (review A6): after a sync, a signed-in web app tells the MCP
 * worker (mcp/src/health.ts) whether syncing works, at most once an hour while it fails and once a
 * day while it works. No account, no error text: the app, its build, ok or not, how many rows wait,
 * a coarse kind of error, and minutes since the last good sync.
 */
const ENDPOINT = 'https://mcp.tigerworkouts.com/health/sync';
const KEY = 'tiger:health-ping';
const HOUR = 3600e3;
const DAY = 24 * HOUR;

export type ErrorKind = 'network' | 'auth' | 'refused' | 'server' | 'storage' | 'other';

/** A sync error message reduced to a kind; the text itself never leaves the device. */
export const errorKind = (msg: string): ErrorKind =>
  /fetch|network|offline|timed? ?out|load failed|connection/i.test(msg) ? 'network'
  : /jwt|token|auth|sign(ed)? ?in/i.test(msg) ? 'auth'
  : /row-level|policy|permission|refused|violates|constraint|duplicate/i.test(msg) ? 'refused'
  : /quota|storage/i.test(msg) ? 'storage'
  : /5\d\d|server|unavailable|gateway/i.test(msg) ? 'server'
  : 'other';

interface Sent {
  /** Last ping sent after a good sync, and after a failed one (ms). */
  ok?: number;
  fail?: number;
  /** Last good sync seen (ms). */
  lastOk?: number;
}

const read = (): Sent => {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '{}');
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
};
const write = (s: Sent) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* a full store: skip, the ping is not worth a byte of history */
  }
};

/** The body to send now, or null when nothing is due. Records what it decides. */
export const nextPing = (r: { error?: string; waiting: number }, build: string, now = Date.now()) => {
  const s = read();
  const ok = !r.error;
  if (ok) s.lastOk = now;
  const due = ok ? now - (s.ok ?? 0) >= DAY : now - (s.fail ?? 0) >= HOUR;
  if (due) s[ok ? 'ok' : 'fail'] = now;
  write(s);
  if (!due) return null;
  return {
    app: 'web' as const,
    build,
    ok,
    waiting: r.waiting,
    ...(r.error ? { error: errorKind(r.error) } : {}),
    ...(s.lastOk !== undefined ? { sinceOkMin: Math.round((now - s.lastOk) / 60e3) } : {}),
  };
};

/** Sent with sendBeacon (text/plain, no preflight, survives the page closing). Live site only. */
export const healthPing = (r: { error?: string; waiting: number }) => {
  if (typeof navigator === 'undefined' || !navigator.sendBeacon || location.hostname !== 'tigerworkouts.com') return;
  const body = nextPing(r, __BUILD__);
  if (body) navigator.sendBeacon(ENDPOINT, JSON.stringify(body));
};
