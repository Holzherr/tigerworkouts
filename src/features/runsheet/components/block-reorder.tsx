import { DndContext, MouseSensor, TouchSensor, closestCenter, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent, type DragMoveEvent } from '@dnd-kit/core';
import { CSS, getEventCoordinates } from '@dnd-kit/utilities';
import { Lock, Menu } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/shared/components/ui/button';
import { Sheet } from '@/shared/components/ui/sheet';
import { cn, plural } from '@/shared/utils/ui-utils';
import { CLAMP_NOTE, forLabel, itemSeconds, modeLabel, moveItemClamped, straightSetStep, type Item } from '../model';

export interface BlockReorderProps {
  open: boolean;
  items: Item[];
  /** Done and running in a live session: shown fixed at the top, never moved. */
  locked?: ReadonlySet<string>;
  /** The new order; each item moves whole, so a block keeps all its steps. */
  onDone: (items: Item[]) => void;
  onCancel: () => void;
  refTitle?: (runsheetId: string) => string | undefined;
}

const LIFT_MS = 150;
const minutes = (sec: number) => (sec < 60 ? `${Math.round(sec)} s` : `${Math.round(sec / 60)} min`);

const title = (it: Item, refTitle?: (id: string) => string | undefined) =>
  it.kind === 'block' ? it.name || 'Block' : it.kind === 'exercise' ? it.exercise.name : it.kind === 'rest' ? 'Rest' : (refTitle?.(it.runsheetId) ?? 'Included workout');

/** "2 exercises · 8 rounds", "1 exercise · 5 sets", "3 exercises · AMRAP 10:00". */
export const cardDetail = (it: Item): string => {
  if (it.kind === 'block') {
    const runs = straightSetStep(it) ? plural(it.repeat, 'set') : (it.mode ?? 'rounds') === 'rounds' ? plural(it.repeat, 'round') : modeLabel(it);
    return `${plural(it.steps.filter(s => s.kind === 'exercise').length, 'exercise')} · ${runs}`;
  }
  if (it.kind === 'exercise') return forLabel(it);
  if (it.kind === 'rest') return `${Math.floor(it.seconds / 60)}:${String(it.seconds % 60).padStart(2, '0')}`;
  return 'included workout';
};

/**
 * Every block as one line card — name, exercises, sets or rounds, time — dragged into a new order
 * (TW-026, specs/blocks-compact-and-drag.md part 3); the web twin of the phone's BlockReorderView.
 * Press and drag a card, a coral line shows where it lands; Done applies the order. Mid-session the
 * done and running blocks sit fixed above the list, and a card dropped above them lands right after
 * the running one, with a line that says so. The host mounts it per opening, so Cancel leaves
 * nothing behind.
 */
