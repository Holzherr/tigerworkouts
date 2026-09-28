import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { EX, priyanka } from '@/features/runsheet/fixtures';
import { makeExercise, type Runsheet } from '@/features/runsheet/model';
import type { SessionOrigin, SessionResult } from '@/features/runsheet/progression';
import { ResultSheet } from './result-sheet';

const save = (startedFrom?: SessionOrigin): SessionResult => {
  const onSave = vi.fn();
  render(<ResultSheet runsheet={priyanka()} startedFrom={startedFrom} onSave={onSave} />);
  fireEvent.click(screen.getByText('Save result'));
  return onSave.mock.calls[0][0];
};

describe('ResultSheet startedFrom', () => {
  it.each(['recommended', 'saved', 'search'] as const)('saves the result with startedFrom %s', from => {
    expect(save(from).startedFrom).toBe(from);
  });
  it('leaves startedFrom unset when the origin is unknown', () => {
    expect(save().startedFrom).toBeUndefined();
  });
});

describe('ResultSheet keeps what the timer logged', () => {
  it('keeps per-set results and the row of an exercise swapped in mid-session', () => {
    const onSave = vi.fn();
    const initial: SessionResult = {
      id: 's-abc-run', runsheetId: 'p', startedAt: '2026-09-27T10:00:00Z',
      steps: [
        { stepId: 's1', exerciseKey: 'kb_swing', target: 28, sets: [{ load: 28 }, { load: 32 }] },
        { stepId: 's1', exerciseKey: 'bw_squat', sets: [{ reps: 15 }] },
      ],
    };
    render(<ResultSheet runsheet={priyanka()} initial={initial} onSave={onSave} />);
    fireEvent.click(screen.getByText('Save result'));
    const saved: SessionResult = onSave.mock.calls[0][0];
    expect(saved.id).toBe('s-abc-run');
    expect(saved.steps.find(x => x.stepId === 's1' && x.exerciseKey === 'kb_swing')?.sets).toEqual([{ load: 28 }, { load: 32 }]);
    expect(saved.steps.find(x => x.exerciseKey === 'bw_squat')?.sets).toEqual([{ reps: 15 }]);
  });
});

describe('ResultSheet celebration and effort', () => {
  const initial: SessionResult = { id: 's-now', runsheetId: 'p', startedAt: '2026-09-27T10:00:00Z', steps: [{ stepId: 's1', exerciseKey: 'kb_swing', sets: [{ load: 32, reps: 10 }] }] };
  const before: SessionResult = { id: 's-old', runsheetId: 'p', startedAt: '2026-09-20T10:00:00Z', steps: [{ stepId: 's1', exerciseKey: 'kb_swing', sets: [{ load: 28, reps: 10 }] }] };

  it('leads with the workout count and the record set today', () => {
    render(<ResultSheet runsheet={priyanka()} initial={initial} history={[before]} onSave={vi.fn()} />);
    expect(screen.getByText('Workout 2')).toBeTruthy();
    expect(screen.getByText('New record')).toBeTruthy();
  });

  it('saves the effort tapped, and nothing when none is', () => {
    const onSave = vi.fn();
    render(<ResultSheet runsheet={priyanka()} initial={initial} onSave={onSave} />);
    fireEvent.click(screen.getByLabelText('Effort 7'));
    fireEvent.click(screen.getByText('Save result'));
    expect(onSave.mock.calls[0][0].rpe).toBe(7);
  });

  it('a second tap on the same number clears it', () => {
    const onSave = vi.fn();
    render(<ResultSheet runsheet={priyanka()} initial={initial} onSave={onSave} />);
    fireEvent.click(screen.getByLabelText('Effort 7'));
    fireEvent.click(screen.getByLabelText('Effort 7'));
    fireEvent.click(screen.getByText('Save result'));
    expect(onSave.mock.calls[0][0].rpe).toBeUndefined();
  });
});

describe('ResultSheet made it / missed', () => {
  it('asks only for the exercises a progression rule reads', () => {
    const lift = (id: string, key: string, name: string) => ({ kind: 'exercise' as const, id, exercise: { key, name, unit: 'kg', step: 2.5 }, forMode: 'reps' as const, forValue: 5, target: 60 });
    const r = {
      id: 'ruled',
      title: 'Squat day',
      items: [
        { kind: 'block' as const, id: 'b1', name: 'Squat', repeat: 5, progression: { onSuccessKg: 2.5 }, steps: [lift('sq', 'bb_back_squat', 'Squat')] },
        { kind: 'block' as const, id: 'b2', name: 'Accessories', repeat: 3, steps: [lift('row', 'bb_row', 'Row')] },
      ],
    };
    const onSave = vi.fn();
    render(<ResultSheet runsheet={r} onSave={onSave} />);
    expect(screen.getAllByText('Made it')).toHaveLength(1);
    fireEvent.click(screen.getByText('Save result'));
    const saved: SessionResult = onSave.mock.calls[0][0];
    expect(saved.steps.find(x => x.stepId === 'sq')?.success).toBe(true);
    expect(saved.steps.find(x => x.stepId === 'row')?.success).toBeUndefined();
  });
});

