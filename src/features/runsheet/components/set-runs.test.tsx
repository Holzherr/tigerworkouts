import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { EX } from '../fixtures';
import { makeExercise, makeRest, plannedSet, straightSetStep, type Block, type Item } from '../model';
import { RunsheetList } from './runsheet-list';

const eight = (): Block => ({ kind: 'block', id: 'b', name: 'Swings', repeat: 8, steps: [{ ...makeExercise(EX.kb_swing, { forMode: 'seconds', forValue: 30, target: 20 }), id: 'sw' }, { ...makeRest(60), id: 'r' }] });

const list = (items: Item[], onChange: (items: Item[]) => void = () => {}) => render(<RunsheetList items={items} onChange={onChange} onPickExercise={async () => null} />);

describe('sets in the editor', () => {
  beforeEach(() => localStorage.clear());

  it('shows 8 identical sets as one row, and its stepper changes all 8', () => {
    let changed: Item[] = [];
    list([eight()], items => (changed = items));
    expect(screen.getByRole('button', { name: /^Sets 1 to 8/ }).textContent).toBe('8×');
    expect(screen.queryByRole('button', { name: /^Set 2/ })).toBeNull();
    fireEvent.click(within(screen.getByRole('group', { name: 'Sets 1 to 8 load' })).getByRole('button', { name: 'Increase' }));
    const step = straightSetStep(changed[0] as Block)!;
    expect(Array.from({ length: 8 }, (_, i) => plannedSet(step, i).load)).toEqual(Array(8).fill(20 + EX.kb_swing.step));
  });

  it('shows a warm-up and 4 working sets as two rows; Vary sets shows every set', () => {
    const b = eight();
    const block: Block = { ...b, repeat: 5, steps: [{ ...(b.steps[0] as Extract<Block['steps'][number], { kind: 'exercise' }>), sets: [{ reps: 12, load: 12, type: 'warmup' }, { reps: 30, load: 20 }] }, b.steps[1]] };
    list([block]);
    expect(screen.getAllByRole('button', { name: /^Sets? \d/ }).map(el => el.textContent)).toEqual(['W', '4×']);
    fireEvent.click(screen.getByRole('button', { name: 'Vary sets' }));
    expect(screen.getAllByRole('button', { name: /^Set \d/ })).toHaveLength(5);
  });

  it('puts a grip on every block header, and the tip goes once OK is tapped', () => {
    const other = eight();
    const { unmount } = list([eight(), { ...other, id: 'b2', name: 'Rows', steps: other.steps.map(s => ({ ...s, id: `${s.id}2` })) }]);
    expect(screen.getAllByTestId('block-grip').map(g => g.className.includes('size-11'))).toEqual([true, true]);
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    expect(screen.queryByText("Hold a block's header to move it")).toBeNull();
    unmount();
    list([eight()]);
    expect(screen.queryByText("Hold a block's header to move it")).toBeNull();
  });
});
