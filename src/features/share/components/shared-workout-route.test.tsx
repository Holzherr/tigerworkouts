import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from '@/App';
import { setState } from '@/app/store';
import type { Runsheet } from '@/features/runsheet/model';
import { SharedWorkoutRoute } from './shared-workout-route';

const fetchWorkout = vi.hoisted(() => vi.fn());
vi.mock('@/features/cloud/sync', async orig => ({ ...(await orig<object>()), fetchPublicWorkouts: async () => [], fetchWorkout }));

const shared: Runsheet = { id: 'u-shared1', title: 'Fixture coach circuit', items: [{ kind: 'rest', id: 'r1', seconds: 30 }] };
const openLink = (id: string) => ((location.hash = `#/w/${id}`), render(<App />));
beforeEach(() => {
  cleanup();
  fetchWorkout.mockReset();
  setState({ signedIn: false, results: [], workouts: [], saved: [] });
});

describe('a #/w/ link to someone’s workout', () => {
  it('shows a loading line, never "not found", until the row arrives, then the workout page', async () => {
    let settle!: (r: Runsheet) => void;
    fetchWorkout.mockReturnValueOnce(new Promise(res => (settle = res)));
    openLink('u-shared1');
    expect(screen.getByRole('status').textContent).toBe('Opening workout…');
    expect(screen.queryByText(/Workout not found/)).toBeNull();
    settle(shared);
    expect(await screen.findByText('Fixture coach circuit')).toBeTruthy();
  });

  it('says a hidden row is private to a signed-in visitor, with a way back', async () => {
    fetchWorkout.mockResolvedValueOnce(null);
    const onBack = vi.fn();
    render(<SharedWorkoutRoute id="u-private1" signedIn signIn={null} onFound={() => {}} onBack={onBack} />);
    expect(await screen.findByText('This workout is private. Only its owner can open it.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Back to Discover' }));
    expect(onBack).toHaveBeenCalled();
  });

  it('asks a signed-out visitor to sign in when the row is hidden: it may be their own', async () => {
    fetchWorkout.mockResolvedValueOnce(null);
    openLink('u-mine1');
    expect(await screen.findByText('Sign in to see this workout')).toBeTruthy();
  });

  it('still says not found for an unknown catalogue id, without asking the server', () => {
    openLink('cf-no-such-workout');
    expect(screen.getByText(/Workout not found/)).toBeTruthy();
    expect(fetchWorkout).not.toHaveBeenCalled();
  });
});
