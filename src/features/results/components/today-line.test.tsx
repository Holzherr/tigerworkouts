import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { makeExercise, type Runsheet } from '@/features/runsheet/model';
import { EX } from '@/features/runsheet/fixtures';
import type { SessionResult } from '@/features/runsheet/progression';
import { targetDelta, today } from '@/features/runsheet/targets';
import { TodayLine, whyOf } from './targets';

const press = { ...makeExercise(EX.db_shoulder_press, { target: 25, forMode: 'reps', forValue: 8 }), id: 's1' };
const bench = { ...makeExercise(EX.bb_bench, { target: 60, forMode: 'reps', forValue: 8 }), id: 's2' };
const w: Runsheet = {
  id: 'u-w',
  title: 'Push',
  items: [
    { kind: 'block', id: 'b1', name: 'Press', repeat: 3, mode: 'rounds', steps: [press] },
    { kind: 'block', id: 'b2', name: 'Bench', repeat: 3, mode: 'rounds', steps: [bench] },
  ],
};
const row = (stepId: string, key: string, sets: [number, number][]) => ({ stepId, exerciseKey: key, target: sets[0][0], reps: sets.map(x => x[1]), sets: sets.map(([load, reps]) => ({ load, reps })) });
const results: SessionResult[] = [{ id: 'a', runsheetId: 'u-w', startedAt: '2026-11-08T10:00:00Z', steps: [row('s1', press.exercise.key, [[25, 8], [25, 8], [25, 8]]), row('s2', bench.exercise.key, [[60, 8], [60, 8], [60, 7]])] }];

describe('the change on today\'s target', () => {
  it('is the load when it moves, else the reps', () => {
    const last = results[0].steps[0].sets;
    expect(targetDelta({ load: 27.5, reps: [8, 8, 8] }, last, 'kg')).toBe('+2.5 kg');
    expect(targetDelta({ load: 22.5, reps: [8, 8, 8] }, last, 'kg')).toBe('−2.5 kg');
    expect(targetDelta({ load: 25, reps: [9, 9, 9] }, last, 'kg')).toBe('+1 rep/set');
    expect(targetDelta({ load: 25, reps: [9, 8, 8] }, last, 'kg')).toBe('+1 rep');
    expect(targetDelta({ load: 25, reps: [10, 10, 8] }, last, 'kg')).toBe('+4 reps');
    expect(targetDelta({ load: 25, reps: [8, 8, 8] }, last, 'kg')).toBeUndefined();
    expect(targetDelta({ load: 25, reps: [8] }, undefined, 'kg')).toBeUndefined();
  });
  it('rides on Today for the first lift', () => {
    expect(today(w, results, 'maintain', undefined, { mode: 'weight' })).toMatchObject({ text: 'Shoulder press 27.5 kg × 8', delta: '+2.5 kg' });
    expect(today(w, results, 'maintain')).toMatchObject({ text: 'Shoulder press 25 kg × 9', delta: '+1 rep/set' });
  });
});

describe('TodayLine', () => {
  it('is one line with the change in brackets; the reasoning and the other lifts are behind a tap', () => {
    const t = today(w, results, 'maintain', undefined, { mode: 'weight' })!;
    render(<TodayLine today={t} />);
    const line = screen.getByRole('button');
    expect(line.textContent).toBe('Today: Shoulder press 27.5 kg × 8 (+2.5 kg)');
    expect(screen.queryByLabelText('Why')).toBeNull();
    fireEvent.click(line);
    const why = screen.getByLabelText('Why').textContent ?? '';
    expect(why).toContain('8 reps at 25 kg on every set: up to 27.5 kg');
    expect(why).not.toContain('on the workout page');
    expect(why).toContain('Barbell bench press 60 kg × 8 (+1 rep): hold 60 kg until every set makes 8');
  });
  it('drops only the "more on the workout page" tail from the reason', () => {
    expect(whyOf('bank reps: 28 kg once every set reaches 14 · 1 more on the workout page')).toBe('bank reps: 28 kg once every set reaches 14');
    expect(whyOf('same as last time · rate how hard it was at the finish')).toBe('same as last time · rate how hard it was at the finish');
  });
});
