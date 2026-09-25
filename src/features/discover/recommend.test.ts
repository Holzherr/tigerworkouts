import { describe, expect, it } from 'vitest';
import { makeExercise, type Runsheet } from '@/features/runsheet/model';
import { EX } from '@/features/runsheet/fixtures';
import type { SessionResult } from '@/features/runsheet/progression';
import { recommend } from './recommend';

const w = (id: string, opts: Partial<Runsheet> & { keys?: string[] } = {}): Runsheet => ({ id, title: id, items: (opts.keys ?? ['kb_swing']).map(k => makeExercise(EX[k], { forMode: 'reps', forValue: 10 })), ...opts });
const did = (runsheetId: string, day = 6): SessionResult => ({ runsheetId, startedAt: `2026-09-${String(day).padStart(2, '0')}`, steps: [] });
const ids = (r: ReturnType<typeof recommend>) => r.map(x => x.runsheet.id);

describe('recommend', () => {
  const all = [
    w('a1', { program: { name: 'P', day: '1', order: 1 }, source: { title: '', kind: 'program', author: 'X' } }),
    w('a2', { program: { name: 'P', day: '2', order: 2 }, source: { title: '', kind: 'program', author: 'X' } }),
    w('fran', { keys: ['bw_pullup'], source: { title: '', kind: 'benchmark', author: 'CrossFit' } }),
    w('cindy', { title: 'Cindy', keys: ['bw_pullup', 'bw_pushup', 'bw_squat'], source: { title: '', kind: 'benchmark', author: 'CrossFit' } }),
    w('vid', { keys: ['bw_pushup'], source: { title: '', kind: 'video', author: 'Pamela Reif' } }),
  ];
  it('cold start gives a curated list', () => {
    const r = recommend(all, []);
    expect(r.length).toBeGreaterThan(0);
    expect(r.some(x => x.runsheet.title === 'Cindy')).toBe(true);
  });
  it('puts the next program day first', () => {
    const r = recommend(all, [did('a1')]);
    expect(r[0].runsheet.id).toBe('a2');
    expect(r[0].reason).toBe('Next in P');
  });
  it('one Fran does not bring in Cindy: one shared exercise and one session by the author is not enough', () => {
    const r = recommend(all, [did('fran')]);
    expect(ids(r)).not.toContain('fran');
    expect(ids(r)).not.toContain('cindy');
  });

  // Nick's own workouts and one sampled benchmark, the shape of his real history
  const me = { title: '', kind: 'user' as const, author: 'nick@example.com' };
  const cf = { title: '', kind: 'benchmark' as const, author: 'CrossFit' };
  const mine = [
    w('n1', { keys: ['bb_back_squat', 'bw_pushup'], source: me }),
    w('n2', { keys: ['bb_deadlift', 'bw_pullup'], source: me }),
    w('n3', { keys: ['bw_lunge'], source: me }),
  ];
  const history = [did('n1', 8), did('n2', 7), did('fran', 6)];

  it('drops a catalogue workout that shares exactly one exercise and has no creator match', () => {
    const one = w('nhs-day', { keys: ['bb_back_squat', 'bw_burpee'], source: { title: '', kind: 'program', author: 'NHS' } });
    const r = recommend([...mine, one], [did('n1'), did('n2')]);
    expect(ids(r)).not.toContain('nhs-day');
  });
  it('ranks a third workout by a creator done twice above every benchmark, and one sampled benchmark does not reopen its source', () => {
    const fran = w('fran', { keys: ['bw_pullup'], source: cf });
    const cindy = w('cindy', { keys: ['bw_pullup', 'bw_pushup', 'bw_squat'], source: cf });
    const grace = w('grace', { keys: ['bb_deadlift', 'bw_burpee'], source: cf });
    const r = recommend([...mine, fran, cindy, grace], history);
    expect(ids(r)[0]).toBe('n3');
    expect(r[0].reason).toBe('More from nick@example.com');
    expect(ids(r)).toContain('cindy'); // two shared exercises
    expect(ids(r)).not.toContain('grace'); // one shared exercise, CrossFit done once
    expect(ids(r)).not.toContain('fran');
  });
  it('never offers a mid-program day of a program with no session, even while another program is in progress', () => {
    const q = [1, 2, 3].map(n => w(`q${n}`, { keys: ['bb_back_squat', 'bw_pushup'], program: { name: 'Q', day: String(n), order: n }, source: { title: '', kind: 'program', author: 'Y' } }));
    const r = recommend([...all, ...mine, ...q], [did('a1', 9), ...history], ['q3']);
    expect(ids(r)[0]).toBe('a2');
    expect(ids(r)).not.toContain('q3');
    expect(ids(r)).toContain('q1');
  });
  it('returns at most 6 by default and honours an explicit limit', () => {
    const pri = { title: '', kind: 'user' as const, author: 'Priyanka' };
    const many = [
      ...[1, 2, 3, 4, 5].map(n => w(`n${n}`, { keys: ['bb_back_squat', 'bw_pushup'], source: me })),
      ...[1, 2, 3, 4, 5].map(n => w(`p${n}`, { keys: ['bb_back_squat', 'bw_pushup'], source: pri })),
      ...[1, 2, 3].map(n => w(`b${n}`, { keys: ['bb_back_squat', 'bw_pushup'], source: cf })),
    ];
    const hist = [did('n1', 9), did('n2', 8), did('p1', 7), did('p2', 6)];
    expect(recommend(many, hist).length).toBe(6);
    expect(recommend(many, hist, [], 3).length).toBe(3);
    expect(recommend(many, hist, [], 20).length).toBe(9);
  });
  it('lets in a coach workout when that coach has been done twice', () => {
    const coach = { title: '', kind: 'coach' as const, author: 'Coach A' };
    const c = [1, 2, 3].map(n => w(`c${n}`, { keys: ['bw_plank'], source: coach }));
    const r = recommend([...mine, ...c], [did('c1', 8), did('c2', 7)]);
    expect(ids(r)).toEqual(['c3']);
    expect(r[0].reason).toBe('More from Coach A');
  });
});
