import { cva, type VariantProps } from 'class-variance-authority';
import { forwardRef } from 'react';
import { cn } from '@/shared/utils/ui-utils';

const cardVariants = cva('overflow-hidden rounded-card border', {
  variants: {
    tone: {
      surface: 'border-line bg-surface',
      brand: 'border-brand-line bg-brand-soft',
      well: 'border-line bg-canvas',
      warn: 'border-line bg-warn-soft',
    },
  },
  defaultVariants: { tone: 'surface' },
});

export interface CardProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof cardVariants> {}

/** Rounded 16px container. `brand` tone marks the open (expanded) row, `well` the rest rows. */
export const Card = forwardRef<HTMLDivElement, CardProps>(({ className, tone, ...props }, ref) => <div ref={ref} className={cn(cardVariants({ tone }), className)} {...props} />);
Card.displayName = 'Card';
