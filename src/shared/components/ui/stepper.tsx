import { Minus, Plus } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { cn, fmtNum } from '@/shared/utils/ui-utils';

export interface StepperProps {
  value: number;
  onChange: (value: number) => void;
  step?: number;
  min?: number;
  max?: number;
  /** Override how the number is shown, e.g. seconds → "1:30". */
  format?: (value: number) => string;
  size?: 'md' | 'sm';
  'aria-label'?: string;
  className?: string;
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, Math.round(v * 100) / 100));

/** How long each repeat waits while a button is held: a pause first, then faster and faster. */
export const holdDelay = (n: number) => (n === 0 ? 400 : Math.max(40, Math.round(160 * 0.88 ** n)));

/**
 * Held down, a stepper button repeats and speeds up (`holdDelay`), so 20 → 100 kg is one press
 * rather than 32 taps. The first step lands on press; a keyboard click steps once.
 */
const useHold = (fire: () => boolean) => {
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const stop = () => clearTimeout(timer.current);
  useEffect(() => stop, []);
  const start = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    stop();
    if (!fire()) return;
    const loop = (n: number) => {
      timer.current = setTimeout(() => fire() && loop(n + 1), holdDelay(n));
    };
    loop(0);
  };
  return {
    onPointerDown: start,
    onPointerUp: stop,
    onPointerLeave: stop,
    onPointerCancel: stop,
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
    // A pointer press already stepped; only a keyboard activation (detail 0) steps here.
    onClick: (e: React.MouseEvent) => e.detail === 0 && fire(),
  };
};

/**
 * Minus / value / plus control. One row, 44px tall, value in bold with no unit suffix; the unit
 * belongs in the row label next to it. `sm` is narrower, not shorter. Hold a button to repeat.
 */
export const Stepper = ({ value, onChange, step = 1, min = 0, max = 999, format = fmtNum, size = 'md', className, 'aria-label': ariaLabel }: StepperProps) => {
  // The value as last sent: a held button steps from it before the parent's re-render lands.
  const cur = useRef(value);
  cur.current = value;
  const by = (d: number) => () => {
    const next = clamp(cur.current + d, min, max);
    if (next === cur.current) return false;
    cur.current = next;
    onChange(next);
    return true;
  };
  const down = useHold(by(-step));
  const up = useHold(by(step));
  const w = size === 'sm' ? 'w-9' : 'w-11';
  const btn = cn('h-11 touch-manipulation select-none', w, 'grid place-items-center bg-canvas text-ink active:bg-line disabled:opacity-30 [&_svg]:size-4', size === 'md' && '[&_svg]:size-5');
  return (
    <div role="group" aria-label={ariaLabel} className={cn('inline-flex shrink-0 items-center overflow-hidden rounded-control border border-line bg-surface', className)}>
      <button type="button" className={btn} aria-label="Decrease" disabled={value <= min} {...down}>
        <Minus />
      </button>
      <output className={cn('grid h-11 place-items-center px-1 font-bold tabular-nums', size === 'sm' ? 'min-w-12 text-[14px]' : 'min-w-14 text-[17px]')}>{format(value)}</output>
      <button type="button" className={btn} aria-label="Increase" disabled={value >= max} {...up}>
        <Plus />
      </button>
    </div>
  );
};
