import { cn } from '@/shared/utils/ui-utils';

export interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  'aria-label'?: string;
  className?: string;
}

/** An on / off switch: a 44px-tall tap target around a pill that fills ink when on. */
export const Switch = ({ checked, onChange, disabled, className, 'aria-label': ariaLabel }: SwitchProps) => (
  <button type="button" role="switch" aria-checked={checked} aria-label={ariaLabel} disabled={disabled} onClick={() => onChange(!checked)} className={cn('grid h-11 w-14 shrink-0 place-items-center disabled:opacity-40', className)}>
    <span className={cn('relative block h-7 w-12 rounded-full transition-colors', checked ? 'bg-ink dark:bg-body' : 'bg-hint')}>
      <span className={cn('absolute top-0.5 left-0.5 size-6 rounded-full bg-white shadow-sm transition-transform', checked && 'translate-x-5')} />
    </span>
  </button>
);
