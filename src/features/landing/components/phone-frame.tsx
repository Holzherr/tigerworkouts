import { cn } from '@/shared/utils/ui-utils';

export interface PhoneFrameProps {
  children: React.ReactNode;
  className?: string;
  /** CSS width; height follows a 19.5:9 ratio. */
  width?: number;
}

/**
 * A phone bezel drawn in CSS: rounded black shell, thin inner ring, a notch, and a screen area
 * that clips its children. Used on the landing page to show real app screens running live.
 */
export const PhoneFrame = ({ children, className, width = 320 }: PhoneFrameProps) => (
  <div className={cn('relative shrink-0 rounded-[44px] bg-ink p-[10px] shadow-[0_30px_60px_-20px_rgba(15,23,42,.55),0_0_0_1px_rgba(255,255,255,.08)_inset]', className)} style={{ width, height: Math.round((width * 19.5) / 9) }}>
    <div className="absolute top-[10px] left-1/2 z-10 h-[26px] w-[110px] -translate-x-1/2 rounded-b-[14px] bg-ink" aria-hidden />
    <div className="relative size-full overflow-hidden rounded-[34px] bg-canvas">{children}</div>
  </div>
);
