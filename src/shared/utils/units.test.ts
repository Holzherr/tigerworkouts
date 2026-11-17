import { afterEach, describe, expect, it } from 'vitest';
import { fmtInUnit, fmtWeight, lbStep, LB_STEP_CHOICES, setWeightUnit, shownWeight, stepWeight, toKg, unitText, weightStepper } from './units';

afterEach(() => setWeightUnit('kg'));

describe('weight units (U11)', () => {
  it('shows kg as stored and lb to a tenth', () => {
    expect(fmtWeight(62.5, 'kg')).toBe('62.5 kg');
    expect(fmtWeight(20, 'lb')).toBe('44.1 lb');
    expect(fmtWeight(toKg(95, 'lb'), 'lb')).toBe('95 lb');
  });

  it('stores what is typed in lb as kg, and it reads back the same', () => {
    expect(toKg(45, 'lb')).toBe(20.412);
    for (const lb of [1, 2.5, 45, 95, 135, 225, 315, 405.5]) expect(shownWeight(toKg(lb, 'lb'), 'lb')).toBe(lb);
    expect(toKg(60, 'kg')).toBe(60);
  });

  it('names the unit in lb, speed untouched', () => {
    expect(unitText('kg per arm', 'lb')).toBe('lb per arm');
    expect(unitText('kph', 'lb')).toBe('kph');
    expect(fmtInUnit(24, 'kg per arm', 'lb')).toBe('52.9 lb');
    expect(fmtInUnit(10, 'kph', 'lb')).toBe('10 kph');
  });

  it('steps in sensible lb increments, and every lb step choice comes back from its kg', () => {
    expect([0.5, 1, 1.25, 2.5, 4, 5, 10].map(lbStep)).toEqual([1, 2, 2.5, 5, 10, 10, 20]);
    for (const lb of LB_STEP_CHOICES) expect(lbStep(toKg(lb, 'lb'))).toBe(lb);
  });

  it('snaps a press in lb to the step grid', () => {
    expect(stepWeight(44.1, 5, 1, 'lb')).toBe(45);
    expect(stepWeight(45, 5, 1, 'lb')).toBe(50);
    expect(stepWeight(44.1, 5, -1, 'lb')).toBe(40);
    expect(stepWeight(43.3, 2.5, 1, 'kg')).toBe(45.8);
  });

  it('a stepper on a stored kg hands back kg', () => {
    const got: number[] = [];
    const p = weightStepper(20, 2.5, kg => got.push(kg), 'lb');
    expect(p.value).toBe(44.1);
    expect(p.step).toBe(5);
    p.onChange(p.stepBy!(p.value, p.step, 1));
    expect(got).toEqual([20.412]);
  });
});
