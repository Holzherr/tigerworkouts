import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { EX } from '../fixtures';
import { makeExercise, type ExerciseStep } from '../model';
import { StepRow } from './step-row';

const rower: ExerciseStep = { ...makeExercise(EX.cardio_rower, { forMode: 'seconds', forValue: 30 }), id: 'rw' };
const row = (step: ExerciseStep, onChange = vi.fn()) => (render(<StepRow step={step} expanded onToggle={() => {}} onChange={onChange} onRemove={() => {}} />), onChange);

describe('StepRow: what a step logs', () => {
  it('a timed rower has no log row until Add to log is tapped, then offers Reps, Metres, Calories', () => {
    const onChange = row(rower);
    expect(screen.queryByText('Metres')).toBeNull();
    fireEvent.click(screen.getByText('Add to log'));
    expect(['Reps', 'Metres', 'Calories'].map(t => !!screen.getByText(t))).toEqual([true, true, true]);
    fireEvent.click(screen.getByText('Metres'));
    expect(onChange).toHaveBeenCalledWith({ ...rower, log: 'meters' });
  });
  it('a step that logs metres shows the row, and its ✕ takes it off', () => {
    const onChange = row({ ...rower, log: 'meters' });
    expect(screen.getByText('Metres')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Stop logging metres'));
    expect(onChange.mock.calls[0][0]).not.toHaveProperty('log');
  });
  it('a reps step is not offered reps again', () => {
    row({ ...makeExercise(EX.db_row, { forMode: 'reps', forValue: 10, target: 20 }), id: 'cs' });
    fireEvent.click(screen.getByText('Add to log'));
    expect(screen.queryByRole('button', { name: 'Reps' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Metres' })).toBeTruthy();
  });
});
