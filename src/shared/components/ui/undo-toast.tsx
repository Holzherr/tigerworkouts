import { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '@/shared/utils/ui-utils';

/** How long an Undo stays offered. */
export const UNDO_MS = 5000;

interface Offer {
  message: string;
  undo: () => void;
  key: number;
}

/**
 * One undo at a time for a one-gesture destructive action (drop an exercise, remove a step, skip):
 * `offer("Step removed", restore)` shows a dark pill with the message and an Undo button for five
 * seconds; a newer offer replaces it. Render `toast` somewhere fixed over the screen.
 */
export const useUndo = (className?: string) => {
  const [offer, setOffer] = useState<Offer | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const show = useCallback((message: string, undo: () => void) => {
    clearTimeout(timer.current);
    setOffer({ message, undo, key: Date.now() });
    timer.current = setTimeout(() => setOffer(null), UNDO_MS);
  }, []);
  const toast = offer ? (
    <div key={offer.key} role="status" className={cn('pointer-events-none fixed inset-x-0 bottom-24 z-50 flex justify-center px-4', className)}>
      <div className="pointer-events-auto flex items-center gap-3 rounded-full bg-ink py-1 pr-1 pl-4 text-[14px] font-semibold text-white shadow-lift ring-1 ring-white/15">
        <span>{offer.message}</span>
        <button
          type="button"
          onClick={() => {
            clearTimeout(timer.current);
            offer.undo();
            setOffer(null);
          }}
          className="h-11 rounded-full px-4 font-bold text-brand active:bg-white/10"
        >
          Undo
        </button>
      </div>
    </div>
  ) : null;
  return { offer: show, toast };
};
