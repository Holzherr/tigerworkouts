import { uid, type Item, type Runsheet, type Step } from './model';

/**
 * The name a duplicate is offered: the week number counted on when the name ends in one ("Hip
 * thrust focus week 1" → "… week 2", "Legs Wk 3" → "Legs Wk 4"), else "(copy)". Port of
 * `Edit.nextTitle` in Editing.swift.
 */
export const nextTitle = (title: string): string => {
  const t = title.trim();
  const m = /^(.*?\b(?:week|wk|w)[\s.]*)(\d+)$/i.exec(t);
  if (m) return `${m[1]}${Number(m[2]) + 1}`;
  return t ? `${t} (copy)` : 'Untitled (copy)';
};

const fresh = (s: Step): Step => ({ ...s, id: uid(s.kind === 'rest' ? 'r' : 'e') });

/**
 * Duplicate for next week, in the workout's ⋯ menu: a workout of its own beside the original. Fresh
 * block and step ids, because a session keys its loads by step id and two workouts must not share
 * them; no `copyOf`, so the original keeps its own history and its place in Mine; `duplicatedFrom`
 * keeps the thread for the week-by-week view. Port of `Edit.duplicateForNextWeek`.
 */
export const duplicateForNextWeek = (r: Runsheet, id: string, creator?: string): Runsheet => {
  const items: Item[] = r.items.map(it => (it.kind === 'block' ? { ...it, id: uid('b'), steps: it.steps.map(fresh) } : it.kind === 'ref' ? { ...it, id: uid('i') } : (fresh(it) as Item)));
  const title = nextTitle(r.title);
  const { copyOf: _c, program: _p, public: _pub, unlisted: _u, ownerId: _o, ...rest } = r;
  return { ...rest, id, title, creator: creator ?? r.creator, source: { title: r.title, author: creator, kind: 'user' }, duplicatedFrom: r.id ?? r.title, createdAt: new Date().toISOString(), items };
};
