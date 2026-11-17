import { describe, expect, it } from 'vitest';
import type { Runsheet } from '@/features/runsheet/model';
import { makeExercise } from '@/features/runsheet/model';
import { EX } from '@/features/runsheet/fixtures';
import { musclesWorked, nameFromKey, workoutsWith } from './used-in';

const loose: Runsheet = { id: 'c-1', title: 'Loose', items: [{ ...makeExercise(EX.bw_squat), id: 's1' }] };
const inBlock: Runsheet = { id: 'u-1', title: 'Mine', items: [{ kind: 'block', id: 'b', name: 'B', repeat: 3, mode: 'rounds', steps: [{ ...makeExercise(EX.bw_pushup), id: 'p' }, { ...makeExercise(EX.bw_squat), id: 'q' }] }] };
const other: Runsheet = { id: 'c-2', title: 'Other', items: [{ ...makeExercise(EX.bw_pushup), id: 'x' }] };

describe('workoutsWith', () => {
  it('finds the exercise loose or in a block, your own first', () => {
    expect(workoutsWith(EX.bw_squat.key, [loose, other, inBlock], new Set(['u-1'])).map(r => r.id)).toEqual(['u-1', 'c-1']);
  });
  it('is empty when nothing uses it', () => {
    expect(workoutsWith('nope', [loose, other])).toEqual([]);
  });
});

describe('musclesWorked', () => {
  it('splits main muscles from the ones along for the ride', () => {
    expect(musclesWorked('Barbell back squat')).toEqual({ main: ['quads', 'glutes'], also: ['core'] });
  });
});

describe('nameFromKey', () => {
  it('reads an unknown key as words', () => {
    expect(nameFromKey('squat')).toBe('Squat');
    expect(nameFromKey('wall_ball_shot')).toBe('Wall ball shot');
  });
});
