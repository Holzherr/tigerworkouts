import { describe, expect, it } from 'vitest';
import { LIBRARY } from '@/features/exercises/library';
import { EX, priyanka } from './fixtures';
import { forLabel, loadLabel, type Block, type ExerciseStep } from './model';
import { applyCommands, matchExercise, parsePlan } from './parse-text';

describe('matchExercise', () => {
  it('resolves aliases and partial names', () => {
    expect(matchExercise('kb swings', EX)?.ref.key).toBe('kb_swing');
    expect(matchExercise('lat raises', EX)?.ref.key).toBe('lat_raise');
    expect(matchExercise('incline press', EX)?.ref.key).toBe('db_incline_press');
    expect(matchExercise('sprints', EX)?.ref.key).toBe('sprint');
  });
});

describe('parsePlan', () => {
  it("reads Priyanka's shorthand", () => {
    const { items, unparsed } = parsePlan('kb swings 28 + incline press 20 x8 30/30\nsprints 14.5 x8, rest 15\nincline walk 10 min inc 6', EX);
    expect(unparsed).toEqual([]);
    const b1 = items[0] as Block;
    expect(b1.repeat).toBe(8);
    expect(b1.steps.map(s => s.kind)).toEqual(['exercise', 'rest', 'exercise', 'rest']);
    expect((b1.steps[2] as ExerciseStep).target).toBe(20);
    const b2 = items[1] as Block;
    expect((b2.steps[1] as { seconds: number }).seconds).toBe(15);
    const walk = items[2] as ExerciseStep;
    expect(walk.forMode).toBe('minutes');
    expect(walk.forValue).toBe(10);
    expect(walk.incline).toBe(6);
  });
  it('reads AMRAP and reports unknown lines', () => {
    const { items, unparsed } = parsePlan('amrap 20 pull ups 5 reps + push ups 10 reps + squats 15 reps\nflibbertigibbet 3', EX);
    const b = items[0] as Block;
    expect(b.mode).toBe('amrap');
    expect(b.timeCapSec).toBe(1200);
    expect(unparsed).toEqual(['flibbertigibbet 3']);
  });
});

describe('parsePlan: what a number measures', () => {
  // The step as a person reads it, with the real library's units (rower "m", bike "kph", swings "kg").
  const read = (line: string) => {
    const { items, unparsed } = parsePlan(line, LIBRARY);
    expect(unparsed).toEqual([]);
    const it = items[0];
    const s = (it.kind === 'block' ? it.steps[0] : it) as ExerciseStep;
    return [s.exercise.name, forLabel(s), loadLabel(s), it.kind === 'block' ? `×${it.repeat}` : ''].filter(Boolean).join(' · ');
  };
  it('a duration on a machine is the time, not a distance or a speed', () => {
    expect(read('row 5 min')).toBe('Rowing machine · 5 min');
    expect(read('bike 10 min')).toBe('Stationary bike · 10 min');
    expect(read('incline walk 10 min inc 6')).toBe('Incline walk · 10 min');
  });
  it('metres, kilometres and calories are what the step is done for', () => {
    expect(read('row 500m')).toBe('Rowing machine · 500 m');
    expect(read('row 500 m')).toBe('Rowing machine · 500 m');
    expect(read('run 2 km')).toBe('Run · 2000 m');
    expect(read('bike 20 cal')).toBe('Stationary bike · 20 cal');
  });
  it('a bare number on a load exercise is still the load', () => {
    expect(read('kb swings 24 x 15')).toBe('Kettlebell swings · 30s · 24 kg · ×15');
    expect(read('sprints 14.5 x8, rest 15')).toBe('Treadmill sprints · 30s · 14.5 kph · ×8');
  });
});

describe('applyCommands', () => {
  it('changes a load, halves rests, drops a step', () => {
    const { runsheet, applied, unparsed } = applyCommands(priyanka(), 'press 22.5, half rests, skip walk', EX);
    expect(unparsed).toEqual([]);
    expect(applied).toHaveLength(3);
    const b1 = runsheet.items[0] as Block;
    expect((b1.steps[2] as ExerciseStep).target).toBe(22.5);
    expect((b1.steps[1] as { seconds: number }).seconds).toBe(15);
    expect(runsheet.items.some(i => i.kind === 'exercise' && i.exercise.key === 'incline_walk')).toBe(false);
  });
  it('says 1 round, not 1 rounds', () => {
    expect(applyCommands(priyanka(), '1 round', EX).applied).toEqual(['1 round']);
  });
});
