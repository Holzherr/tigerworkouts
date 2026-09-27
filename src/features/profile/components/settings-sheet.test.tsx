import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SettingsSheet } from './settings-sheet';

const sheet = (onDeleteAccount = vi.fn(async () => 'Account deleted.')) => {
  render(<SettingsSheet open onOpenChange={() => {}} name="Nick" onChange={() => {}} onInvite={() => {}} onSignOut={() => {}} onDeleteAccount={onDeleteAccount} />);
  return onDeleteAccount;
};

describe('SettingsSheet', () => {
  it('deletes the account only after a confirm, with the device choice made explicit', async () => {
    const del = sheet();
    fireEvent.click(screen.getByText('Delete account'));
    expect(del).not.toHaveBeenCalled();
    fireEvent.click(screen.getByLabelText(/Also clear this device/));
    fireEvent.click(screen.getAllByText('Delete account').at(-1)!);
    await waitFor(() => expect(del).toHaveBeenCalledWith(true));
    expect(await screen.findByText('Account deleted.')).toBeTruthy();
  });

  it('keeps this device by default and can be cancelled', async () => {
    const del = sheet();
    fireEvent.click(screen.getByText('Delete account'));
    fireEvent.click(screen.getByText('Cancel'));
    expect(del).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('Delete account'));
    fireEvent.click(screen.getAllByText('Delete account').at(-1)!);
    await waitFor(() => expect(del).toHaveBeenCalledWith(false));
  });

  it('no longer offers units or an editor drag style', () => {
    sheet();
    expect(screen.queryByText('Units')).toBeNull();
    expect(screen.queryByText('Editor drag style')).toBeNull();
  });
});
