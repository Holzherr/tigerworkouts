import { beforeEach, describe, expect, it } from 'vitest';
import { numberText, parseNumber } from './number-entry';
import { customStep, loadStep, metersStep, resetStepSizes, setStepSize } from './step-sizes';

describe('parseNumber', () => {
  it('reads decimals with a point or a comma', () => {
    expect(parseNumber('27.5')).toBe(27.5);
    expect(parseNumber(' 27,5 ')).toBe(27.5);
    expect(parseNumber('20')).toBe(20);
    expect(parseNumber('.5')).toBe(0.5);
  });
  it('ignores what is not a number', () => {
    for (const t of ['', ' ', 'abc', '-5', '1.2.3', '.', '1e3']) expect(parseNumber(t)).toBeUndefined();
  });
  it('writes up to two decimals', () => {
    expect([2.5, 1.25, 20, 0.333].map(numberText)).toEqual(['2.5', '1.25', '20', '0.33']);
  });
});

describe('step sizes', () => {
  beforeEach(() => {
    localStorage.clear();
    resetStepSizes();
  });
  const bar = { key: 'squat', step: 2.5 };
  it("uses the exercise's own step until one is picked, never zero", () => {
    expect(loadStep(bar)).toBe(2.5);
    expect(loadStep({ key: 'x', step: 0 })).toBe(1);
    expect(metersStep({ key: 'sled' }, 10)).toBe(10);
  });
  it('keeps a picked step per exercise and kind, across a reload', () => {
    setStepSize('squat', 'load', 1.25);
    setStepSize('sled', 'meters', 20);
    expect(loadStep(bar)).toBe(1.25);
    expect(metersStep({ key: 'sled' }, 10)).toBe(20);
    expect(customStep('sled', 'load')).toBeUndefined();
    resetStepSizes();
    expect(loadStep(bar)).toBe(1.25);
  });
  it('goes back to the own step when cleared or set to zero', () => {
    setStepSize('squat', 'load', 5);
    setStepSize('squat', 'load', 0);
    expect(loadStep(bar)).toBe(2.5);
    setStepSize('squat', 'load', 5);
    setStepSize('squat', 'load', undefined);
    expect(customStep('squat', 'load')).toBeUndefined();
  });
});
