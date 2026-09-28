/**
 * Where the running session was started from, kept on the device beside the run (`tiger:run`) so a
 * reload, a Resume or "Save what I did" still logs it: the origin in App state does not survive a
 * reload. Keyed by the session id, so an origin left from an older run never lands on a new one.
 */
import type { SessionOrigin, SessionResult } from '@/features/runsheet/progression';

const KEY = 'tiger:run-from';

export const rememberOrigin = (sessionId: string, from: SessionOrigin | undefined) => {
  try {
    if (from) localStorage.setItem(KEY, JSON.stringify({ sessionId, from }));
    else localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
};

export const originOf = (sessionId: string): SessionOrigin | undefined => {
  try {
    const r = JSON.parse(localStorage.getItem(KEY) || 'null');
    return r?.sessionId === sessionId ? r.from : undefined;
  } catch {
    return undefined;
  }
};

/** The result with its origin, when one is known. */
export const withOrigin = <T extends Partial<SessionResult>>(res: T, from: SessionOrigin | undefined): T => (from ? { ...res, startedFrom: from } : res);
