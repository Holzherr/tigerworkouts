import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { EX } from '@/features/runsheet/fixtures';
import { makeExercise, type Block, type Runsheet } from '@/features/runsheet/model';
import { WorkoutPreviewScreen } from './workout-preview-screen';

const ex = (k: string, id: string) => ({ ...makeExercise(EX[k], { forMode: 'reps', forValue: 10 }), id });
const start: Runsheet = { id: 'u-1', title: 'Legs', items: [{ kind: 'block', id: 'b1', name: 'Squats', repeat: 3, steps: [ex('bw_squat', 'e1'), ex('bw_lunge', 'e2')] }] };
let last = start;
const Page = () => {
  const [r, setR] = useState(start);
  return <WorkoutPreviewScreen runsheet={r} editor={{ onChange: next => ((last = next), setR(next)), onPickExercise: async () => makeExercise(EX.bw_pushup) }} />;
};
const blocks = () => last.items.filter((i): i is Block => i.kind === 'block');
const more = (group: string) => fireEvent.click(within(screen.getByRole('group', { name: group })).getByLabelText('Increase'));

describe('the workout page as the editor', () => {
  it('a block header opens its sheet: name, runs as, rounds, rest between rounds, remove block', () => {
    render(<Page />);
    fireEvent.click(screen.getByRole('button', { name: /^Squats/, expanded: false }));
    fireEvent.change(screen.getByLabelText('Block name'), { target: { value: 'Legs first' } });
    expect(screen.getByLabelText('Runs as')).toBeTruthy();
    more('Rounds');
    more('Rest between rounds');
    expect(blocks()[0]).toMatchObject({ name: 'Legs first', repeat: 4, restBetweenSec: 15 });
    fireEvent.click(screen.getByRole('button', { name: /Remove block/ }));
    expect(blocks()).toHaveLength(0);
  });
  it('Add block and Add a one-off exercise sit under the list', async () => {
    render(<Page />);
    fireEvent.click(screen.getByRole('button', { name: /Add block/ }));
    expect(blocks().map(b => b.name)).toEqual(['Squats', 'Block 2']);
    expect(screen.getByLabelText('Block name')).toHaveProperty('value', 'Block 2');
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    fireEvent.click(screen.getByRole('button', { name: /Add a one-off exercise/ }));
    await waitFor(() => expect(last.items.at(-1)).toMatchObject({ kind: 'exercise', exercise: { key: EX.bw_pushup.key } }));
  });
});
