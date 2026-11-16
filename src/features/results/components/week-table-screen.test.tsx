import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { WeekTable } from '../week-table';
import { WeekByWeekRow, WeekTableScreen } from './week-table-screen';

const table: WeekTable = {
  columns: [
    { id: 'a', startedAt: '2026-11-02T10:00:00Z', week: 1, latest: false, runsheetId: 'w1', label: 'Wk 1' },
    { id: 'b', startedAt: '2026-11-09T10:00:00Z', week: 2, latest: true, runsheetId: 'w2', label: 'Wk 2' },
  ],
  rows: [
    { exerciseKey: 'bb_hip_thrust', name: 'Hip thrust', set: 0, id: 'bb_hip_thrust#0', cells: [{ set: { load: 100, reps: 8 }, text: '100 × 8' }, { set: { load: 105, reps: 6 }, text: '105 × 6', delta: '+5 kg · −2 reps', better: true }] },
    { exerciseKey: 'bb_hip_thrust', name: 'Hip thrust', set: 1, id: 'bb_hip_thrust#1', cells: [{ set: { load: 100, reps: 8 }, text: '100 × 8' }, null] },
  ],
};

describe('week by week', () => {
  it('shows a column per session with the newest marked, each set, the change, and opens an exercise', () => {
    const onExercise = vi.fn();
    render(<WeekTableScreen title="Hip day" table={table} onBack={() => {}} onExercise={onExercise} />);
    expect(screen.getByRole('columnheader', { current: true }).textContent).toContain('Wk 2');
    expect(screen.getAllByRole('rowheader').map(h => h.textContent)).toEqual(['Hip thrust ', 'Set 1', 'Set 2']);
    expect(screen.getByText('+5 kg')).toBeTruthy();
    expect(screen.getByText('−2 reps')).toBeTruthy();
    expect(screen.getByText('–')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Hip thrust/ }));
    expect(onExercise).toHaveBeenCalledWith('bb_hip_thrust');
  });

  it('says what it will show when nothing is logged', () => {
    render(<WeekTableScreen title="Hip day" table={{ columns: [], rows: [] }} onBack={() => {}} onExercise={() => {}} />);
    expect(screen.getByText(/Nothing logged yet/)).toBeTruthy();
  });

  it('the workout page row counts the sessions', () => {
    render(<WeekByWeekRow table={table} onOpen={() => {}} />);
    expect(screen.getByTestId('week-by-week').textContent).toMatch(/2 sessions · last 9 Nov/);
  });
});
