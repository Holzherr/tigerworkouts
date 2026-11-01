import { describe, expect, it } from 'vitest';
import { EX } from '@/features/runsheet/fixtures';
import { makeExercise, type Runsheet } from '@/features/runsheet/model';
import type { SessionResult } from '@/features/runsheet/progression';
import { contentsLine, lastDoneById, lastDoneOf, mineLine, mineList, newBadge, upNextFirst, upNextOf, whyLine } from './mine';

const w = (id: string, extra: Partial<Runsheet> = {}): Runsheet => ({ id, title: id, items: [], source: { title: id, kind: 'benchmark' }, ...extra });
const did = (runsheetId: string, day: number): SessionResult => ({ runsheetId, startedAt: `2026-10-${String(day).padStart(2, '0')}T10:00:00Z`, steps: [] });

describe('mineList', () => {
  it('puts your own not yet done on top, newest first, then the rest by last done or made', () => {
    const fresh = w('u-fresh', { createdAt: '2026-10-15T09:00:00Z' });
    const old = w('u-old', { createdAt: '2026-09-01T09:00:00Z' });
    const done = w('u-done', { createdAt: '2026-09-01T09:00:00Z' });
    const list = mineList([fresh, old, done, w('fran'), w('cindy'), w('helen')], ['u-fresh', 'u-old', 'u-done'], ['fran', 'cindy', 'u-old'], [did('fran', 10), did('cindy', 16), did('u-done', 12)]);
    expect(list.map(r => r.id)).toEqual(['u-fresh', 'u-old', 'cindy', 'u-done', 'fran']);
  });
  it('shows a copy in place of its original and leaves out what the coach sent', () => {
    const list = mineList([w('u-fran', { copyOf: 'fran' }), w('fran'), w('cindy')], ['u-fran'], ['fran', 'cindy'], [], ['cindy']);
    expect(list.map(r => r.id)).toEqual(['u-fran']);
  });
  it('counts a copy done when its original was', () => {
    const list = mineList([w('u-new', { createdAt: '2026-10-01T09:00:00Z' }), w('u-fran', { copyOf: 'fran', createdAt: '2026-10-02T09:00:00Z' })], ['u-new', 'u-fran'], [], [did('fran', 16)]);
    expect(list.map(r => r.id)).toEqual(['u-new', 'u-fran']);
  });
});

describe('mineLine', () => {
  const now = new Date('2026-10-17T12:00:00Z');
  it('says when it was last done, including through the original of a copy', () => {
    const last = lastDoneById([did('fran', 16), did('fran', 12)]);
    expect(mineLine(w('u-fran', { copyOf: 'fran' }), lastDoneOf(w('u-fran', { copyOf: 'fran' }), last), now)).toBe('0 min · last done yesterday');
  });
  it('adds the difficulty when there is one, and leaves new to the badge', () => {
    expect(mineLine(w('u-a', { level: 'Medium' }), undefined, now)).toBe('0 min · Medium');
    expect(mineLine(w('fran'), undefined, now)).toBe('0 min');
  });
});

describe('a Mine card', () => {
  it('lists what is in it by block name, without warm-up, rests or repeats', () => {
    const swing = makeExercise(EX.kb_swing, { forMode: 'seconds', forValue: 30 });
    const r = w('u-a', {
      items: [
        { ...makeExercise(EX.cardio_rower, { forMode: 'minutes', forValue: 5 }), role: 'warmup' },
        { kind: 'block', id: 'b1', name: 'Swings', repeat: 8, steps: [swing] },
        { kind: 'block', id: 'b2', name: 'Swings', repeat: 4, steps: [swing] },
        { kind: 'rest', id: 'r1', seconds: 60 },
        { kind: 'block', id: 'b3', name: 'Abs', repeat: 3, steps: [swing] },
        makeExercise(EX.bw_burpee, { forMode: 'minutes', forValue: 2 }),
      ],
    });
    expect(contentsLine(r)).toBe(`Swings · Abs · ${EX.bw_burpee.name}`);
  });
  it('takes the why from the first sentence of the description', () => {
    expect(whyLine(w('u-a', { description: 'Pull, legs and abs to balance the swings session. Same 30 on / 30 off.' }))).toBe('Pull, legs and abs to balance the swings session.');
    expect(whyLine(w('u-a'))).toBeUndefined();
  });
  it('says made for you when a coach made it, AI or not', () => {
    expect(newBadge(w('u-a', { creator: 'AI Coach' }))).toBe('New · made for you');
    expect(newBadge(w('u-a', { creator: 'Coach Sam' }))).toBe('New · made for you');
    expect(newBadge(w('u-a', { creator: 'Nick' }))).toBe('New');
    expect(newBadge(w('u-a'))).toBe('New');
  });
});

describe('upNextOf', () => {
  it('is the first new one, else the one done longest ago', () => {
    const list = [w('u-new'), w('a'), w('b')];
    const last = lastDoneById([did('a', 16), did('b', 2)]);
    expect(upNextOf(list, ['u-new', 'a'], last)).toBe('u-new');
    expect(upNextOf(list.slice(1), ['a'], last)).toBe('b');
    expect(upNextOf([w('c')], [], last)).toBeUndefined();
  });
});

describe('upNextFirst', () => {
  const lead = (list: Runsheet[], own: string[], results: SessionResult[]) => {
    const next = upNextOf(list, own, lastDoneById(results));
    return { next, ids: upNextFirst(list, r => r.id === next).map(r => r.id) };
  };
  it('puts the one done longest ago first when all are done, the rest newest first', () => {
    const own = ['u-a', 'u-b', 'u-c', 'u-d'];
    const results = [did('u-a', 22), did('u-b', 24), did('u-c', 25), did('u-d', 26)];
    const { next, ids } = lead(mineList(own.map(id => w(id)), own, [], results), own, results);
    expect(next).toBe('u-a');
    expect(ids).toEqual(['u-a', 'u-d', 'u-c', 'u-b']);
  });
  it('keeps your own not yet done first as Up next (18 Oct order)', () => {
    const own = ['u-a', 'u-b', 'u-new'];
    const results = [did('u-a', 22), did('u-b', 24)];
    const { next, ids } = lead(mineList([w('u-a'), w('u-b'), w('u-new', { createdAt: '2026-10-01T09:00:00Z' })], own, [], results), own, results);
    expect(next).toBe('u-new');
    expect(ids).toEqual(['u-new', 'u-b', 'u-a']);
  });
});
