import { describe, expect, it } from 'vitest';
import { EX } from '@/features/runsheet/fixtures';
import { makeExercise, type ExerciseStep } from '@/features/runsheet/model';
import { fieldsFor } from './logged-sets';

describe('the columns Edit sets offers', () => {
  const rower = (log?: ExerciseStep['log']) => ({ ...makeExercise(EX.cardio_rower, { forMode: 'seconds', forValue: 30 }), ...(log ? { log } : {}), id: 'rw' });
  it('a timed rower that logged nothing gets seconds only; one set to log metres gets metres too', () => {
    expect(fieldsFor([{ seconds: 30 }], 'm', rower())).toEqual(['seconds']);
    expect(fieldsFor([{ seconds: 30 }], 'm', rower('meters'))).toEqual(['meters', 'seconds']);
    expect(fieldsFor([{ seconds: 30 }], 'm', rower(['meters', 'calories']))).toEqual(['meters', 'calories', 'seconds']);
  });
  it('metres already logged always keep their column, and without the step the unit decides as before', () => {
    expect(fieldsFor([{ seconds: 30, meters: 140 }], 'm', rower())).toEqual(['meters', 'seconds']);
    expect(fieldsFor([{ seconds: 30 }], 'm')).toEqual(['meters', 'seconds']);
  });
  it('timed swings set to log reps get a reps column next to the load', () => {
    const swings = { ...makeExercise(EX.kb_swing, { forMode: 'seconds', forValue: 30, target: 24 }), log: 'reps' as const, id: 'sw' };
    expect(fieldsFor([{ load: 24, seconds: 30 }], 'kg', swings)).toEqual(['load', 'reps', 'seconds']);
  });
});