export const BlockReorder = ({ open, items, locked, onDone, onCancel, refTitle }: BlockReorderProps) => {
  const [draft, setDraft] = useState(items);
  const [note, setNote] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [line, setLine] = useState<{ id: string; where: 'before' | 'after' } | null>(null);

  const sensors = useSensors(useSensor(MouseSensor, { activationConstraint: { distance: 4 } }), useSensor(TouchSensor, { activationConstraint: { delay: LIFT_MS, tolerance: 6 } }));

  let fixed = 0;
  while (fixed < draft.length && locked?.has(draft[fixed].id)) fixed++;
  const movable = draft.slice(fixed);

  /** Where the finger is: the top half of a card is above it, the bottom half below. */
  const landing = (e: DragMoveEvent | DragEndEvent) => {
    const start = e.activatorEvent ? getEventCoordinates(e.activatorEvent) : null;
    if (!e.over || !start) return null;
    const y = start.y + e.delta.y;
    return { id: String(e.over.id), where: y < e.over.rect.top + e.over.rect.height / 2 ? ('before' as const) : ('after' as const) };
  };
  const onMove = (e: DragMoveEvent) => setLine(landing(e));

  const onEnd = (e: DragEndEvent) => {
    const at = landing(e);
    setActiveId(null);
    setLine(null);
    if (!at) return;
    // The fixed cards are one drop target: anything dropped on them is dropped above the list.
    const to = at.id === 'fixed' ? 0 : draft.findIndex(it => it.id === at.id) + (at.where === 'after' ? 1 : 0);
    const moved = moveItemClamped(draft, String(e.active.id), to, locked);
    setDraft(moved.items);
    setNote(moved.clamped ? CLAMP_NOTE : null);
    if (navigator.vibrate) navigator.vibrate(8);
  };

  return (
    <Sheet
      open={open}
      onOpenChange={o => !o && onCancel()}
      title="Reorder blocks"
      action={
        <Button variant="quiet" className="font-bold text-brand-ink" onClick={() => onDone(draft)}>
          Done
        </Button>
      }
    >
      <div className="space-y-2">
        {note && (
          <div role="status" aria-label="Moved" className="rounded-control bg-brand-soft px-3 py-2.5 text-[14px] font-semibold text-brand-ink">
            {note}
          </div>
        )}
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={e => (setActiveId(String(e.active.id)), navigator.vibrate?.(10))}
          onDragMove={onMove}
          onDragEnd={onEnd}
          onDragCancel={() => (setActiveId(null), setLine(null))}
        >
          {fixed > 0 && (
            <FixedCards line={line?.id === 'fixed' || (line?.id === movable[0]?.id && line.where === 'before')}>
              {draft.slice(0, fixed).map(it => (
                <Card key={it.id} item={it} refTitle={refTitle} fixed />
              ))}
            </FixedCards>
          )}
          <ul aria-label="Blocks" className="space-y-1.5">
            {movable.map(it => (
              <DraggableCard key={it.id} item={it} refTitle={refTitle} lifted={activeId === it.id} line={line?.id === it.id && !(fixed > 0 && line.where === 'before' && it.id === movable[0].id) ? line.where : null} />
            ))}
          </ul>
        </DndContext>
        <p className="px-1 text-[12px] text-muted">Drag a card to move the block, steps and all.</p>
      </div>
    </Sheet>
  );
};

const FixedCards = ({ children, line }: { children: React.ReactNode; line: boolean }) => {
  const { setNodeRef } = useDroppable({ id: 'fixed' });
  return (
    <div ref={setNodeRef} aria-label="Done and running" className={cn('space-y-1.5 rounded-card', line && 'shadow-[0_3px_0_0_var(--color-brand)]')}>
      {children}
    </div>
  );
};

const Card = ({ item, refTitle, fixed }: { item: Item; refTitle?: (id: string) => string | undefined; fixed?: boolean }) => (
  <div className={cn('flex min-h-14 items-center gap-3 px-3', fixed && 'rounded-card bg-well text-muted')}>
    {fixed && <Lock aria-label="Fixed" className="size-3.5 shrink-0 text-faint" />}
    <div className="min-w-0 flex-1">
      <div className={cn('truncate text-[15px] font-semibold', !fixed && 'text-ink')}>{title(item, refTitle)}</div>
      <div className="truncate text-[12px] text-muted">{cardDetail(item)}</div>
    </div>
    <span className="text-[13px] font-semibold text-muted tabular-nums">{minutes(itemSeconds(item))}</span>
    {!fixed && <Menu aria-hidden className="size-5 shrink-0 text-faint" />}
  </div>
);

const DraggableCard = ({ item, refTitle, lifted, line }: { item: Item; refTitle?: (id: string) => string | undefined; lifted: boolean; line: 'before' | 'after' | null }) => {
  const drag = useDraggable({ id: item.id });
  const drop = useDroppable({ id: item.id });
  return (
    <li
      ref={node => (drag.setNodeRef(node), drop.setNodeRef(node))}
      {...drag.attributes}
      {...drag.listeners}
      aria-label={title(item, refTitle)}
      style={{ transform: CSS.Translate.toString(drag.transform), touchAction: 'pan-y' }}
      className={cn(
        'relative cursor-grab rounded-card border border-line bg-surface select-none',
        lifted && 'z-10 shadow-lift',
        line === 'before' && 'shadow-[0_-3px_0_0_var(--color-brand)]',
        line === 'after' && 'shadow-[0_3px_0_0_var(--color-brand)]'
      )}
    >
      <Card item={item} refTitle={refTitle} />
    </li>
  );
};
