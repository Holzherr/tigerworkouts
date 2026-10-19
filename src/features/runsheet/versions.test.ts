import { describe, expect, it } from 'vitest';
import { EX, priyanka } from './fixtures';
import { makeExercise, type Block, type Runsheet } from './model';
import type { SessionResult } from './progression';
import { changesFrom, fingerprint, mergeSessions, unseeded, versionOf, versionsOf } from './versions';

const base = priyanka();
const blocks = (r: Runsheet) => r.items.filter((i): i is Block => i.kind === 'block');
/** The same workout as the app starts it: last time's loads in, nothing else. */
const seeded = (r: Runsheet, kg = 32): Runsheet => ({ ...r, items: r.items.map(it => (it.kind === 'block' ? { ...it, steps: it.steps.map(s => (s.kind === 'exercise' && s.exercise.key === 'kb_swing' ? { ...s, target: kg } : s)) } : it)) });
const swingsLast = (r: Runsheet): Runsheet => ({ ...r, items: [r.items[1], r.items[0], ...r.items.slice(2)] });
const session = (at: string, extra: Partial<SessionResult> = {}): SessionResult => ({ id: `s-${at}`, runsheetId: base.id!, startedAt: at, steps: [], ...extra });

describe('versionOf', () => {
  it('is nothing when only the loads the app filled in differ', () => {
    const auto = seeded(base);
    expect(versionOf(auto, auto, base)).toBeUndefined();
  });

  it('keeps a reorder, with the filled-in loads put back to the base', () => {
    const auto = seeded(base);
    const v = versionOf(swingsLast(auto), auto, base)!;
    expect(v).toBeDefined();
    expect(fingerprint(v.items)).toBe(fingerprint(swingsLast(base).items));
  });

  it('keeps a load somebody set', () => {
    const auto = seeded(base);
    const heavier = seeded(base, 36);
    const v = versionOf(heavier, auto, base)!;
    const swing = blocks({ ...base, items: v.items })[0].steps[0];
    expect(swing.kind === 'exercise' && swing.target).toBe(36);
  });

  it('ignores ids: a list rebuilt with fresh ids is the same list', () => {
    const fresh = { ...base, items: base.items.map(it => ({ ...it, id: `${it.id}-new` })) };
    expect(fingerprint(fresh.items)).toBe(fingerprint(base.items));
  });
});

describe('unseeded', () => {
  it('leaves a step the base does not have as it is', () => {
    const extra = { ...makeExercise(EX.db_rdl, { target: 16 }), id: 'x1' };
    const items = unseeded([...base.items, extra], base, base);
    expect(items.at(-1)).toEqual(extra);
  });
});

describe('versionsOf', () => {
  const v1 = { items: swingsLast(base).items };
  const v2 = { items: [...base.items, { ...makeExercise(EX.db_rdl, { target: 16 }), id: 'x1' }] };
  it('groups sessions that ran the same version, newest first, and leaves out plain runs', () => {
    const rows = versionsOf([session('2026-10-01', { version: v1 }), session('2026-10-03', { version: v2 }), session('2026-10-05', { version: v1 }), session('2026-10-06')], base);
    expect(rows.map(r => [r.sessions, r.lastDone])).toEqual([
      [2, '2026-10-05'],
      [1, '2026-10-03'],
    ]);
    expect(rows[0].sessionId).toBe('s-2026-10-05');
  });

  it('drops a version once it is the base', () => {
    expect(versionsOf([session('2026-10-01', { version: v1 })], swingsLast(base))).toEqual([]);
  });

  it('only counts sessions of this workout', () => {
    expect(versionsOf([session('2026-10-01', { version: v1, runsheetId: 'other' })], base)).toEqual([]);
  });
});

describe('changesFrom', () => {
  it('says what moved first and what came in or went', () => {
    const added = [...swingsLast(base).items, { ...makeExercise(EX.db_rdl, { target: 16 }), id: 'x1' }];
    expect(changesFrom(base.items, added)).toBe('Treadmill sprints first · + Dumbbell Romanian deadlift');
    expect(changesFrom(base.items, base.items.slice(1))).toMatch(/− /);
  });

  it('falls back to "other sets" when only numbers moved', () => {
    expect(changesFrom(base.items, seeded(base, 40).items)).toBe('Other sets, reps or loads');
  });
});

describe('mergeSessions', () => {
  const dupe: Runsheet = { ...swingsLast(base), id: 'u-dupe' };
  const into: Runsheet = { ...base, id: 'u-base' };
  it('moves the duplicate\'s sessions onto the base, each with what it ran', () => {
    const out = mergeSessions([session('a', { runsheetId: 'u-dupe' }), session('b', { runsheetId: 'u-base' }), session('c', { runsheetId: 'u-dupe', version: { items: base.items } })], dupe, into);
    expect(out.map(r => r.runsheetId)).toEqual(['u-base', 'u-base', 'u-base']);
    expect(fingerprint(out[0].version!.items)).toBe(fingerprint(dupe.items));
    expect(out[1].version).toBeUndefined();
    // Its version was the base's own list: nothing to keep.
    expect(out[2].version).toBeUndefined();
  });
});
