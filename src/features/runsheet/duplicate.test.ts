import { describe, expect, it } from 'vitest';
import type { Block, Runsheet } from './model';
import { duplicateForNextWeek, nextTitle } from './duplicate';

describe('Duplicate for next week', () => {
  it('counts the week on, else adds (copy)', () => {
    expect(nextTitle('Hip thrust focus week 1')).toBe('Hip thrust focus week 2');
    expect(nextTitle('Legs Wk 3')).toBe('Legs Wk 4');
    expect(nextTitle('Push day')).toBe('Push day (copy)');
    expect(nextTitle('  ')).toBe('Untitled (copy)');
  });
  it('is a workout of its own: fresh ids, no copyOf, the thread kept, the original untouched', () => {
    const r: Runsheet = { id: 'u-1', title: 'Push week 1', copyOf: 'cat-1', public: true, program: { name: 'P', day: 'Day 1' }, icon: { kind: 'image', url: 'i.png' }, items: [{ kind: 'block', id: 'b1', name: 'Press', repeat: 3, steps: [{ kind: 'exercise', id: 's1', exercise: { key: 'k', name: 'Press', unit: 'kg', step: 2.5 }, forMode: 'reps', forValue: 8, target: 25 }] }] };
    const before = JSON.stringify(r);
    const d = duplicateForNextWeek(r, 'u-2', 'Sam');
    expect(d).toMatchObject({ id: 'u-2', title: 'Push week 2', duplicatedFrom: 'u-1', creator: 'Sam' });
    expect(d.copyOf).toBeUndefined();
    expect(d.public).toBeUndefined();
    expect(d.program).toBeUndefined();
    expect(d.icon).toEqual({ kind: 'image', url: 'i.png' });
    const b = d.items[0] as Block;
    expect(b.id).not.toBe('b1');
    expect(b.steps[0].id).not.toBe('s1');
    expect(b.steps[0]).toMatchObject({ target: 25, forValue: 8 });
    expect(JSON.stringify(r)).toBe(before);
  });
});
