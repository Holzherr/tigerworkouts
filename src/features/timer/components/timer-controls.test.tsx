import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EX } from '@/features/runsheet/fixtures';
import { makeExercise, type Runsheet } from '@/features/runsheet/model';
import { loadStep } from '@/shared/utils/step-sizes';
import * as R from '../runner';
import { DOUBLE_TAP_MS, TimerScreen } from './timer-screen';

// A loose goblet press, then a block of bench 3 × 10 with no load in the plan.
const sheet: Runsheet = {
  id: 't',
  title: 'T',
  items: [
    { ...makeExercise(EX.db_incline_press, { forMode: 'reps', forValue: 10, target: 24 }), id: 'g' },
    { kind: 'block', id: 'bb', name: 'Bench', repeat: 3, steps: [{ ...makeExercise(EX.bb_bench, { forMode: 'reps', forValue: 10 }), id: 'bench', target: undefined }, { kind: 'rest', id: 'r', seconds: 90 }] },
  ],
};
const noop = () => {};
const grid = { adjust: noop, setReps: noop, complete: noop, reopen: noop };
type Props = Parameters<typeof TimerScreen>[0];
const el = (state: R.RunState, extra: Partial<Props> = {}) => <TimerScreen runsheet={sheet} state={state} now={0} onDone={noop} onSkip={noop} onBack={noop} onPause={noop} onResume={noop} onAdjust={noop} onSetReps={noop} onDrop={noop} onFinish={noop} onExit={noop} sets={grid} {...extra} />;
const lead = () => R.start(sheet, 0);
const onCard = () => R.advance(lead(), 0, { skipped: true });
/** Parked on the Next block card for Bench. */
const parked = () => R.advance(onCard(), 0);
const button = (name: string | RegExp) => screen.getByRole('button', { name });

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('End session', () => {
  it('is a modal dialog: focus moves in and stays, the timer behind is inert, Escape closes it', () => {
    const v = render(el(onCard()));
    const root = v.container.firstElementChild as HTMLElement;
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(button('End session'));
    const dialog = screen.getByRole('dialog', { name: 'End this session?' });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.contains(document.activeElement)).toBe(true);
    expect(root.hasAttribute('inert')).toBe(true);
    // Nothing behind it is reachable: the timer's own buttons are out of the accessibility tree.
    expect(screen.queryByRole('button', { name: 'More' })).toBeNull();
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(root.hasAttribute('inert')).toBe(false);
    expect(button('More')).toBeTruthy();
  });

  it('asks again before discarding, and Escape from there closes the lot', () => {
    const exit = vi.fn();
    render(el(onCard(), { onExit: exit }));
    fireEvent.click(button('End session'));
    fireEvent.click(button('Discard'));
    expect(screen.getByRole('dialog', { name: 'Discard this session?' })).toBeTruthy();
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(button('End session'));
    expect(screen.getByRole('dialog', { name: 'End this session?' })).toBeTruthy();
    fireEvent.click(button('Discard'));
    fireEvent.click(button('Discard session'));
    expect(exit).toHaveBeenCalledOnce();
  });
});

describe('Skip on the lead-in', () => {
  it('ignores a second tap that lands on the first step', () => {
    vi.useFakeTimers({ now: 1000 });
    const skip = vi.fn();
    const v = render(el(lead(), { onSkip: skip }));
    fireEvent.click(button('Skip'));
    expect(skip).toHaveBeenCalledTimes(1);
    // The lead-in is gone; the same button is now the first step's Skip.
    v.rerender(el(onCard(), { onSkip: skip }));
    vi.setSystemTime(1000 + DOUBLE_TAP_MS - 1);
    fireEvent.click(button('Skip this step'));
    expect(skip).toHaveBeenCalledTimes(1);
    vi.setSystemTime(1000 + DOUBLE_TAP_MS + 1);
    fireEvent.click(button('Skip this step'));
    expect(skip).toHaveBeenCalledTimes(2);
  });

  it('leaves Skip this step in the ⋯ menu alone: that is a second, separate choice', () => {
    vi.useFakeTimers({ now: 1000 });
    const skip = vi.fn();
    const v = render(el(lead(), { onSkip: skip }));
    fireEvent.click(button('Skip'));
    v.rerender(el(onCard(), { onSkip: skip }));
    fireEvent.click(button('More'));
    fireEvent.click(screen.getAllByRole('button', { name: 'Skip this step' }).at(-1)!);
    expect(skip).toHaveBeenCalledTimes(2);
  });

  it('does not hold up a skip of a later step', () => {
    const skip = vi.fn();
    render(el(onCard(), { onSkip: skip }));
    fireEvent.click(button('Skip this step'));
    fireEvent.click(button('Skip this step'));
    expect(skip).toHaveBeenCalledTimes(2);
  });
});

describe('dropping an exercise', () => {
  it('is in the ⋯ menu, with no swipe hint on the screen', () => {
    const drop = vi.fn();
    const v = render(el(onCard(), { onDrop: drop }));
    expect(v.container.textContent).not.toMatch(/Swipe the card/);
    fireEvent.click(button('More'));
    fireEvent.click(button('Drop this exercise'));
    expect(drop).toHaveBeenCalledWith('g');
  });

  it('is not offered on the lead-in', () => {
    render(el(lead()));
    fireEvent.click(button('More'));
    expect(screen.queryByRole('button', { name: 'Drop this exercise' })).toBeNull();
  });

  it('is not offered on the Next block card', () => {
    render(el(parked()));
    fireEvent.click(button('More'));
    expect(screen.queryByRole('button', { name: 'Drop this exercise' })).toBeNull();
  });
});

describe('numbers', () => {
  it('gives the Next block card a load dial when the plan has no load', () => {
    const adjust = vi.fn();
    render(el(parked(), { onAdjustStep: adjust }));
    const dial = screen.getByRole('group', { name: /bench press weight/i });
    fireEvent.pointerDown(dial.querySelector('button[aria-label="Increase"]')!, { button: 0 });
    fireEvent.pointerUp(dial.querySelector('button[aria-label="Increase"]')!);
    expect(adjust).toHaveBeenCalledWith('bench', { target: loadStep(EX.bb_bench) });
  });

  it('can be typed on a set, decimals with a point or a comma', () => {
    const adjust = vi.fn();
    render(el(R.startBlock(parked(), 0), { sets: { ...grid, adjust } }));
    const field = screen.getByRole('textbox', { name: 'Set 1 load value' }) as HTMLInputElement;
    expect(field.inputMode).toBe('decimal');
    fireEvent.focus(field);
    fireEvent.change(field, { target: { value: '42.5' } });
    fireEvent.blur(field);
    fireEvent.focus(field);
    fireEvent.change(field, { target: { value: '47,5' } });
    fireEvent.blur(field);
    expect(adjust.mock.calls.map(c => c[1])).toEqual([42.5, 47.5]);
  });

  it('can be typed on a card once Change opens it', () => {
    const reps = vi.fn();
    render(el(onCard(), { onSetReps: reps }));
    fireEvent.click(button(/Change$/));
    const field = screen.getByRole('textbox', { name: 'Reps value' });
    fireEvent.focus(field);
    fireEvent.change(field, { target: { value: '12' } });
    fireEvent.blur(field);
    expect(reps).toHaveBeenCalledWith(12);
  });
});
