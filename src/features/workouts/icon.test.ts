import { describe, expect, it } from 'vitest';
import { defaultIcon, monogram } from './icon';

describe('monogram', () => {
  it('takes two initials, keeps digits, drops joining words', () => {
    expect(monogram('Swings, incline press & sprints')).toBe('SI');
    expect(monogram('StrongLifts 5×5 A')).toBe('S5');
    expect(monogram('Couch to 5K – Week 1')).toBe('C5');
    expect(monogram('PHUL – Upper Power')).toBe('PU');
  });
  it('uses one letter for single-word titles', () => {
    expect(monogram('Fran')).toBe('F');
  });
});

describe('defaultIcon', () => {
  it('is stable for an id and varies across ids', () => {
    const a = defaultIcon('u-swings-incline');
    expect(defaultIcon('u-swings-incline')).toEqual(a);
    expect(a.kind).toBe('monogram');
    const combos = new Set(['a', 'b', 'c', 'd', 'e', 'f'].map(id => JSON.stringify(defaultIcon(id))));
    expect(combos.size).toBeGreaterThan(3);
  });
});
