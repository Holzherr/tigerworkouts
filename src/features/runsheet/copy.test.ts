import { describe, expect, it } from 'vitest';
import { plural } from '@/shared/utils/ui-utils';
import { holdDelay } from '@/shared/components/ui/stepper';
import { modeLabel, type Block } from './model';
import { fmtScore } from './progression';

const block = (b: Partial<Block>): Block => ({ kind: 'block', id: 'b', name: 'B', repeat: 3, steps: [], ...b });

describe('copy', () => {
  it('counts in the singular for one', () => {
    expect(plural(1, 'round')).toBe('1 round');
    expect(plural(4, 'set')).toBe('4 sets');
    expect(fmtScore('rounds', 1)).toBe('1 round');
    expect(fmtScore('rounds', 5.001)).toBe('5 rounds + 1 rep');
  });
  it('an AMRAP with no time reads AMRAP, and 90 s reads 1:30', () => {
    expect(modeLabel(block({ mode: 'amrap' }))).toBe('AMRAP');
    expect(modeLabel(block({ mode: 'amrap', timeCapSec: 90 }))).toBe('AMRAP 1:30');
    expect(modeLabel(block({ mode: 'amrap', timeCapSec: 1200 }))).toBe('AMRAP 20:00');
  });
  it('a held stepper waits, then repeats faster and faster down to a floor', () => {
    expect(holdDelay(0)).toBe(400);
    expect(holdDelay(1)).toBeLessThan(holdDelay(0));
    expect(holdDelay(5)).toBeLessThan(holdDelay(1));
    expect(holdDelay(100)).toBe(40);
  });
});
