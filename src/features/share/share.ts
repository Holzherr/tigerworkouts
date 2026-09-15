/** Share a workout as a link: the runsheet, base64 in the hash, no server needed. */
import type { SessionResult } from '@/features/runsheet/progression';
import type { Runsheet, Step } from '@/features/runsheet/model';

const enc = (s: string) => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const dec = (s: string) => decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/'))));

/** Strip clips and posters (they resolve from the library on the other side) to keep links short. */
const slim = (r: Runsheet): Runsheet => ({
  ...r,
  items: r.items.map(it => {
    const strip = (s: Step): Step => (s.kind === 'exercise' ? { ...s, exercise: { key: s.exercise.key, name: s.exercise.name, unit: s.exercise.unit, step: s.exercise.step } } : s);
    if (it.kind === 'block') return { ...it, steps: it.steps.map(strip) };
    if (it.kind === 'exercise') return strip(it);
    return it;
  }),
});

export const shareUrl = (r: Runsheet, base = location.origin + location.pathname) => `${base}#/import/${enc(JSON.stringify(slim(r)))}`;

export const decodeShared = (payload: string): Runsheet | null => {
  try {
    const r = JSON.parse(dec(payload)) as Runsheet;
    return r && Array.isArray(r.items) && r.title ? r : null;
  } catch {
    return null;
  }
};

/** Native share sheet when available, clipboard otherwise. Returns what happened for the toast. */
export const shareLink = async (title: string, url: string): Promise<'shared' | 'copied' | 'failed'> => {
  try {
    if (navigator.share) {
      await navigator.share({ title, url });
      return 'shared';
    }
    await navigator.clipboard.writeText(url);
    return 'copied';
  } catch {
    return 'failed';
  }
};

/** A session someone did away from the timer, as a link that lands on a confirm-and-save screen. */
export const logUrl = (r: SessionResult, base = location.origin + location.pathname) => `${base}#/log/${enc(JSON.stringify(r))}`;

export const decodeLogged = (payload: string): SessionResult | null => {
  try {
    const r = JSON.parse(dec(payload)) as SessionResult;
    return r && typeof r.startedAt === 'string' && Array.isArray(r.steps) ? r : null;
  } catch {
    return null;
  }
};
