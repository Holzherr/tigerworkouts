import { describe, expect, it } from 'vitest';
import { makeExercise, type ExerciseRef, type Runsheet } from '@/features/runsheet/model';
import { maxLifts, setMax } from './training-maxes';

const ref = (key: string): ExerciseRef => ({ key, name: key, unit: 'kg', step: 2.5 });

describe('training maxes', () => {
  it('lists the big four, any lift loaded as % TM, and any lift that has a max', () => {
    const w: Runsheet = { id: 'w', title: 'Rows', items: [{ ...makeExercise(ref('bb_row'), { forMode: 'reps', forValue: 5 }), id: 'r', targetPct: 70 }, { ...makeExercise(ref('bb_curl'), { forMode: 'reps', forValue: 5, target: 20 }), id: 'c' }] };
    expect(maxLifts([w], { front_squat: 90 }, ref).map(e => e.key)).toEqual(['bb_back_squat', 'bb_bench', 'bb_deadlift', 'bb_ohp', 'bb_row', 'front_squat']);
  });
  it('takes a max stepped to 0 off rather than keeping 0 kg', () => {
    expect(setMax({ bb_bench: 80, bb_ohp: 50 }, 'bb_bench', 0)).toEqual({ bb_ohp: 50 });
    expect(setMax({}, 'bb_bench', 82.5)).toEqual({ bb_bench: 82.5 });
  });
});
