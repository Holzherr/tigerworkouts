import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '@/shared/utils/ui-utils';
import { Button } from './button';

export interface SheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  /** Right-hand slot in the header row, e.g. a text button. */
  action?: React.ReactNode;
  /** Sheet height as a CSS length; content scrolls inside. */
  height?: string;
  children: React.ReactNode;
  className?: string;
}

/**
 * Bottom sheet: dimmed backdrop, white panel sliding up with rounded top corners and a grab
 * handle, optional title row with a close ✕. Content area scrolls; the sheet keeps its height.
 */
export const Sheet = ({ open, onOpenChange, title, action, height = '72dvh', children, className }: SheetProps) => (
  <Dialog.Root open={open} onOpenChange={onOpenChange}>
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-40 bg-ink/45" />
      <Dialog.Content
        style={{ height }}
        className={cn('safe-bottom fixed inset-x-0 bottom-0 z-50 mx-auto flex w-full max-w-[430px] flex-col rounded-t-sheet bg-surface shadow-lift outline-none', className)}
      >
        <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-hint" aria-hidden />
        {(title || action) && (
          <div className="flex shrink-0 items-center gap-2 px-4 pt-2 pb-1">
            <Dialog.Title className="flex-1 text-[17px] font-extrabold text-ink">{title}</Dialog.Title>
            {action}
            <Dialog.Close asChild>
              <Button variant="quiet" size="icon-sm" aria-label="Close">
                <X />
              </Button>
            </Dialog.Close>
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">{children}</div>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>
);
