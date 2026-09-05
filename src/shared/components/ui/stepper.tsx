import { Minus, Plus } from 'lucide-react';
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

/**
 * Minus / value / plus control. One row, 44px tall (36px in `sm`), value in bold with no unit
 * suffix; the unit belongs in the row label next to it. Holding a button does not auto-repeat.
 */
export const Stepper = ({ value, onChange, step = 1, min = 0, max = 999, format = fmtNum, size = 'md', className, 'aria-label': ariaLabel }: StepperProps) => {
  const h = size === 'sm' ? 'h-9' : 'h-11';
  const w = size === 'sm' ? 'w-8' : 'w-11';
  const btn = cn(h, w, 'grid place-items-center bg-canvas text-ink active:bg-line disabled:opacity-30 [&_svg]:size-4', size === 'md' && '[&_svg]:size-5');
  return (
    <div role="group" aria-label={ariaLabel} className={cn('inline-flex shrink-0 items-center overflow-hidden rounded-control border border-line bg-surface', className)}>
      <button type="button" className={btn} aria-label="Decrease" disabled={value <= min} onClick={() => onChange(clamp(value - step, min, max))}>
        <Minus />
      </button>
      <output className={cn(h, 'grid min-w-14 place-items-center px-1 font-bold tabular-nums', size === 'sm' ? 'text-[14px]' : 'text-[17px]')}>{format(value)}</output>
      <button type="button" className={btn} aria-label="Increase" disabled={value >= max} onClick={() => onChange(clamp(value + step, min, max))}>
        <Plus />
      </button>
    </div>
  );
};
