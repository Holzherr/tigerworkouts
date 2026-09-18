import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/shared/utils/ui-utils';
import { TigerMark } from './tiger-mark';

const tileVariants = cva('relative grid shrink-0 place-items-center overflow-hidden', {
  variants: {
    tone: {
      stripes: 'bg-stripes text-ink-pure',
      coral: 'bg-brand text-ink-pure',
      white: 'bg-surface text-ink-pure ring-1 ring-line ring-inset',
      ink: 'bg-ink-pure text-brand',
    },
  },
  defaultVariants: { tone: 'stripes' },
});

export interface AppIconProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof tileVariants> {
  /** Tile edge in px. Corner radius and mark padding scale with it (iOS 22.5% superellipse). */
  size?: number;
  /** Square corners, for maskable / store exports where the platform applies its own mask. */
  square?: boolean;
}

/**
 * The app icon tile: two centred coral bands (25% each) on white, black mark at 66% of the edge.
 * `coral`, `white` and `ink` tones are the fallbacks for places the stripes would clash.
 */
export const AppIcon = ({ size = 60, square, tone, className, style, ...props }: AppIconProps) => (
  <div className={cn(tileVariants({ tone }), className)} style={{ width: size, height: size, borderRadius: square ? 0 : size * 0.225, ...style }} role="img" aria-label="TigerWorkouts" {...props}>
    <TigerMark size={size * 0.66} />
  </div>
);
