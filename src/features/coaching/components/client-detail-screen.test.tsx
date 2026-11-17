import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Runsheet } from '@/features/runsheet/model';
import { ClientDetailScreen } from './client-detail-screen';

afterEach(cleanup);

const w = (id: string, title: string): Runsheet => ({ id, title, items: [] });

describe('sending a client a workout (U5)', () => {
  it('lists own and saved, searches the catalogue, and sends the one picked', async () => {
    const onAssign = vi.fn(async () => null);
    render(
      <ClientDetailScreen
        client={{ id: 'c', name: 'Alex Client' }}
        me="me"
        workouts={[w('u-1', 'Legs day')]}
        saved={[w('pub-1', 'Upper body')]}
        catalogue={[w('cindy', 'Cindy'), w('sl-a', 'StrongLifts A')]}
        assignments={[]}
        sessions={[]}
        notes={[]}
        lookup={() => undefined}
        exercise={k => ({ name: k, unit: '' })}
        onAssign={onAssign}
        onUnassign={() => {}}
        onAddNote={async () => null}
        onEnd={() => {}}
        onBack={() => {}}
      />
    );
    expect(within(screen.getByRole('group', { name: 'Yours' })).getByText('Legs day')).toBeTruthy();
    expect(within(screen.getByRole('group', { name: 'Saved' })).getByText('Upper body')).toBeTruthy();
    expect(screen.queryByRole('group', { name: 'From the catalogue' })).toBeNull();
    fireEvent.change(screen.getByLabelText('Find a workout'), { target: { value: 'cindy' } });
    fireEvent.click(within(screen.getByRole('group', { name: 'From the catalogue' })).getByText('Cindy'));
    fireEvent.click(screen.getByRole('button', { name: 'Send Cindy to Alex' }));
    await vi.waitFor(() => expect(onAssign).toHaveBeenCalledWith(expect.objectContaining({ id: 'cindy' }), ''));
  });
});
