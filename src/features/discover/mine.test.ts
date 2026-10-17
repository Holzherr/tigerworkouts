import { describe, expect, it } from 'vitest';
import type { Runsheet } from '@/features/runsheet/model';
import type { SessionResult } from '@/features/runsheet/progression';
import { lastDoneById, lastDoneOf, mineLine, mineList } from './mine';

const w = (id: string, extra: Partial<Runsheet> = {}): Runsheet => ({ id, title: id, items: [], source: { title: id, kind: 'benchmark' }, ...extra });
const did = (runsheetId: string, day: number): SessionResult => ({ runsheetId, startedAt: `2026-10-${String(day).padStart(2, '0')}T10:00:00Z`, steps: [] });

describe('mineList', () => {
  it('merges own and saved, newest of last done or made first, a workout just made on top', () => {
    const fresh = w('u-fresh', { createdAt: '2026-10-15T09:00:00Z' });
    const old = w('u-old', { createdAt: '2026-09-01T09:00:00Z' });
    const list = mineList([fresh, old, w('fran'), w('cindy'), w('helen')], ['u-fresh', 'u-old'], ['fran', 'cindy', 'u-old'], [did('fran', 10), did('cindy', 16)]);
    expect(list.map(r => r.id)).toEqual(['cindy', 'u-fresh', 'fran', 'u-old']);
  });
  it('shows a copy in place of its original and leaves out what the coach sent', () => {
    const list = mineList([w('u-fran', { copyOf: 'fran' }), w('fran'), w('cindy')], ['u-fran'], ['fran', 'cindy'], [], ['cindy']);
    expect(list.map(r => r.id)).toEqual(['u-fran']);
  });
});

describe('mineLine', () => {
  const now = new Date('2026-10-17T12:00:00Z');
  it('says when it was last done, including through the original of a copy', () => {
    const last = lastDoneById([did('fran', 16), did('fran', 12)]);
    expect(mineLine(w('u-fran', { copyOf: 'fran' }), lastDoneOf(w('u-fran', { copyOf: 'fran' }), last), true, now)).toBe('0 min · last done yesterday');
  });
  it('says new for your own not yet done, nothing for a saved one', () => {
    expect(mineLine(w('u-a'), undefined, true, now)).toBe('0 min · new');
    expect(mineLine(w('fran'), undefined, false, now)).toBe('0 min');
  });
});
