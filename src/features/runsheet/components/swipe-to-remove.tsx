import { Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { cn } from '@/shared/utils/ui-utils';

export interface SwipeToRemoveProps {
  onRemove: () => void;
  /** Turn off while a drag is in progress, or on rows that must not be removed. */
  disabled?: boolean;
  children: React.ReactNode;
  className?: string;
}

const COMMIT = 12; // px of horizontal travel before the row commits to swiping
const FULL = 150; // px at which the label is fully revealed

/**
 * Touch gesture wrapper: drag the child left and a red field with a bin icon grows behind it.
 * Past halfway the label turns bold; release there to call onRemove, otherwise it springs back.
 * Only responds to touch pointers, so mouse users keep the ✕ button and drag-to-reorder.
 * Vertical scrolling wins until the finger has moved 12px sideways.
 */
export const SwipeToRemove = ({ onRemove, disabled, children, className }: SwipeToRemoveProps) => {
  const [dx, setDx] = useState(0);
  const [animating, setAnimating] = useState(false);
  const start = useRef<{ x: number; y: number; id: number; active: boolean } | null>(null);

  const onPointerDown = (e: React.PointerEvent) => {
    if (disabled || e.pointerType !== 'touch') return;
    start.current = { x: e.clientX, y: e.clientY, id: e.pointerId, active: false };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const s = start.current;
    if (!s || s.id !== e.pointerId) return;
    const ddx = e.clientX - s.x;
    const ddy = e.clientY - s.y;
    if (!s.active) {
      if (Math.abs(ddy) > Math.abs(ddx)) {
        start.current = null;
        return;
      }
      if (Math.abs(ddx) < COMMIT) return;
      s.active = true;
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    }
    setDx(Math.min(0, ddx));
  };
  const finish = (e: React.PointerEvent) => {
    const s = start.current;
    if (!s || s.id !== e.pointerId) return;
    start.current = null;
    if (!s.active) return;
    const width = (e.currentTarget as HTMLElement).offsetWidth;
    setAnimating(true);
    if (-dx > width / 2) {
      setDx(-width);
      setTimeout(onRemove, 160);
    } else setDx(0);
    setTimeout(() => setAnimating(false), 200);
  };

  const reveal = Math.min(1, -dx / FULL);
  const committed = -dx > 0 && reveal >= 0.5;
  return (
    <div className={cn('relative overflow-hidden', className)} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={finish} onPointerCancel={finish} style={{ touchAction: 'pan-y' }}>
      <div className={cn('absolute inset-y-0 right-0 flex items-center justify-end gap-2 bg-danger pr-5 text-white transition-opacity', dx === 0 ? 'opacity-0' : 'opacity-100')} style={{ width: Math.max(64, -dx) }} aria-hidden>
        <Trash2 className="size-5" />
        <span className={cn('text-[13px] font-extrabold transition-opacity', committed ? 'opacity-100' : 'opacity-0')}>Remove</span>
      </div>
      <div style={{ transform: `translateX(${dx}px)`, transition: animating ? 'transform 160ms ease-out' : undefined }}>{children}</div>
    </div>
  );
};
