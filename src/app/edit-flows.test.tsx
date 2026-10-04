import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import App from '@/App';
import type { Block, Item, Runsheet } from '@/features/runsheet/model';
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
    location.hash = `#/w/${encodeURIComponent(original.id!)}`;
    await screen.findByRole('heading', { name: original.title });
    moreRounds();
    await waitFor(() => expect(location.hash).toBe(`#/w/${copy.id}`));
    expect(mine()).toHaveLength(1);
  });
});
