import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { EX } from '@/features/runsheet/fixtures';
import { ExerciseHistoryScreen } from './exercise-history-screen';

describe('ExerciseHistoryScreen before it is logged (review round 2 U14)', () => {
  it('shows the clip, the muscles and the workouts that use it, then Not logged yet', () => {
    const onWorkout = vi.fn();
    render(<ExerciseHistoryScreen exercise={EX.kb_swing} results={[]} onBack={() => {}} muscles={{ main: ['glutes'], also: ['core'] }} usedIn={{ total: 12, top: [{ id: 'w1', title: 'Swing day' }] }} onWorkout={onWorkout} />);
    expect(screen.getByLabelText('Kettlebell swings, demo')).toBeInTheDocument();
    expect(screen.getByText('Glutes')).toBeInTheDocument();
    expect(screen.getByText('Core')).toBeInTheDocument();
    expect(screen.getByText('In 12 workouts')).toBeInTheDocument();
    expect(screen.getByText(/Not logged yet/)).toBeInTheDocument();
    fireEvent.click(screen.getByText('Swing day'));
    expect(onWorkout).toHaveBeenCalledWith('w1');
  });
  it('leaves the workouts out when none use it', () => {
    render(<ExerciseHistoryScreen exercise={EX.kb_swing} results={[]} onBack={() => {}} usedIn={{ total: 0, top: [] }} />);
    expect(screen.queryByText(/^In \d/)).not.toBeInTheDocument();
  });
});
