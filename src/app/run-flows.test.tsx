import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import App from '@/App';
import { EX } from '@/features/runsheet/fixtures';
import { makeExercise, type Runsheet } from '@/features/runsheet/model';
import type { SessionResult } from '@/features/runsheet/progression';
import { setState } from './store';

// Two loose steps: no block gate between them.
const loose: Runsheet = { id: 'mine', title: 'Mine', items: [{ ...makeExercise(EX.bw_pushup, { forMode: 'reps', forValue: 5 }), id: 'p1' }, { ...makeExercise(EX.bw_squat, { forMode: 'reps', forValue: 5 }), id: 'p2' }] };
// Two blocks: the second opens on a gate.
const blocks: Runsheet = {
  id: 'two',
  title: 'Two blocks',
  items: [
    { kind: 'block', id: 'b1', name: 'One', repeat: 1, steps: [{ ...makeExercise(EX.bw_pushup, { forMode: 'reps', forValue: 5 }), id: 'q1' }] },
    { kind: 'block', id: 'b2', name: 'Two', repeat: 1, steps: [{ ...makeExercise(EX.bw_squat, { forMode: 'reps', forValue: 5 }), id: 'q2' }] },
  ],
};

const stored = (): SessionResult[] => JSON.parse(localStorage.getItem('workout-hub-next:v1') || '{}').results ?? [];
const click = (name: string | RegExp) => fireEvent.click(screen.getByRole('button', { name }));
const findClick = async (name: string | RegExp) => fireEvent.click(await screen.findByRole('button', { name }));

/** Open a saved workout from Discover (origin "saved") and start it, past the lead-in. */
const startSaved = async (title = 'Mine') => {
  location.hash = '#/';
  render(<App />);
  fireEvent.click(await screen.findByRole('button', { name: new RegExp(`^${title}`) }));
  await findClick(/^Start$/);
  await findClick(/^Skip$/);
};
/** A reload: the page goes, what is on disk stays. */
const reload = () => {
  cleanup();
  render(<App />);
};
const endAndSave = async () => {
  click('More');
  click(/End workout/);
  click(/Finish and save/);
  await screen.findByText('Save result');
};

beforeEach(() => {
  cleanup();
  localStorage.clear();
  sessionStorage.clear();
  setState({ signedIn: true, results: [], workouts: [loose, blocks], saved: ['mine', 'two'] });
});

describe('where a session was started from', () => {
  it('rides on the row the timer logs', async () => {
    await startSaved();
    await endAndSave();
    expect(stored().map(r => r.startedFrom)).toEqual(['saved']);
  });
  it('survives a reload and a resume', async () => {
    await startSaved();
    reload();
    await findClick('Resume');
    await endAndSave();
    expect(stored().map(r => r.startedFrom)).toEqual(['saved']);
  });
  it('rides on a kept run saved as it stands', async () => {
    await startSaved();
    click('Done');
    reload();
    await findClick('Save what I did');
    await screen.findByText('Save result');
    expect(stored().map(r => r.startedFrom)).toEqual(['saved']);
  });
});

describe('undo in the timer', () => {
  it('is gone once the session is done, so a finished run cannot come back', async () => {
    await startSaved();
    click('More');
    click(/Skip this step/);
    expect(screen.getByRole('button', { name: 'Undo' })).toBeTruthy();
    click('Done');
    await screen.findByText('Workout saved');
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull();
  });
  it('is gone once the next block is started', async () => {
    await startSaved('Two blocks');
    click('More');
    click(/Skip this step/);
    expect(screen.getByRole('button', { name: 'Undo' })).toBeTruthy();
    click(/Start block/);
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull();
  });
});

describe('ending a session', () => {
  it('asks before Discard throws the session away, then keeps nothing', async () => {
    await startSaved();
    click('More');
    click(/End workout/);
    click('Discard');
    expect(localStorage.getItem('tiger:run')).not.toBeNull();
    expect(screen.getByText('Discard this session?')).toBeTruthy();
    click('Discard session');
    await waitFor(() => expect(location.hash).toBe('#/w/mine'));
    expect(localStorage.getItem('tiger:run')).toBeNull();
    expect(stored()).toEqual([]);
  });
  it('says End this session?', async () => {
    await startSaved();
    click('More');
    click(/End workout/);
    expect(screen.getByText('End this session?')).toBeTruthy();
  });
});

describe('a reload on the result sheet', () => {
  it('Save keeps one row, the one the timer logged', async () => {
    await startSaved();
    await endAndSave();
    const id = stored()[0].id;
    reload();
    await findClick(/Save result/);
    expect(stored().map(r => r.id)).toEqual([id]);
  });
  it('Discard takes the logged row out', async () => {
    await startSaved();
    await endAndSave();
    reload();
    await findClick(/^Discard$/);
    click('Discard workout');
    expect(stored()).toEqual([]);
  });
});

describe('the web timer and the screen', () => {
  it('says plainly that it needs the screen on', async () => {
    location.hash = '#/';
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: /^Mine/ }));
    await findClick(/^Start$/);
    expect(await screen.findByText(/needs the screen on/)).toBeTruthy();
  });
});
