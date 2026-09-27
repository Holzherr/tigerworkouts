import { describe, expect, it } from 'vitest';
import type { SessionResult } from '@/features/runsheet/progression';
import { ghost, lastTimed, marks } from './pace';

const session = (over: Partial<SessionResult>): SessionResult => ({ runsheetId: 'w', startedAt: '2026-09-20T10:00:00Z', steps: [], ...over });
const circuit = (at: number[], startedAt = '2026-09-20T10:00:00Z') => session({ startedAt, splits: [{ blockId: 'b', at }], steps: [{ stepId: 'sw', exerciseKey: 'kb', sets: at.map(t => ({ reps: 10, at: t - 5 })) }] });
const inBlock = (id: string) => (id === 'sw' ? 'b' : undefined);

describe('ghost', () => {
  it('is ahead when the same round comes sooner', () => {
    const g = ghost(circuit([70, 150, 230, 300]), circuit([75, 160, 250, 312, 400]), inBlock);
    expect(g).toMatchObject({ label: 'Round 4', delta: 12, text: 'Round 4 — 12 s ahead', short: '12 s ahead' });
  });
  it('is behind when it comes later', () => {
    expect(ghost(circuit([83]), circuit([75]), inBlock)?.text).toBe('Round 1 — 8 s behind');
  });
  it('reads minutes past a minute, and level as on pace', () => {
    expect(ghost(circuit([200]), circuit([125]), inBlock)?.short).toBe('1:15 behind');
    expect(ghost(circuit([75]), circuit([75]), inBlock)?.short).toBe('on pace');
  });
  it('uses the latest round both sessions reached', () => {
    expect(ghost(circuit([70, 150, 230, 300, 380]), circuit([75, 160, 250]), inBlock)?.label).toBe('Round 3');
  });
  it('is nothing without a last time or before the first mark', () => {
    expect(ghost(circuit([70]), undefined)).toBeUndefined();
    expect(ghost(session({}), circuit([75]), inBlock)).toBeUndefined();
  });
  it('compares straight sets set by set', () => {
    const sets = (at: number[]) => session({ steps: [{ stepId: 'pr', exerciseKey: 'bench', sets: at.map(t => ({ reps: 8, load: 60, at: t })) }] });
    expect(ghost(sets([30, 150]), sets([35, 170, 300]))?.text).toBe('Set 2 — 20 s ahead');
  });
  it('leaves the sets of a block with round splits to the rounds', () => {
    expect(marks(circuit([70]), inBlock).map(m => m.key)).toEqual(['round:b:0']);
  });
});

describe('lastTimed', () => {
  it('is the newest session of this workout with times', () => {
    const untimed = session({ startedAt: '2026-09-25T10:00:00Z', steps: [{ stepId: 'sw', exerciseKey: 'kb', sets: [{ reps: 10 }] }] });
    const old = circuit([80], '2026-09-10T10:00:00Z');
    const newer = circuit([75], '2026-09-20T10:00:00Z');
    const other = { ...circuit([60], '2026-09-26T10:00:00Z'), runsheetId: 'x' };
    expect(lastTimed([old, untimed, other, newer], 'w')).toBe(newer);
    expect(lastTimed([old], 'w', old.id)).toBe(old);
    expect(lastTimed([{ ...old, id: 'me' }], 'w', 'me')).toBeUndefined();
  });
});

describe('ghost on the block clock', () => {
  const split = (at: number[], from?: number) => session({ splits: [{ blockId: 'b', at, ...(from !== undefined ? { from } : {}) }] });
  it('compares rounds from the start of the block when both sessions have it', () => {
    // Last time the warm-up took 60 s longer and the round itself 5 s longer.
    expect(ghost(split([95], 20), split([160], 80))?.text).toBe('Round 1 — 5 s ahead');
  });
  it('falls back to session time against a session logged before', () => {
    expect(ghost(split([95], 20), split([160]))?.text).toBe('Round 1 — 1:05 ahead');
  });
});
