import { Pause } from 'lucide-react';
import { cn } from '@/shared/utils/ui-utils';

export interface ClipThumbProps {
  /** Looping demo clip (mp4). Optional: rows without one show the icon. */
  clip?: string;
  poster?: string;
  /** Fallback when there is no clip: an emoji or a lucide icon. */
  icon?: React.ReactNode;
  /** rest = grey well with a pause glyph */
  variant?: 'exercise' | 'rest';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const SIZE = { sm: 'size-[34px] rounded-[9px] text-[15px]', md: 'size-12 rounded-[11px] text-[20px]', lg: 'size-[72px] rounded-card text-[28px]' };

/**
 * Square thumbnail for a step. With a clip it autoplays muted and loops (paused for reduced
 * motion, showing the poster); without one it shows an icon on white. The rest variant is a grey
 * square with a pause glyph. Sizes 34 / 48 / 72px.
 */
export const ClipThumb = ({ clip, poster, icon, variant = 'exercise', size = 'md', className }: ClipThumbProps) => {
  const base = cn('grid shrink-0 place-items-center overflow-hidden', SIZE[size], className);
  if (variant === 'rest') {
    return (
      <div className={cn(base, 'bg-well text-muted')} aria-hidden>
        <Pause className={size === 'sm' ? 'size-3.5' : 'size-4'} fill="currentColor" />
      </div>
    );
  }
  if (clip) {
    return (
      <div className={cn(base, 'border border-line-soft bg-surface')}>
        <video src={clip} poster={poster} autoPlay muted loop playsInline preload="metadata" className="size-full object-cover motion-reduce:hidden" aria-hidden />
        {poster && <img src={poster} alt="" className="hidden size-full object-cover motion-reduce:block" />}
      </div>
    );
  }
  return (
    <div className={cn(base, 'border border-line-soft bg-surface')} aria-hidden>
      {icon}
    </div>
  );
};
