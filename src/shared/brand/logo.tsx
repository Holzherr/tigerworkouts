import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/shared/utils/ui-utils';
import { TigerMark } from './tiger-mark';

const logoVariants = cva('inline-flex items-center font-black tracking-tight', {
  variants: {
    size: {
      sm: 'gap-1.5 text-[17px] [&_svg]:size-6',
      md: 'gap-2 text-[22px] [&_svg]:size-8',
      lg: 'gap-3 text-[34px] [&_svg]:size-12',
    },
    tone: {
      ink: 'text-ink',
      white: 'text-white',
    },
  },
  defaultVariants: { size: 'md', tone: 'ink' },
});

export interface LogoProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof logoVariants> {
  /** Mark only, no wordmark. */
  markOnly?: boolean;
}

/**
 * Lockup: mark at cap height, then "Tiger" in ink and "Workouts" in coral, one word, no space.
 * The wordmark uses the system font at weight 900 so it matches the app's titles.
 */
export const Logo = ({ size, tone, markOnly, className, ...props }: LogoProps) => (
  <span className={cn(logoVariants({ size, tone }), className)} {...props}>
    <TigerMark />
    {!markOnly && (
      <span>
        Tiger<span className="text-brand">Workouts</span>
      </span>
    )}
  </span>
);
