import { beforeEach, describe, expect, it, vi } from 'vitest';
import { myAssignments } from './coaching';

const ME = 'u-me';
const PT = 'u-pt';
const rows: Record<string, unknown> = {};

vi.mock('./client', () => ({
  currentUser: () => ({ id: 'u-me' }),
  sb: {
    from: (table: string) => {
      const res = () => ({ data: rows[table] ?? null, error: null });
      const q = {
        select: () => q,
        eq: () => q,
        in: () => q,
        order: async () => res(),
        maybeSingle: async () => ({ data: (rows[table] as unknown[] | undefined)?.[0] ?? null, error: null }),
        then: (f: (v: unknown) => unknown) => Promise.resolve(res()).then(f),
      };
      return q;
    },
  },
}));

const workout = (id: string) => ({ id, owner: ME, creator: 'x', title: id, public: false, data: { id, title: id, items: [] } });

beforeEach(() => {
  rows.assignments = [
    { id: 'a-ai', coach: ME, client: ME, workout_id: 'w-ai', note: 'Up 2.5 kg', due_on: null, created_at: '2026-10-19T08:00:00Z' },
    { id: 'a-pt', coach: PT, client: ME, workout_id: 'w-pt', note: null, due_on: null, created_at: '2026-10-18T08:00:00Z' },
  ];
  rows.workouts = [workout('w-ai'), workout('w-pt')];
  rows.profiles = [{ id: PT, name: 'Sam', handle: null }];
  rows.ai_coaches = [{ name: 'Coach Claude', status: 'active', created_at: '2026-10-19T08:00:00Z' }];
});

describe('myAssignments', () => {
  it('names an AI coach assignment (coach = client = you) by the name you gave it, and a PT by their profile', async () => {
    const out = await myAssignments();
    expect(out.map(a => [a.id, a.coachName, !!a.ai])).toEqual([
      ['a-ai', 'Coach Claude', true],
      ['a-pt', 'Sam', false],
    ]);
    expect(out[0].workout?.id).toBe('w-ai');
  });

  it('leaves out what a removed AI coach sent', async () => {
    rows.ai_coaches = [{ name: 'Coach Claude', status: 'ended', created_at: '' }];
    expect((await myAssignments()).map(a => a.id)).toEqual(['a-pt']);
  });
});
