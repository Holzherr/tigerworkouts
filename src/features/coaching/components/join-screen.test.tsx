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
  it('asks a nameless client for their name before Accept, and passes it on', async () => {
    const onAccept = vi.fn(async () => null);
    render(<JoinScreen info={{ name: 'Sam Fixture', accepted: false } as never} signedIn askName onAccept={onAccept} onContinue={() => {}} />);
    const accept = screen.getByRole('button', { name: 'Accept' }) as HTMLButtonElement;
    expect(accept.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Your name'), { target: { value: ' Alex ' } });
    fireEvent.click(accept);
    await screen.findByText(/You’re training with Sam Fixture/);
    expect(onAccept).toHaveBeenCalledWith('Alex');
  });
});
