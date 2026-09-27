import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { priyanka } from '@/features/runsheet/fixtures';
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
