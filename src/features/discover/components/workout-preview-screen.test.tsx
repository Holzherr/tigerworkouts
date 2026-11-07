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
const edit = () => fireEvent.click(screen.getByRole('button', { name: 'Edit Squats' }));

describe('the workout page reads plain; a tap on a block opens it for editing (Nick, 1 Nov 2026)', () => {
  it('has no page-wide Edit; a tap on a block header opens that block, and Done closes it', () => {
    render(<Page />);
    expect(screen.getByText('Squats')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Squats/, expanded: false })).toBeNull();
    edit();
    expect(screen.getByRole('button', { name: /^Squats/, expanded: false })).toBeTruthy();
    fireEvent.click(screen.getByTestId('block-done'));
    expect(screen.queryByRole('button', { name: /^Squats/, expanded: false })).toBeNull();
    expect(screen.getByRole('button', { name: 'Edit Squats' })).toBeTruthy();
  });
  it('only the tapped block opens', () => {
    const two: Runsheet = { ...start, items: [...start.items, { kind: 'block', id: 'b2', name: 'Push', repeat: 2, steps: [ex('bw_pushup', 'e3')] }] };
    render(<Page from={two} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit Push' }));
    expect(screen.getByRole('button', { name: 'Edit Squats' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Edit Push' })).toBeNull();
    expect(screen.getAllByTestId('block-done')).toHaveLength(1);
  });
  it('a tap on an exercise still opens it', () => {
    render(<Page />);
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${EX.bw_squat.name}`) }));
    expect(screen.getByRole('dialog', { name: EX.bw_squat.name })).toBeTruthy();
  });
  it('the reorder grip shows while reading and opens the reorder view', () => {
    render(<Page />);
    fireEvent.click(screen.getByTestId('block-grip'));
    expect(screen.getByRole('dialog', { name: 'Reorder blocks' })).toBeTruthy();
  });
  it("an open block's grip reorders the whole workout, not the one block", () => {
    const two: Runsheet = { ...start, items: [...start.items, { kind: 'block', id: 'b2', name: 'Push', repeat: 2, steps: [ex('bw_pushup', 'e3')] }] };
    render(<Page from={two} />);
    edit();
    fireEvent.click(screen.getAllByTestId('block-grip')[0]);
    const dialog = screen.getByRole('dialog', { name: 'Reorder blocks' });
    expect(within(dialog).getByText('Push')).toBeTruthy();
  });
  it('Add block and Add a one-off exercise show while reading, on an empty workout too', () => {
    render(<Page from={{ id: 'u-2', title: 'New', items: [] }} />);
    expect(screen.getByRole('button', { name: /Add block/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Add a one-off exercise/ })).toBeTruthy();
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
    fireEvent.click(screen.getByRole('button', { name: /Add block/ }));
    expect(blocks().map(b => b.name)).toEqual(['Squats', 'Block 2']);
    expect(screen.getByLabelText('Block name')).toHaveProperty('value', 'Block 2');
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    fireEvent.click(screen.getByRole('button', { name: /Add a one-off exercise/ }));
    await waitFor(() => expect(last.items.at(-1)).toMatchObject({ kind: 'exercise', exercise: { key: EX.bw_pushup.key } }));
  });
});

describe('a workout adapted from a creator’s post (Nick, 7 Nov 2026)', () => {
  it('credits "Adapted from @handle · original post" and the handle opens the creator page', async () => {
    const { adaptedReel } = await import('@/features/creators/fixtures');
    let opened = false;
    render(<WorkoutPreviewScreen runsheet={adaptedReel()} onCreator={() => (opened = true)} />);
    expect(screen.getByText('Adapted from')).toBeTruthy();
    expect(screen.getByRole('link', { name: /original post/ }).getAttribute('href')).toBe('https://www.instagram.com/reel/FIXTURE/');
    fireEvent.click(screen.getByRole('button', { name: '@samfixture' }));
    expect(opened).toBe(true);
  });
});
