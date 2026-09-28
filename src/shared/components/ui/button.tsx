import { cva, type VariantProps } from 'class-variance-authority';
import { forwardRef } from 'react';
import { cn } from '@/shared/utils/ui-utils';

export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 font-bold whitespace-nowrap transition-colors duration-100 select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:pointer-events-none disabled:opacity-40 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        brand: 'rounded-tile bg-brand text-white active:bg-brand-hover',
        ghost: 'rounded-tile border border-line bg-surface text-ink active:bg-line-soft',
        soft: 'rounded-tile bg-line-soft text-ink active:bg-line',
        dark: 'rounded-tile bg-ink text-white active:bg-body',
        text: 'rounded-control text-brand active:bg-brand-soft',
        danger: 'rounded-control text-danger active:bg-danger-soft',
        quiet: 'rounded-control text-muted active:bg-line-soft',
      },
      size: {
        default: 'h-11 px-4 text-[15px] [&_svg]:size-5',
        // sm, icon-sm and inline draw small but take a 44px-tall tap: an invisible ::after reaches
        // past the edges (DESIGN.md: every tap target is at least 44px tall).
        sm: "relative h-9 px-3 text-[13px] after:absolute after:inset-x-0 after:-inset-y-1 after:content-[''] [&_svg]:size-4",
        lg: 'h-13 px-5 text-[17px] [&_svg]:size-5',
        xl: 'h-16 px-5 text-[18px] [&_svg]:size-6',
        icon: 'size-11 [&_svg]:size-5',
        'icon-sm': "relative size-8 after:absolute after:-inset-1.5 after:content-[''] [&_svg]:size-4",
        inline: "relative h-auto px-1 py-0.5 text-[13px] after:absolute after:inset-x-0 after:-inset-y-3 after:content-[''] [&_svg]:size-4",
      },
      block: { true: 'w-full' },
    },
    defaultVariants: { variant: 'brand', size: 'default' },
  }
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {}

/** Tap target for every action in the app. Touch-first: default height is 44px, xl is 64px
 * for the controls you hit mid-exercise, when you are moving and not looking carefully. */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, block, type = 'button', ...props }, ref) => (
  <button ref={ref} type={type} className={cn(buttonVariants({ variant, size, block }), className)} {...props} />
));
Button.displayName = 'Button';
