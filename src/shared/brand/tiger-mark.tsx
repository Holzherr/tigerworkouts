import { cn } from '@/shared/utils/ui-utils';
import { TIGER_MARK_PATH } from './tiger-mark-path';

export interface TigerMarkProps extends React.SVGAttributes<SVGSVGElement> {
  /** Rendered width and height in px. Defaults to 1em so it sizes with text. */
  size?: number | string;
}

/**
 * The TigerWorkouts mark: outlined tiger head on a 100-unit box, drawn in `currentColor`.
 * One path, even-odd filled, so it recolours with `text-*` classes and stays crisp at any size.
 * Holds down to 24px; below that use the app icon tile instead.
 */
export const TigerMark = ({ size = '1em', className, ...props }: TigerMarkProps) => (
  <svg viewBox="0 0 100 100" width={size} height={size} className={cn('shrink-0', className)} aria-hidden="true" {...props}>
    <path fill="currentColor" fillRule="evenodd" d={TIGER_MARK_PATH} />
  </svg>
);
