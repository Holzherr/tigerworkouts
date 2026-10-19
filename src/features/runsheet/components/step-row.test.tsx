import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { EX } from '../fixtures';
import { makeExercise, type ExerciseStep } from '../model';
import { StepRow } from './step-row';

const rower: ExerciseStep = { ...makeExercise(EX.cardio_rower, { forMode: 'seconds', forValue: 30 }), id: 'rw' };
const row = (step: ExerciseStep, onChange = vi.fn()) => (render(<StepRow step={step} expanded onToggle={() => {}} onChange={onChange} onRemove={() => {}} />), onChange);

describe('StepRow: what a step logs', () => {
  it('a timed rower has no log row until Add to log is tapped, then offers what a rower counts: Metres, Calories', () => {
    const onChange = row(rower);
    expect(screen.queryByText('Metres')).toBeNull();
    fireEvent.click(screen.getByText('Add to log'));
    expect(screen.queryByRole('button', { name: 'Reps' })).toBeNull();
    expect(['Metres', 'Calories'].map(t => !!screen.getByRole('button', { name: t }))).toEqual([true, true]);
    fireEvent.click(screen.getByText('Metres'));
    expect(onChange).toHaveBeenCalledWith({ ...rower, log: 'meters' });
  });
  it('a rower logging metres can add calories too, and logs both', () => {
    const onChange = row({ ...rower, log: 'meters' });
    fireEvent.click(screen.getByText('Add to log'));
    expect(screen.queryByRole('button', { name: 'Metres' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Calories' }));
    expect(onChange).toHaveBeenCalledWith({ ...rower, log: ['meters', 'calories'] });
  });
  it('a step logging both shows a row each; taking one off leaves the other as a single value', () => {
    const onChange = row({ ...rower, log: ['meters', 'calories'] });
    expect(screen.getByText('Metres')).toBeTruthy();
    expect(screen.getByText('Calories')).toBeTruthy();
    expect(screen.queryByText('Add to log')).toBeNull();
    fireEvent.click(screen.getByLabelText('Stop logging metres'));
    expect(onChange).toHaveBeenCalledWith({ ...rower, log: 'calories' });
  });
  it('a rower has no weight row; a kettlebell has one, a treadmill a speed row', () => {
    row(rower);
    expect(screen.queryByLabelText('Weight')).toBeNull();
    expect(screen.queryByText(/\(m\)/)).toBeNull();
    row({ ...makeExercise(EX.kb_swing, { forMode: 'seconds', forValue: 30 }), id: 'kb' });
    expect(screen.getByLabelText('Weight')).toBeTruthy();
  });
  it('a treadmill sprint has a speed row', () => {
    row({ ...makeExercise(EX.sprint, { target: 14.5 }), id: 'sp' });
    expect(screen.getByLabelText('Speed')).toBeTruthy();
    expect(screen.queryByLabelText('Weight')).toBeNull();
  });
  it('a timed kettlebell can log reps only', () => {
    row({ ...makeExercise(EX.kb_swing, { forMode: 'seconds', forValue: 30 }), id: 'kb' });
    fireEvent.click(screen.getByText('Add to log'));
    expect(screen.getByRole('button', { name: 'Reps' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Metres' })).toBeNull();
  });
  it('a step that logs metres shows the row, and its ✕ takes it off', () => {
    const onChange = row({ ...rower, log: 'meters' });
    expect(screen.getByText('Metres')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Stop logging metres'));
    expect(onChange.mock.calls[0][0]).not.toHaveProperty('log');
  });
  it('a reps step of a lift has nothing more to log, so no Add to log', () => {
    row({ ...makeExercise(EX.db_row, { forMode: 'reps', forValue: 10, target: 20 }), id: 'cs' });
    expect(screen.queryByText('Add to log')).toBeNull();
  });
});
