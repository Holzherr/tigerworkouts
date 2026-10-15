import { composeStories } from '@storybook/react-vite';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { priyanka } from '../fixtures';
import { CLAMP_NOTE, type Item } from '../model';
import { BlockReorder } from './block-reorder';
import * as stories from './block-reorder.stories';

const { Default, MidSession } = composeStories(stories);

/** jsdom lays nothing out: give each card a 60px slot by its place in the list, so a drag has
 * somewhere to land. */
beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    const list = this.closest('ul');
    const k = this.tagName === 'LI' && list ? Array.from(list.children).indexOf(this) : -1;
    const top = this.getAttribute('aria-label') === 'Done and running' ? 0 : 100 + k * 60;
    return { x: 0, y: top, top, left: 0, right: 300, bottom: top + 56, width: 300, height: 56, toJSON: () => ({}) } as DOMRect;
  });
});
afterEach(() => vi.restoreAllMocks());

/** Press on a card, move past the 4px start distance, then to `y`, and let go. */
const drag = (name: string, y: number) => {
  const card = within(screen.getByRole('list', { name: 'Blocks' })).getByLabelText(name);
  const from = card.getBoundingClientRect().top + 20;
  fireEvent.mouseDown(card, { button: 0, clientX: 150, clientY: from });
  fireEvent.mouseMove(document, { clientX: 150, clientY: from + 10 });
  fireEvent.mouseMove(document, { clientX: 150, clientY: y });
  fireEvent.mouseUp(document, { clientX: 150, clientY: y });
};

const names = (items: Item[]) => items.map(it => it.id);

describe('BlockReorder', () => {
  it('shows every block as one card: name, exercises, rounds and time', () => {
    render(<Default />);
    const list = screen.getByRole('list', { name: 'Blocks' });
    expect(list.querySelectorAll(':scope > li')).toHaveLength(4);
    expect(within(list).getByText('Swings + incline press')).toBeTruthy();
    expect(within(list).getAllByText('2 exercises · 8 rounds')).toHaveLength(1);
    expect(within(list).getByText('1 exercise · 8 sets')).toBeTruthy();
  });

  it('a dragged card takes its whole block to the line, and Done hands the order back', async () => {
    const onDone = vi.fn();
    render(<BlockReorder open items={priyanka().items} onDone={onDone} onCancel={() => {}} />);
    drag('Swings + lateral raises', 105); // the top half of the first card: above it
    await new Promise(r => setTimeout(r, 60)); // dnd-kit swallows clicks for 50 ms after a drop
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    const out: Item[] = onDone.mock.calls[0][0];
    expect(names(out)).toEqual(['b3', 'b1', 'b2', 's6']);
    expect(out[0]).toMatchObject({ kind: 'block', steps: [{ id: 's4' }, { id: 'r4' }, { id: 's5' }, { id: 'r5' }] });
  });

  it('mid-session the running block is fixed on top, and a drop above it lands right after it', () => {
    render(<MidSession />);
    const fixed = screen.getByLabelText('Done and running');
    expect(within(fixed).getByText('Swings + incline press')).toBeTruthy();
    expect(within(screen.getByRole('list', { name: 'Blocks' })).queryByText('Swings + incline press')).toBeNull();
    drag('Swings + lateral raises', 10); // onto the fixed card
    expect(screen.getByRole('status', { name: 'Moved' }).textContent).toBe(CLAMP_NOTE);
    const order = Array.from(screen.getByRole('list', { name: 'Blocks' }).querySelectorAll(':scope > li')).map(li => li.getAttribute('aria-label'));
    expect(order[0]).toBe('Swings + lateral raises');
  });
});
