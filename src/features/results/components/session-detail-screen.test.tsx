import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { SessionResult } from '@/features/runsheet/progression';
import { SessionDetailScreen } from './session-detail-screen';

const exercise = (key: string) => ({ key, name: key === 'bench' ? 'Bench' : 'Row', unit: key === 'bench' ? 'kg' : 'm', step: 2.5 });
const result: SessionResult = {
  id: 's1',
  runsheetId: 'w',
  startedAt: '2026-09-27T10:00:00Z',
  steps: [
    { stepId: 'a', exerciseKey: 'bench', target: 60, reps: [8], sets: [{ load: 60, reps: 8, at: 300 }] },
    { stepId: 'r', exerciseKey: 'row', sets: [{ meters: 500, seconds: 101 }] },
  ],
  splits: [{ blockId: 'b', at: [100, 190, 300], from: 5 }],
};

describe('SessionDetailScreen', () => {
  it('shows the sets with their times, and the round times', () => {
    render(<SessionDetailScreen result={result} exercise={exercise} onBack={vi.fn()} onChange={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getByText('60 × 8')).toBeTruthy();
    expect(screen.getByText('500 m in 1:41')).toBeTruthy();
    expect(screen.getByLabelText('Round 2 1:30, fastest')).toBeTruthy();
    expect(screen.getByLabelText('Round 3 1:50, slowest')).toBeTruthy();
  });
  it('edits a set, and the row reads the edit', () => {
    const onChange = vi.fn();
    render(<SessionDetailScreen result={result} exercise={exercise} onBack={vi.fn()} onChange={onChange} onDelete={vi.fn()} />);
    fireEvent.click(screen.getByText('Edit sets'));
    fireEvent.change(screen.getAllByLabelText('Set 1 kg')[0], { target: { value: '62.5' } });
    expect(onChange.mock.calls[0][0].steps[0]).toMatchObject({ target: 62.5, sets: [{ load: 62.5, reps: 8, at: 300 }] });
    fireEvent.change(screen.getByLabelText('Set 1 Sec'), { target: { value: '99' } });
    expect(onChange.mock.calls[1][0].steps[1].sets).toEqual([{ meters: 500, seconds: 99 }]);
    fireEvent.click(screen.getAllByLabelText(/Set 1: Normal/)[0]);
    expect(onChange.mock.calls[2][0].steps[0].sets[0].type).toBe('warmup');
  });
});
