import { useState } from 'react';
import { cn, fmtNum } from '@/shared/utils/ui-utils';
import { parseNumber } from '@/shared/utils/number-entry';

export interface NumberEntryProps {
  value: number;
  /** Called with the typed number, clamped, when the field is left or Enter is pressed. */
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  /** How the number reads when it is not being typed, e.g. seconds → "1:30". */
  format?: (value: number) => string;
  'aria-label'?: string;
  className?: string;
}

/**
 * A number you tap to type (Priyanka, 14 Nov 2026): the phone shows its numeric keypad with a
 * decimal key, a comma is read as a point, and anything that is not a number leaves the value as
 * it was. The whole number is selected on focus so typing replaces it. Used by `Stepper` between
 * − and +, and on its own where a number has no steps.
 */
export const NumberEntry = ({ value, onChange, min = 0, max = 99999, format = fmtNum, className, 'aria-label': ariaLabel }: NumberEntryProps) => {
  const [typing, setTyping] = useState<string | null>(null);
  const commit = () => {
    const n = typing === null ? undefined : parseNumber(typing);
    if (n !== undefined) {
      const next = Math.min(max, Math.max(min, Math.round(n * 100) / 100));
      if (next !== value) onChange(next);
    }
    setTyping(null);
  };
  return (
    <input
      aria-label={ariaLabel ?? 'Value'}
      inputMode="decimal"
      enterKeyHint="done"
      autoComplete="off"
      className={cn('h-11 min-w-0 bg-transparent px-1 text-center font-bold tabular-nums outline-none focus:bg-canvas', className)}
      value={typing ?? format(value)}
      onFocus={e => {
        const el = e.target;
        setTyping(fmtNum(value));
        requestAnimationFrame(() => el.select());
      }}
      onChange={e => setTyping(e.target.value)}
      onBlur={commit}
      onKeyDown={e => {
        if (e.key === 'Enter') {
          // The commit can open a sheet, which takes the focus: without this the same Enter
          // then presses the sheet's first button and closes it.
          e.preventDefault();
          e.currentTarget.blur();
        }
        if (e.key === 'Escape') {
          setTyping(null);
          const el = e.currentTarget;
          requestAnimationFrame(() => el.blur());
        }
      }}
    />
  );
};
