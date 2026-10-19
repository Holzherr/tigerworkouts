import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import App from '@/App';
import { EX } from '@/features/runsheet/fixtures';
import { makeExercise, type Block, type Runsheet } from '@/features/runsheet/model';
import type { SessionResult } from '@/features/runsheet/progression';
import { setState } from './store';

const two: Runsheet = {
  id: 'two',
  title: 'Two blocks',
  items: [
    { kind: 'block', id: 'b1', name: 'One', repeat: 1, steps: [{ ...makeExercise(EX.bw_pushup, { forMode: 'reps', forValue: 5 }), id: 'q1' }] },
    { kind: 'block', id: 'b2', name: 'Two', repeat: 1, steps: [{ ...makeExercise(EX.bw_squat, { forMode: 'reps', forValue: 5 }), id: 'q2' }] },
  ],
};
const dupe: Runsheet = { ...two, id: 'dupe', items: [two.items[1], two.items[0]] };
const past: SessionResult = { id: 's-past', runsheetId: 'two', startedAt: '2026-10-01T08:00:00Z', steps: [] };

const stored = () => JSON.parse(localStorage.getItem('workout-hub-next:v1') || '{}') as { results: SessionResult[]; workouts: Runsheet[]; saved: string[] };
const workout = (id: string) => stored().workouts.find(w => w.id === id)!;
const repeatOf = (r: { items: Runsheet['items'] }, id: string) => (r.items.find(i => i.id === id) as Block).repeat;
const click = (name: string | RegExp) => fireEvent.click(screen.getByRole('button', { name }));
const findClick = async (name: string | RegExp) => fireEvent.click(await screen.findByRole('button', { name }));
/** Edit, one more round on block One, close its sheet. */
const moreRounds = () => {
  const edit = screen.queryByRole('button', { name: 'Edit' });
  if (edit) fireEvent.click(edit);
  fireEvent.click(screen.getAllByRole('button', { name: (n: string) => n.startsWith('One'), expanded: false })[0]);
  fireEvent.click(within(screen.getByRole('group', { name: 'Rounds' })).getByLabelText('Increase'));
  fireEvent.click(screen.getByRole('button', { name: 'Close' }));
};
const open = (id: string) => {
  location.hash = `#/w/${id}`;
  render(<App />);
};

beforeEach(() => {
  cleanup();
  localStorage.clear();
  sessionStorage.clear();
  setState({ signedIn: true, results: [past], workouts: [two, dupe], saved: ['dupe'] });
});

describe('a change to a workout that has been done', () => {
  it('asks once; Just this time runs it changed, keeps it with the session and leaves the workout alone', async () => {
    open('two');
    click('Edit');
    await findClick('Just this time');
    moreRounds();
    expect(repeatOf(workout('two'), 'b1')).toBe(1);
    // Asked once: back in edit mode, the next change goes the same way without asking.
    click('Done');
    moreRounds();
    expect(screen.queryByRole('button', { name: 'Just this time' })).toBeNull();
    click('Done');
    expect(screen.getByRole('status')).toHaveTextContent('Just this time');
    click(/^Start$/);
    await findClick(/^Skip$/);
    click('More');
    click(/End workout/);
    click(/Finish and save/);
    await findClick(/Save result/);
    const [run] = stored().results.filter(r => r.id !== 's-past');
    expect(run.runsheetId).toBe('two');
    expect(repeatOf(run.version!, 'b1')).toBe(3);
    expect(repeatOf(workout('two'), 'b1')).toBe(1);
  }, 20000);

  it('Update workout changes the workout and asks no more', async () => {
    open('two');
    click('Edit');
    await findClick('Update workout');
    moreRounds();
    await waitFor(() => expect(repeatOf(workout('two'), 'b1')).toBe(2));
    moreRounds();
    await waitFor(() => expect(repeatOf(workout('two'), 'b1')).toBe(3));
    expect(screen.queryByRole('button', { name: 'Just this time' })).toBeNull();
  });

  it('never asks on a workout not done yet', async () => {
    setState({ results: [] });
    open('two');
    moreRounds();
    await waitFor(() => expect(repeatOf(workout('two'), 'b1')).toBe(2));
  });
});

describe('Your versions', () => {
  it('lists what sessions ran, and Make base makes one the workout', async () => {
    setState({ results: [past, { ...past, id: 's-v', startedAt: '2026-10-05T08:00:00Z', version: { items: dupe.items } }] });
    open('two');
    const card = await screen.findByRole('region', { name: 'Your versions' });
    expect(card).toHaveTextContent('Bodyweight squat first');
    fireEvent.click(within(card).getByRole('button', { name: 'Make base' }));
    await waitFor(() => expect(workout('two').items.map(i => i.id)).toEqual(['b2', 'b1']));
    expect(screen.queryByRole('region', { name: 'Your versions' })).toBeNull();
  });
});

describe('Make it a version of another workout', () => {
  it('moves its sessions onto the other, each with what it ran, and takes it out of the list', async () => {
    setState({ results: [past, { ...past, id: 's-d', runsheetId: 'dupe' }] });
    open('dupe');
    await findClick(/Make it a version of another workout/);
    fireEvent.click(await screen.findByRole('button', { name: /^Two blocks/ }));
    click(/Merge into Two blocks/);
    await waitFor(() => expect(location.hash).toBe('#/w/two'));
    const s = stored();
    expect(s.workouts.map(w => w.id)).toEqual(['two']);
    expect(s.saved).toEqual(['two']);
    const moved = s.results.find(r => r.id === 's-d')!;
    expect(moved.runsheetId).toBe('two');
    expect(moved.version!.items.map(i => i.id)).toEqual(['b2', 'b1']);
    expect(await screen.findByRole('region', { name: 'Your versions' })).toBeTruthy();
  });
});
