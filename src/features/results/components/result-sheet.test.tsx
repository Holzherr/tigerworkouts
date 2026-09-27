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
