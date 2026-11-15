import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Stepper } from './stepper';

describe('typing a number into a stepper', () => {
  it('takes a decimal with a comma and asks for the numeric keypad', () => {
    const onChange = vi.fn();
    render(<Stepper aria-label="Load" value={20} step={2.5} onChange={onChange} />);
    const field = screen.getByLabelText('Load value') as HTMLInputElement;
    expect(field.inputMode).toBe('decimal');
    fireEvent.focus(field);
    fireEvent.change(field, { target: { value: '27,5' } });
    fireEvent.blur(field);
    expect(onChange).toHaveBeenCalledWith(27.5);
  });
  it('clamps to the range and ignores what is not a number', () => {
    const onChange = vi.fn();
    render(<Stepper aria-label="Reps" value={8} min={1} max={50} onChange={onChange} />);
    const field = screen.getByLabelText('Reps value');
    fireEvent.focus(field);
    fireEvent.change(field, { target: { value: '400' } });
    fireEvent.blur(field);
    expect(onChange).toHaveBeenLastCalledWith(50);
    fireEvent.focus(field);
    fireEvent.change(field, { target: { value: 'ten' } });
    fireEvent.blur(field);
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});
