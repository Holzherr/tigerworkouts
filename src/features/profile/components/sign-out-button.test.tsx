import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SignOutButton, SIGN_OUT_NOTE } from './sign-out-button';

describe('SignOutButton', () => {
  it('signs out only after a confirm that says what happens', async () => {
    const out = vi.fn(async () => undefined);
    render(<SignOutButton onSignOut={out} />);
    fireEvent.click(screen.getByText('Sign out'));
    expect(out).not.toHaveBeenCalled();
    expect(screen.getByText(SIGN_OUT_NOTE)).toBeTruthy();
    fireEvent.click(screen.getByText('Cancel'));
    expect(out).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('Sign out'));
    fireEvent.click(screen.getAllByText('Sign out').at(-1)!);
    await waitFor(() => expect(out).toHaveBeenCalledOnce());
  });

  it('shows why a sign-out was refused', async () => {
    render(<SignOutButton onSignOut={async () => 'Some sessions are not saved to your account yet; try again when online.'} />);
    fireEvent.click(screen.getByText('Sign out'));
    fireEvent.click(screen.getAllByText('Sign out').at(-1)!);
    expect(await screen.findByText(/not saved to your account yet/)).toBeTruthy();
  });
});
