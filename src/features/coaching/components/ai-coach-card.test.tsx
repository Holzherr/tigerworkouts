import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AiCoachCard } from './ai-coach-card';

const coach = { name: 'AI Coach', active: true, since: '2026-10-19T08:00:00Z' };

describe('AiCoachCard', () => {
  it('names the AI coach and renames it', async () => {
    const onRename = vi.fn(async () => null);
    render(<AiCoachCard coach={coach} onRename={onRename} onActive={() => {}} />);
    expect(screen.getByText('Coached by AI Coach · AI')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Rename' }));
    fireEvent.change(screen.getByLabelText('AI coach name'), { target: { value: 'Coach Claude' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onRename).toHaveBeenCalledWith('Coach Claude'));
    expect(screen.queryByLabelText('AI coach name')).not.toBeInTheDocument();
  });

  it('keeps the field open with the error when a rename fails', async () => {
    render(<AiCoachCard coach={coach} onRename={async () => 'A name of 1 to 40 characters.'} onActive={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Rename' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('A name of 1 to 40 characters.')).toBeInTheDocument();
  });

  it('removes only after confirming, and offers it back once removed', () => {
    const onActive = vi.fn();
    const ask = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    const { rerender } = render(<AiCoachCard coach={coach} onRename={async () => null} onActive={onActive} />);
    fireEvent.click(screen.getByRole('button', { name: 'Remove AI coach' }));
    expect(onActive).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Remove AI coach' }));
    expect(onActive).toHaveBeenCalledWith(false);
    rerender(<AiCoachCard coach={{ ...coach, active: false }} onRename={async () => null} onActive={onActive} />);
    fireEvent.click(screen.getByRole('button', { name: 'Bring back AI Coach' }));
    expect(onActive).toHaveBeenLastCalledWith(true);
    ask.mockRestore();
  });
});
