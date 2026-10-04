import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import App from '@/App';
import type { Block, Item, Runsheet } from '@/features/runsheet/model';
import type { SessionResult } from '@/features/runsheet/progression';
import { IMPORTED } from '@/features/workouts/imported';
import { setState } from './store';

// A catalogue workout with a rounds block of two or more steps.
const rounds = (i: Item): i is Block => i.kind === 'block' && i.steps.length > 1 && (i.mode ?? 'rounds') === 'rounds' && !i.role;
const original = IMPORTED.map(w => w.runsheet).find(r => r.items.some(rounds))!;
const block = original.items.find(rounds)!;
const mine = (): Runsheet[] => JSON.parse(localStorage.getItem('workout-hub-next:v1') || '{}').workouts ?? [];
const moreRounds = () => {
  fireEvent.click(screen.getAllByRole('button', { name: (n: string) => n.startsWith(block.name), expanded: false })[0]);
  fireEvent.click(within(screen.getByRole('group', { name: 'Rounds' })).getByLabelText('Increase'));
  fireEvent.click(screen.getByRole('button', { name: 'Close' }));
};

describe('editing a catalogue workout on its page', () => {
  it('the first edit saves a copy of yours and the page shows it; a second edit session updates that copy', async () => {
    setState({ signedIn: true, results: [], workouts: [], saved: [] });
    location.hash = `#/w/${encodeURIComponent(original.id!)}`;
    render(<App />);
    moreRounds();
    await waitFor(() => expect(location.hash).toMatch(/^#\/w\/u-/));
    const [copy] = mine();
    expect(copy).toMatchObject({ copyOf: original.id, title: `${original.title} (mine)`, source: { kind: 'user' } });
    expect(copy.items.find(i => i.id === block.id)).toMatchObject({ repeat: block.repeat + 1 });
    expect(await screen.findByRole('heading', { name: `${original.title} (mine)` })).toBeTruthy();
    // Between sessions the copy is renamed and made public; the next edit must keep both.
    act(() => setState({ workouts: [{ ...copy, title: 'Squat day', public: true }] }));
    location.hash = `#/w/${encodeURIComponent(original.id!)}`;
    await screen.findByRole('heading', { name: 'Squat day' });
    moreRounds();
    await waitFor(() => expect(mine()[0].items.find(i => i.id === block.id)).toMatchObject({ repeat: block.repeat + 2 }));
    expect(mine()).toHaveLength(1);
    expect(mine()[0]).toMatchObject({ id: copy.id, title: 'Squat day', public: true });
  });
});

describe('an exercise on the workout page', () => {
  it('opens its History from the expanded row when it has been logged', async () => {
    const step = block.steps.find(s => s.kind === 'exercise')!;
    const key = step.kind === 'exercise' ? step.exercise.key : '';
    const logged: SessionResult = { id: 'r1', runsheetId: 'other', startedAt: '2026-10-01T08:00:00Z', steps: [{ stepId: 'x', exerciseKey: key, success: true }] };
    setState({ signedIn: true, results: [logged], workouts: [], saved: [] });
    location.hash = `#/w/${encodeURIComponent(original.id!)}`;
    render(<App />);
    fireEvent.click(screen.getAllByRole('button', { name: (n: string) => n.startsWith(step.kind === 'exercise' ? step.exercise.name : ''), expanded: false })[0]);
    fireEvent.click(await screen.findByRole('button', { name: /^History/ }));
    await waitFor(() => expect(location.hash).toBe(`#/x/${encodeURIComponent(key)}`));
  });
});
