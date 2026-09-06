import { describe, expect, it } from 'vitest';
import { makeExercise, type Runsheet } from '@/features/runsheet/model';
import { EX } from '@/features/runsheet/fixtures';
import { recommend } from './recommend';

const w = (id: string, opts: Partial<Runsheet> & { keys?: string[] } = {}): Runsheet => ({ id, title: id, items: (opts.keys ?? ['kb_swing']).map(k => makeExercise(EX[k], { forMode: 'reps', forValue: 10 })), ...opts });

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
    const r = recommend(all, [{ runsheetId: 'a1', startedAt: '2026-09-06', steps: [] }]);
    expect(r[0].runsheet.id).toBe('a2');
    expect(r[0].reason).toBe('Next in P');
  });
  it('recommends by shared exercises and author, skipping what you just did', () => {
    const r = recommend(all, [{ runsheetId: 'fran', startedAt: '2026-09-06', steps: [] }]);
    expect(r.map(x => x.runsheet.id)).not.toContain('fran');
    expect(r[0].runsheet.id).toBe('cindy');
  });
});
