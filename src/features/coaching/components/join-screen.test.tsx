import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { JoinScreen } from './join-screen';

afterEach(cleanup);

describe('an invite link', () => {
  it('that does not work still has a way on into the app', () => {
    const onContinue = vi.fn();
    render(<JoinScreen info={null} signedIn={false} onAccept={async () => null} onContinue={onContinue} />);
    expect(screen.getByText('That invite link does not work. Ask your coach for a new one.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Go to TigerWorkouts' }));
    expect(onContinue).toHaveBeenCalled();
  });
  it('says where the coach’s workouts show once accepted', async () => {
    render(<JoinScreen info={{ name: 'Sam Fixture', accepted: false } as never} signedIn onAccept={async () => null} onContinue={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Accept' }));
    expect(await screen.findByText('Workouts they send you show first in Mine, marked New · made for you.')).toBeTruthy();
  });
});
