import { describe, expect, it } from 'vitest';
import type { SessionResult } from '@/features/runsheet/progression';
import { editSet, nextSetType, setMarks, type Block, type ExerciseStep } from '@/features/runsheet/model';
import { setTarget, timerTarget } from '@/features/runsheet/targets';
import { exerciseHistory, records, sessionVolume } from './logbook';
import { exerciseStall } from './stall';
import { effort, workedFrom } from './effort';

const session = (startedAt: string, sets: SessionResult['steps'][number]['sets']): SessionResult => ({ id: 's-' + startedAt, runsheetId: 'w', title: 'Push', startedAt, steps: [{ stepId: 'a', exerciseKey: 'bench', sets }] });

describe('set types', () => {
  it('numbers the work; W, D and F stand in for the rest', () => {
    expect(setMarks(['warmup', undefined, 'normal', 'drop', 'failure', undefined])).toEqual(['W', '1', '2', 'D', 'F', '3']);
    expect(nextSetType(undefined)).toBe('warmup');
    expect(nextSetType('warmup')).toBe('drop');
    expect(nextSetType('drop')).toBe('failure');
    expect(nextSetType('failure')).toBe('normal');
  });
  it('the editor keeps each set’s type through an edit, and normal is left unset', () => {
    const b: Block = { kind: 'block', id: 'b', name: 'B', repeat: 3, steps: [{ kind: 'exercise', id: 's', exercise: { key: 'bb_bench', name: 'Bench', unit: 'kg', step: 2.5 }, forMode: 'reps', forValue: 8, target: 60 }] };
    const warm = editSet(b, 0, { type: 'warmup', load: 40 });
    const next = editSet(warm, 2, { reps: 6 });
    const sets = (next.steps[0] as ExerciseStep).sets!;
    expect(sets.map(x => x.type)).toEqual(['warmup', undefined, undefined]);
    expect((editSet(next, 0, { type: 'normal' }).steps[0] as ExerciseStep).sets![0].type).toBeUndefined();
  });
  it('a warm-up is never a record, a best or volume', () => {
    const all = [session('2026-09-01T10:00:00Z', [{ load: 60, reps: 5 }]), session('2026-09-08T10:00:00Z', [{ load: 100, reps: 5, type: 'warmup' }, { load: 60, reps: 5 }])];
    const [latest] = exerciseHistory(all, 'bench');
    expect(latest.prs).toEqual([false, false]);
    expect(records(all, 'bench').heaviest?.value).toBe(60);
    expect(sessionVolume(latest)).toBe(300);
  });
  it('a stall reads the working sets only', () => {
    const days = ['2026-08-20', '2026-08-27', '2026-09-03', '2026-09-10', '2026-09-17'];
    // The warm-up climbs every week; the work does not move.
    const all = days.map((d, i) => session(`${d}T10:00:00Z`, [{ load: 20 + i * 10, reps: 5, type: 'warmup' }, { load: 60, reps: 5 }]));
    const stall = exerciseStall(all, { key: 'bench', name: 'Bench', unit: 'kg', step: 2.5 }, new Date('2026-09-20'));
    expect(stall?.best).toBe('60 kg × 5');
  });
  it('targets skip warm-ups and drop sets, and so does the timer pill', () => {
    const s: ExerciseStep = { kind: 'exercise', id: 's', exercise: { key: 'bb_bench', name: 'Bench', unit: 'kg', step: 2.5 }, forMode: 'reps', forValue: 8, forMax: 10, target: 60, sets: [{ load: 40, type: 'warmup' }, { load: 60 }, {}] };
    const t = setTarget(s, [{ load: 40, reps: 8, type: 'warmup' }, { load: 60, reps: 8 }, { load: 60, reps: 8 }, { load: 45, reps: 6, type: 'drop' }]);
    expect(t?.text).toBe('60 kg × 9');
    const today = { text: '', detail: '', sets: t ? [t] : [] };
    const r = { title: 't', items: [] };
    expect(timerTarget(today, { stepId: 's', round: 0, type: 'warmup' }, r)).toBeUndefined();
    expect(timerTarget(today, { stepId: 's', round: 1, set: 0 }, r)).toBe('Target 60 × 9');
  });
  it('effort counts neither warm-ups nor drop sets as sets, and leaves warm-ups out of the tonnage', () => {
    const r = session('2026-09-01T10:00:00Z', [{ load: 40, reps: 10, type: 'warmup' }, { load: 60, reps: 5 }, { load: 40, reps: 8, type: 'drop' }]);
    const worked = workedFrom(r, undefined, () => ({ name: 'Bench' }));
    expect(worked).toHaveLength(3);
    const e = effort(r, worked, 80);
    expect(e.sets).toBe(1);
    expect(e.tonnage).toBe(60 * 5 + 40 * 8);
  });
});
