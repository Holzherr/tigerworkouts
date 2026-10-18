import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { EX } from '@/features/runsheet/fixtures';
import { makeExercise, type Block, type Runsheet } from '@/features/runsheet/model';
import { WorkoutPreviewScreen } from './workout-preview-screen';

const ex = (k: string, id: string) => ({ ...makeExercise(EX[k], { forMode: 'reps', forValue: 10 }), id });
const start: Runsheet = { id: 'u-1', title: 'Legs', items: [{ kind: 'block', id: 'b1', name: 'Squats', repeat: 3, steps: [ex('bw_squat', 'e1'), ex('bw_lunge', 'e2')] }] };
let last = start;
const Page = ({ from = start }: { from?: Runsheet }) => {
  const [r, setR] = useState(from);
  return <WorkoutPreviewScreen runsheet={r} editor={{ onChange: next => ((last = next), setR(next)), onPickExercise: async () => makeExercise(EX.bw_pushup) }} />;
};
const blocks = () => last.items.filter((i): i is Block => i.kind === 'block');
const more = (group: string) => fireEvent.click(within(screen.getByRole('group', { name: group })).getByLabelText('Increase'));
const edit = () => fireEvent.click(screen.getByRole('button', { name: 'Edit' }));

describe('the workout page reads plain until Edit (Nick, 18 Oct 2026)', () => {
  it('shows no editing controls until Edit, and Done puts them away again', () => {
    render(<Page />);
    expect(screen.getByText('Squats')).toBeTruthy();
    expect(screen.queryByTestId('block-grip')).toBeNull();
    expect(screen.queryByRole('button', { name: /Add block/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Squats/, expanded: false })).toBeNull();
    edit();
    expect(screen.getByTestId('block-grip')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Add block/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.queryByTestId('block-grip')).toBeNull();
    expect(screen.getByRole('button', { name: 'Edit' })).toBeTruthy();
  });
  it('a tap on an exercise still opens it', () => {
    render(<Page />);
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${EX.bw_squat.name}`) }));
    expect(screen.getByRole('dialog', { name: EX.bw_squat.name })).toBeTruthy();
  });
  it('the reorder view is there in edit mode, from a block header grip', () => {
    render(<Page />);
    edit();
    fireEvent.click(screen.getByTestId('block-grip'));
    expect(screen.getByRole('dialog', { name: 'Reorder blocks' })).toBeTruthy();
  });
  it('an empty workout opens in edit mode', () => {
    render(<Page from={{ id: 'u-2', title: 'New', items: [] }} />);
    expect(screen.getByRole('button', { name: 'Done' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Add block/ })).toBeTruthy();
  });
});

describe('the workout page as the editor', () => {
  it('a block header opens its sheet: name, runs as, rounds, rest between rounds, remove block', () => {
    render(<Page />);
    edit();
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
    edit();
    fireEvent.click(screen.getByRole('button', { name: /Add block/ }));
    expect(blocks().map(b => b.name)).toEqual(['Squats', 'Block 2']);
    expect(screen.getByLabelText('Block name')).toHaveProperty('value', 'Block 2');
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    fireEvent.click(screen.getByRole('button', { name: /Add a one-off exercise/ }));
    await waitFor(() => expect(last.items.at(-1)).toMatchObject({ kind: 'exercise', exercise: { key: EX.bw_pushup.key } }));
  });
});
