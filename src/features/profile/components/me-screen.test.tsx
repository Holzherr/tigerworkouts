import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MeScreen } from './me-screen';

const base = { name: 'Nick', status: 'Signed in', results: [], load: {}, onBodyweight: () => {}, onSettings: () => {}, onOpenHistory: () => {}, onOpenWeek: () => {} };

describe('MeScreen rows (review round 2 U12)', () => {
  it('lists Creator page and Coach clients as rows that open their own screens, in order', () => {
    const onCreatorPage = vi.fn();
    const onCoach = vi.fn();
    render(<MeScreen {...base} onOpenExercises={() => {}} onExport={() => {}} onImport={() => {}} onCreatorPage={onCreatorPage} publicCount={2} onCoach={onCoach} />);
    const rows = screen.getAllByRole('button').map(b => b.textContent ?? '');
    const at = (t: string) => rows.findIndex(r => r.startsWith(t));
    expect([at('Exercises'), at('Export history'), at('Creator page'), at('Coach clients'), at('Import')].every((i, n, a) => i >= 0 && (n === 0 || i > a[n - 1]))).toBe(true);
    expect(screen.getByText('2 public workouts')).toBeInTheDocument();
    expect(screen.getAllByText('Coach clients')).toHaveLength(1);
    expect(screen.queryByLabelText('Bio')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Creator page'));
    expect(onCreatorPage).toHaveBeenCalled();
    fireEvent.click(screen.getByText('Coach clients'));
    expect(onCoach).toHaveBeenCalled();
  });
  it('leaves the Creator page row out when signed out', () => {
    render(<MeScreen {...base} />);
    expect(screen.queryByText('Creator page')).not.toBeInTheDocument();
  });
});