describe('ResultSheet last time notes', () => {
  it('shows the notes of the session before this one, not this one already logged at done', () => {
    const now: SessionResult = { id: 's-now', runsheetId: 'p', startedAt: '2026-09-27T10:00:00Z', steps: [] };
    const before: SessionResult = { id: 's-old', runsheetId: 'p', startedAt: '2026-09-20T10:00:00Z', steps: [], notes: 'Bells felt light' };
    render(<ResultSheet runsheet={priyanka()} initial={now} history={[now, before]} onSave={vi.fn()} />);
    expect(screen.getByText('Bells felt light')).toBeTruthy();
  });
});

describe('ResultSheet logs only what was done', () => {
  const initial: SessionResult = { id: 's-now-run', runsheetId: 'p', startedAt: '2026-09-27T10:00:00Z', steps: [{ stepId: 's1', exerciseKey: 'kb_swing', target: 28, success: true, sets: [{ load: 28 }] }] };
  it('has no row for a step the timer never logged', () => {
    const onSave = vi.fn();
    render(<ResultSheet runsheet={priyanka()} initial={initial} onSave={onSave} />);
    expect(screen.queryByText('Incline chest press')).toBeNull();
    fireEvent.click(screen.getByText('Save result'));
    const saved: SessionResult = onSave.mock.calls[0][0];
    expect(saved.steps.map(x => x.stepId)).toEqual(['s1']);
  });
  it('without a timer run, every planned step is there to log by hand', () => {
    expect(save().steps.map(x => x.stepId)).toEqual(['s1', 's2', 's3', 's4', 's5', 's6']);
  });
  it('Discard of a logged session asks first, then discards', () => {
    const onCancel = vi.fn();
    render(<ResultSheet runsheet={priyanka()} initial={initial} onSave={vi.fn()} onCancel={onCancel} />);
    fireEvent.click(screen.getByText('Discard'));
    expect(onCancel).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('Discard workout'));
    expect(onCancel).toHaveBeenCalledOnce();
  });
});

describe('ResultSheet load and round times', () => {
  it('a load changed here reaches the sets the logbook reads', () => {
    const onSave = vi.fn();
    const initial: SessionResult = { id: 's-l', runsheetId: 'p', startedAt: '2026-09-27T10:00:00Z', steps: [{ stepId: 's1', exerciseKey: 'kb_swing', target: 28, success: true, sets: [{ load: 28 }, { load: 28 }] }] };
    render(<ResultSheet runsheet={priyanka()} initial={initial} onSave={onSave} />);
    fireEvent.click(within(screen.getAllByRole('group', { name: 'Load used' })[0]).getByLabelText('Increase'));
    fireEvent.click(screen.getByText('Save result'));
    const row = onSave.mock.calls[0][0].steps.find((x: { stepId: string }) => x.stepId === 's1');
    expect(row.sets.map((x: { load: number }) => x.load)).toEqual([32, 32]);
    expect(row.target).toBe(32);
  });
  it('has no load stepper on an exercise counted in metres or seconds, and saves its sets untouched', () => {
    const onSave = vi.fn();
    const sheet: Runsheet = { id: 'm', title: 'Row and hold', items: [{ ...makeExercise(EX.row_erg, { forMode: 'meters', forValue: 1000 }), id: 'row' }, { ...makeExercise(EX.bw_plank, { forMode: 'seconds', forValue: 60 }), id: 'hold' }] };
    const initial: SessionResult = { id: 's-m', runsheetId: 'm', startedAt: '2026-09-27T10:00:00Z', steps: [{ stepId: 'row', exerciseKey: EX.row_erg.key, sets: [{ meters: 1000, seconds: 240 }] }, { stepId: 'hold', exerciseKey: EX.bw_plank.key, sets: [{ seconds: 60 }] }] };
    render(<ResultSheet runsheet={sheet} initial={initial} onSave={onSave} />);
    expect(screen.queryByRole('group', { name: 'Load used' })).toBeNull();
    fireEvent.click(screen.getByText('Save result'));
    const saved: SessionResult = onSave.mock.calls[0][0];
    expect(saved.steps.map(x => x.sets)).toEqual([[{ meters: 1000, seconds: 240 }], [{ seconds: 60 }]]);
  });
  it('shows each round against the same round last time', () => {
    const initial: SessionResult = { id: 's-r', runsheetId: 'p', startedAt: '2026-09-27T10:00:00Z', steps: [], splits: [{ blockId: 'b1', at: [100, 190], from: 5 }] };
    const before: SessionResult = { id: 's-o', runsheetId: priyanka().id!, startedAt: '2026-09-20T10:00:00Z', steps: [], splits: [{ blockId: 'b1', at: [105, 200], from: 5 }] };
    render(<ResultSheet runsheet={priyanka()} initial={initial} history={[before]} onSave={vi.fn()} />);
    expect(screen.getByLabelText('Round times')).toBeTruthy();
    expect(screen.getByLabelText('Round 2 1:30, fastest')).toBeTruthy();
    expect(screen.getAllByText('−5 s')).toHaveLength(2);
  });
});
