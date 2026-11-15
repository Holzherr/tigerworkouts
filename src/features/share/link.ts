/**
 * Share links as pure functions (no browser globals), so the MCP worker (mcp/) builds exactly the
 * links the app does. share.ts wraps these with the page's own origin.
 */
import type { Runsheet, Step } from '@/features/runsheet/model';
import { isRunsheet } from '@/features/runsheet/shape';

export const enc = (s: string) => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export const dec = (s: string) => decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/'))));

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

export const shareUrlAt = (r: Runsheet, base: string) => `${base}#/import/${enc(JSON.stringify(slim(r)))}`;

/** A link is anyone's input: a workout that is not the runsheet shape is refused here, before it is
 * saved, synced to the account and crashes every screen that lists it. */
export const decodeShared = (payload: string): Runsheet | null => {
  try {
    const r: unknown = JSON.parse(dec(payload));
    return isRunsheet(r) ? r : null;
  } catch {
    return null;
  }
};

