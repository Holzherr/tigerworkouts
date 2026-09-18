import { cva, type VariantProps } from 'class-variance-authority';
import { forwardRef } from 'react';
import { cn } from '@/shared/utils/ui-utils';

export const chipVariants = cva('inline-flex items-center gap-1 rounded-full font-semibold whitespace-nowrap select-none transition-colors', {
  variants: {
    variant: {
      outline: 'border border-line bg-surface text-ink',
      value: 'bg-line-soft text-ink font-bold',
      on: 'bg-ink text-white',
      brand: 'bg-brand-soft text-brand-ink',
      'brand-solid': 'bg-brand text-white font-extrabold',
      danger: 'bg-danger-soft text-danger',
      warn: 'bg-warn-soft text-warn',
    },
    size: {
      sm: 'h-6 px-2.5 text-[11px]',
      md: 'h-8 px-3 text-[13px]',
      lg: 'h-9 px-3.5 text-[14px]',
    },
    interactive: { true: 'cursor-pointer active:opacity-80 focus-visible:outline-2 focus-visible:outline-brand' },
  },
  defaultVariants: { variant: 'outline', size: 'md' },
});

type Base = VariantProps<typeof chipVariants> & { className?: string; children?: React.ReactNode };
export type ChipProps = Base & (({ onClick: React.MouseEventHandler<HTMLButtonElement> } & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onClick'>) | ({ onClick?: undefined } & React.HTMLAttributes<HTMLSpanElement>));

/**
 * Pill label. Renders a <button> when given onClick (chip groups, quick picks), otherwise a <span>
 * (value pills like "28 kg", repeat counts, status). `on` marks the selected chip in a group.
 */
export const Chip = forwardRef<HTMLElement, ChipProps>(({ className, variant, size, interactive, onClick, ...props }, ref) => {
  const cls = cn(chipVariants({ variant, size, interactive: interactive ?? Boolean(onClick) }), className);
  if (onClick) {
    return <button ref={ref as React.Ref<HTMLButtonElement>} type="button" className={cls} onClick={onClick} {...(props as React.ButtonHTMLAttributes<HTMLButtonElement>)} />;
  }
  return <span ref={ref as React.Ref<HTMLSpanElement>} className={cls} {...(props as React.HTMLAttributes<HTMLSpanElement>)} />;
});
Chip.displayName = 'Chip';
