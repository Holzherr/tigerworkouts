import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Runsheet } from '../model';
import { EditorScreen } from './editor-screen';

const r: Runsheet = { title: 'Legs', items: [] };
const editor = (dirty: boolean) => {
  const on = { onBack: vi.fn(), onDiscard: vi.fn(), onSaveAndLeave: vi.fn(), onReset: vi.fn(), onSaveAsMine: vi.fn() };
  render(<EditorScreen runsheet={r} onChange={() => {}} onPickExercise={async () => null} mode="author" dirty={dirty} {...on} />);
  return on;
};

describe('EditorScreen leaving a new workout (as iOS)', () => {
  it('leaves at once with nothing to keep', () => {
    const on = editor(false);
    fireEvent.click(screen.getByText('Back'));
    expect(on.onBack).toHaveBeenCalled();
    expect(screen.queryByText('Save this workout?')).toBeNull();
  });

  it('asks Save, Discard or Keep editing on Back', () => {
    const on = editor(true);
    fireEvent.click(screen.getByText('Back'));
    expect(screen.getByText('Save this workout?')).toBeTruthy();
    expect(screen.getByText('Save keeps it in Mine. Discard deletes it.')).toBeTruthy();
    fireEvent.click(screen.getByText('Keep editing'));
    expect(on.onBack).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('Back'));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(on.onSaveAndLeave).toHaveBeenCalled();
    expect(on.onSaveAsMine).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('Back'));
    fireEvent.click(screen.getByText('Discard'));
    expect(on.onDiscard).toHaveBeenCalled();
    expect(on.onBack).not.toHaveBeenCalled();
  });

  it('asks Discard or Keep editing on Reset, with no Save', () => {
    const on = editor(true);
    fireEvent.click(screen.getByText('Reset'));
    expect(screen.getByText('Throw away your changes?')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
    fireEvent.click(screen.getByText('Discard'));
    expect(on.onReset).toHaveBeenCalled();
    expect(on.onDiscard).not.toHaveBeenCalled();
  });
});
