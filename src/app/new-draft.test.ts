import { beforeEach, describe, expect, it } from 'vitest';
import type { Runsheet } from '@/features/runsheet/model';
import { loadNewDraft, saveNewDraft, worthKeeping } from './new-draft';

const ex = { kind: 'exercise', id: 'e1', exercise: { key: 'k', name: 'Squat', unit: 'kg', step: 2.5 }, forMode: 'reps', forValue: 5 } as const;
const empty: Runsheet = { title: '', items: [] };

describe('new workout draft', () => {
  beforeEach(() => localStorage.clear());

  it('keeps a name or an exercise, not an empty block', () => {
    expect(worthKeeping(empty)).toBe(false);
    expect(worthKeeping({ title: '  ', items: [{ kind: 'block', id: 'b', name: 'Block 1', repeat: 3, steps: [] }] })).toBe(false);
    expect(worthKeeping({ title: 'Legs', items: [] })).toBe(true);
    expect(worthKeeping({ title: '', items: [{ kind: 'block', id: 'b', name: 'B', repeat: 3, steps: [ex] }] })).toBe(true);
    expect(worthKeeping({ title: '', items: [ex] })).toBe(true);
  });

  it('comes back after a reload, and goes when cleared or emptied', () => {
    const r: Runsheet = { title: 'Legs', items: [ex] };
    saveNewDraft(r);
    expect(loadNewDraft()).toEqual(r);
    saveNewDraft(empty);
    expect(loadNewDraft()).toBeNull();
    saveNewDraft(r);
    saveNewDraft(null);
    expect(loadNewDraft()).toBeNull();
  });

  it('ignores what it cannot read', () => {
    localStorage.setItem('tiger:new-workout-draft', '{oops');
    expect(loadNewDraft()).toBeNull();
    localStorage.setItem('tiger:new-workout-draft', '{"title":1}');
    expect(loadNewDraft()).toBeNull();
  });
});
