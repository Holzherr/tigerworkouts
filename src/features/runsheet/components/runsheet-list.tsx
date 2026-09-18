import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  closestCenter,
  pointerWithin,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS, getEventCoordinates } from '@dnd-kit/utilities';
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/shared/utils/ui-utils';
import { appendToBlock, flatten, groupOnto, insertAfter, makeRest, moveRow, moveRowTo, moveToTopLevel, removeItem, removeStep, replaceStep, ROLE_LABEL, updateBlock, type Block, type ExerciseStep, type Item, type ItemRole, type Row, type Step } from '../model';
import { ArrowDown, ArrowUp, CornerRightUp, Link2, X } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import { AddTile, SeamInsert, type AddKind } from './add-controls';
import { BlockBracket, BlockHeader } from './block-bracket';
import { StepRow } from './step-row';
import { SwipeToRemove } from './swipe-to-remove';

export interface RunsheetListProps {
  items: Item[];
  onChange: (items: Item[]) => void;
  /** Ask the host to pick an exercise; resolve with the step to insert, or null to cancel. */
  onPickExercise: () => Promise<ExerciseStep | null>;
  /** Ask the host to pick a replacement exercise for an existing step. */
  onSwapExercise?: (step: ExerciseStep) => Promise<ExerciseStep | null>;
  expandedId?: string | null;
  onExpandedChange?: (id: string | null) => void;
  /** Rest inserted between two exercises when they are grouped; 0 disables. */
  autoRest?: number;
  /** Resolve % TM / × BW loads to kg for display. */
  resolveTarget?: (step: ExerciseStep) => number | undefined;
  /** Title lookup for ref items (embedded runsheets). */
  refTitle?: (runsheetId: string) => string | undefined;
  className?: string;
  /**
   * How rows move. `classic`: the original flat sortable. `seams`: while dragging, wide "drop here"
   * targets appear between top-level items so a step can leave a block. `pointer`: the drop spot
   * follows the finger (top/bottom third of a row = before/after, bottom of a block's last step =
   * out of the block) with a coral insertion line. `buttons`: no dragging; expand a row for
   * Up / Down / Out of block buttons.
   */
  variant?: DndVariant;
}
export type DndVariant = 'classic' | 'seams' | 'pointer' | 'buttons';
export const DND_VARIANTS: { value: DndVariant; label: string }[] = [
  { value: 'classic', label: 'Classic drag' },
  { value: 'seams', label: 'A · Drop zones between blocks' },
  { value: 'pointer', label: 'B · Insertion line follows finger' },
  { value: 'buttons', label: 'C · Up / Down / Out buttons' },
];

/** Wide drop targets between top-level items, only while a step is being dragged (variant A). */
const seamsFirst: CollisionDetection = args => {
  const seams = args.droppableContainers.filter(c => String(c.id).startsWith('seam:'));
  const hit = pointerWithin({ ...args, droppableContainers: seams });
  if (hit.length) return hit;
  return closestCenter({ ...args, droppableContainers: args.droppableContainers.filter(c => !String(c.id).startsWith('seam:')) });
};
/** The row under the finger, else the nearest (variant B). */
const underPointer: CollisionDetection = args => {
  const hit = pointerWithin(args);
  return hit.length ? hit : closestCenter(args);
};
const DropSeam = ({ id, label }: { id: string; label: string }) => {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div ref={setNodeRef} className={cn('my-1 flex h-11 items-center justify-center rounded-card border-2 border-dashed text-[12px] font-semibold transition-colors', isOver ? 'border-brand bg-brand-soft text-brand-ink' : 'border-hint bg-canvas text-muted')}>
      {label}
    </div>
  );
};

const GROUP_DWELL_MS = 250;
const GROUP_BAND = 0.6; // middle share of the target row that means "onto"
const LIFT_MS = 350;

/**
 * The editable runsheet. Rows are one flat sortable list (dnd-kit): loose steps, block headers,
 * block steps and an invisible end marker per block. Drag between rows to reorder; hold a lifted
 * row over the middle of another for 250ms and it becomes a group target (orange ring): release
 * to make a block or join one. Blocks drag as a chunk by their header. Tap a row to expand it,
 * swipe or ✕ to remove, ＋ on a seam to insert there.
 */
export const RunsheetList = ({ items, onChange, onPickExercise, onSwapExercise, expandedId: expandedProp, onExpandedChange, autoRest = 30, resolveTarget, refTitle, className, variant = 'classic' }: RunsheetListProps) => {
  const [expandedLocal, setExpandedLocal] = useState<string | null>(null);
  const expandedId = expandedProp === undefined ? expandedLocal : expandedProp;
  const setExpanded = (id: string | null) => (onExpandedChange ? onExpandedChange(id) : setExpandedLocal(id));
  const toggle = (id: string) => setExpanded(expandedId === id ? null : id);

  const rows = useMemo(() => flatten(items), [items]);
  const ids = useMemo(() => rows.map(r => r.id), [rows]);

  const [activeId, setActiveId] = useState<string | null>(null);
  const [groupTarget, setGroupTarget] = useState<string | null>(null);
  const [insertion, setInsertion] = useState<{ id: string; where: 'before' | 'after' } | null>(null);
  const dwell = useRef<{ id: string; since: number } | null>(null);

  const dragSensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: LIFT_MS, tolerance: 6 } })
  );
  const noSensors = useSensors();
  const sensors = variant === 'buttons' ? noSensors : dragSensors;

  const onDragStart = (e: DragStartEvent) => {
    setActiveId(String(e.active.id));
    setExpanded(null);
    if (navigator.vibrate) navigator.vibrate(10);
  };

  const onDragMove = (e: DragMoveEvent) => {
    const { active, over } = e;
    if (over && String(over.id).startsWith('seam:')) {
      dwell.current = null;
      setGroupTarget(null);
      return;
    }
    const overRow = over ? rows.find(r => r.id === over.id) : undefined;
    const activeRow = rows.find(r => r.id === active.id);
    if (variant === 'pointer') {
      const start = e.activatorEvent ? getEventCoordinates(e.activatorEvent) : null;
      const y = start ? start.y + e.delta.y : undefined;
      if (over && overRow && y !== undefined && over.id !== active.id && overRow.type !== 'block-end') {
        const rel = (y - over.rect.top) / Math.max(1, over.rect.height);
        if (rel < 0.3) setInsertion({ id: String(over.id), where: 'before' });
        else if (rel > 0.7) {
          // bottom of a block's last step means "out, after the block"
          const idx = rows.findIndex(r => r.id === over.id);
          const nextRow = rows[idx + 1];
          setInsertion(overRow.type === 'step' && overRow.blockId && nextRow?.type === 'block-end' ? { id: nextRow.id, where: 'after' } : { id: String(over.id), where: 'after' });
        } else setInsertion(null);
        if (rel < 0.3 || rel > 0.7) {
          dwell.current = null;
          setGroupTarget(null);
          return;
        }
      } else setInsertion(null);
    }
    // only steps can group, only onto steps or block heads
    const canGroup =
      !!over && activeRow?.type === 'step' && !!overRow && (overRow.type === 'step' || overRow.type === 'block-head') && over.id !== active.id && !(overRow.type === 'step' && overRow.blockId && overRow.blockId === activeRow.blockId);
    const translated = active.rect.current.translated;
    if (!canGroup || !over || !translated) {
      dwell.current = null;
      setGroupTarget(null);
      return;
    }
    const centerY = translated.top + translated.height / 2;
    const band = over.rect.height * GROUP_BAND;
    const inBand = Math.abs(centerY - (over.rect.top + over.rect.height / 2)) < band / 2;
    if (!inBand) {
      dwell.current = null;
      setGroupTarget(null);
      return;
    }
    const now = Date.now();
    if (!dwell.current || dwell.current.id !== over.id) dwell.current = { id: String(over.id), since: now };
    else if (now - dwell.current.since >= GROUP_DWELL_MS && groupTarget !== over.id) {
      setGroupTarget(String(over.id));
      if (navigator.vibrate) navigator.vibrate(8);
    }
  };

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    const target = groupTarget;
    const ins = insertion;
    setActiveId(null);
    setGroupTarget(null);
    setInsertion(null);
    dwell.current = null;
    if (!over) return;
    if (String(over.id).startsWith('seam:')) {
      const after = String(over.id).slice(5);
      onChange(moveToTopLevel(items, String(active.id), after === 'start' ? null : after));
      return;
    }
    if (variant === 'pointer' && !target && ins) {
      onChange(moveRowTo(items, String(active.id), ins.id, ins.where));
      return;
    }
    if (target) {
      const targetRow = rows.find(r => r.id === target);
      const targetId = targetRow?.type === 'block-head' ? targetRow.block.id : target;
      onChange(groupOnto(items, String(active.id), targetId, { autoRest }));
      return;
    }
    if (over.id !== active.id) onChange(moveRow(items, String(active.id), String(over.id)));
  };

  // keep the dwell timer honest when the pointer sits still (dnd-kit only fires move on motion)
  useEffect(() => {
    if (!activeId) return;
    const t = setInterval(() => {
      const d = dwell.current;
      if (d && Date.now() - d.since >= GROUP_DWELL_MS) setGroupTarget(d.id);
    }, 60);
    return () => clearInterval(t);
  }, [activeId]);

  // ── edits ──
  const change = (step: Step) => onChange(replaceStep(items, step.id, step));
  const remove = (id: string) => {
    if (expandedId === id) setExpanded(null);
    onChange(removeStep(items, id));
  };
  const add = useCallback(
    async (kind: AddKind, where: { after: string | null } | { block: string }) => {
      const step: Step | null = kind === 'rest' ? makeRest(nearestRest(items, 'after' in where ? where.after : where.block) ?? autoRest ?? 30) : await onPickExercise();
      if (!step) return;
      onChange('block' in where ? appendToBlock(items, where.block, step) : insertAfter(items, where.after, step));
      setExpanded(step.id);
    },
    [items, onChange, onPickExercise, autoRest]
  );
  const swap = async (step: ExerciseStep) => {
    const next = await onSwapExercise?.(step);
    if (next) onChange(replaceStep(items, step.id, { ...next, id: step.id, forMode: step.forMode, forValue: step.forValue, target: next.exercise.unit === step.exercise.unit ? step.target : next.target }));
  };

  const activeRow = activeId ? rows.find(r => r.id === activeId) : undefined;
  const dissolvingBlockId = activeRow?.type === 'step' && activeRow.blockId && (items.find(i => i.id === activeRow.blockId) as Block | undefined)?.steps.length === 2 ? activeRow.blockId : null;

  // ── render ──
  const nudge = (id: string, dir: 'up' | 'down' | 'out') => {
    const idx = rows.findIndex(r => r.id === id);
    const row = rows[idx];
    if (!row || row.type !== 'step') return;
    if (dir === 'out' && row.blockId) return onChange(moveRowTo(items, id, `${row.blockId}:end`, 'after'));
    const other = dir === 'up' ? rows[idx - 1] : rows[idx + 1];
    if (!other) return;
    onChange(moveRow(items, id, other.id));
  };
  const moveButtons = (row: Extract<Row, { type: 'step' }>) =>
    variant === 'buttons' && expandedId === row.id ? (
      <div className="flex gap-2 border-t border-line bg-canvas px-2 py-2">
        <Button variant="ghost" size="sm" onClick={() => nudge(row.id, 'up')} disabled={rows.findIndex(r => r.id === row.id) === 0}>
          <ArrowUp /> Up
        </Button>
        <Button variant="ghost" size="sm" onClick={() => nudge(row.id, 'down')} disabled={rows.findIndex(r => r.id === row.id) >= rows.length - 1}>
          <ArrowDown /> Down
        </Button>
        {row.blockId && (
          <Button variant="ghost" size="sm" onClick={() => nudge(row.id, 'out')}>
            <CornerRightUp /> Out of block
          </Button>
        )}
      </div>
    ) : null;
  const renderStep = (row: Extract<Row, { type: 'step' }>, inBlock: boolean) => (
    <SortableStep
      key={row.id}
      id={row.id}
      disabled={expandedId === row.id || variant === 'buttons'}
      className={cn(
        !inBlock && 'rounded-card border border-line bg-surface',
        groupTarget === row.id && 'rounded-card ring-2 ring-brand ring-offset-2 ring-offset-canvas',
        activeId === row.id && 'z-10',
        insertion?.id === row.id && insertion.where === 'before' && 'shadow-[0_-3px_0_0_var(--color-brand)]',
        insertion?.id === row.id && insertion.where === 'after' && 'shadow-[0_3px_0_0_var(--color-brand)]'
      )}
      render={p => (
        <SwipeToRemove onRemove={() => remove(row.id)} disabled={!!activeId || expandedId === row.id}>
          <StepRow
            {...p}
            step={row.step}
            expanded={expandedId === row.id}
            onToggle={() => toggle(row.id)}
            onChange={change}
            onRemove={() => remove(row.id)}
            onSwap={row.step.kind === 'exercise' ? () => swap(row.step as ExerciseStep) : undefined}
            lifted={activeId === row.id}
            groupTarget={groupTarget === row.id}
            resolvedTarget={row.step.kind === 'exercise' && resolveTarget ? resolveTarget(row.step) : undefined}
          />
          {moveButtons(row)}
        </SwipeToRemove>
      )}
    />
  );
  const draggingStep = !!activeId && activeRow?.type === 'step';
  const seam = (afterId: string | null, key: string) => (variant === 'seams' && draggingStep ? <DropSeam key={key} id={`seam:${afterId ?? 'start'}`} label={afterId ? 'Drop here · outside blocks' : 'Drop here · first'} /> : null);

  const blocks: React.ReactNode[] = [];
  let i = 0;
  let currentRole: ItemRole | null = null;
  const roleOf = (r: Row): ItemRole => (r.type === 'step' ? (r.step.role ?? 'main') : r.type === 'block-head' ? (r.block.role ?? 'main') : r.type === 'ref' ? (r.ref.role ?? 'main') : 'main');
  const hasRoles = rows.some(r => r.type !== 'block-end' && roleOf(r) !== 'main');
  const divider = (r: Row) => {
    const role = roleOf(r);
    if (!hasRoles || role === currentRole) return null;
    currentRole = role;
    return (
      <div key={`role-${role}-${r.id}`} className="flex items-center gap-2 pt-2 pb-1 text-[11px] font-bold tracking-widest text-muted uppercase">
        <span className="h-px flex-1 bg-line" />
        {ROLE_LABEL[role]}
        <span className="h-px flex-1 bg-line" />
      </div>
    );
  };
  const first = seam(null, 'seam-start');
  if (first) blocks.push(first);
  while (i < rows.length) {
    const r = rows[i];
    if (r.type === 'ref') {
      blocks.push(
        <Fragment key={r.id}>
          {divider(r)}
          <div className="flex items-center gap-2.5 rounded-card border border-dashed border-hint bg-surface px-3 py-2">
            <Link2 className="size-4 shrink-0 text-faint" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[14px] font-semibold">{refTitle?.(r.ref.runsheetId) ?? r.ref.runsheetId}</div>
              <div className="text-[12px] text-muted">included workout</div>
            </div>
            <Button variant="quiet" size="icon-sm" aria-label="Remove" onClick={() => onChange(removeItem(items, r.id))} className="text-hint">
              <X />
            </Button>
          </div>
        </Fragment>
      );
      i++;
      continue;
    }
    if (r.type === 'step') {
      blocks.push(
        <Fragment key={r.id}>
          {divider(r)}
          {renderStep(r, false)}
          {!activeId && <SeamInsert onInsert={k => add(k, { after: r.id })} className="mt-2" />}
          {seam(r.id, `seam-${r.id}`)}
        </Fragment>
      );
      i++;
      continue;
    }
    if (r.type === 'block-head') {
      const block = r.block;
      const inner: React.ReactNode[] = [];
      let j = i + 1;
      while (j < rows.length && rows[j].type === 'step') {
        const sr = rows[j] as Extract<Row, { type: 'step' }>;
        inner.push(
          <Fragment key={sr.id}>
            {inner.length > 0 && !activeId && <SeamInsert onInsert={k => add(k, { after: (rows[j - 1] as Extract<Row, { type: 'step' }>).id })} />}
            {renderStep(sr, true)}
          </Fragment>
        );
        j++;
      }
      const endRow = rows[j];
      const div = divider(r);
      if (div) blocks.push(div);
      blocks.push(
        <SortableBlock
          key={block.id}
          id={block.id}
          endId={endRow?.id ?? `${block.id}:end`}
          className={cn(insertion?.id === `${block.id}:end` && 'shadow-[0_3px_0_0_var(--color-brand)] rounded-card', insertion?.id === block.id && insertion.where === 'before' && 'shadow-[0_-3px_0_0_var(--color-brand)] rounded-card')}
          render={p => (
            <BlockBracket
              dissolving={dissolvingBlockId === block.id}
              groupTarget={groupTarget === block.id}
              header={
                <BlockHeader {...p} block={block} expanded={expandedId === block.id} onToggle={() => toggle(block.id)} onChange={patch => onChange(updateBlock(items, block.id, patch))} dissolving={dissolvingBlockId === block.id} lifted={activeId === block.id} />
              }
              footer={<AddTile onAdd={k => add(k, { block: block.id })} />}
            >
              {inner}
            </BlockBracket>
          )}
        />
      );
      const after = seam(block.id, `seam-${block.id}`);
      if (after) blocks.push(after);
      i = j + 1;
      continue;
    }
    i++;
  }

  return (
    <DndContext sensors={sensors} collisionDetection={variant === 'seams' ? seamsFirst : variant === 'pointer' ? underPointer : closestCenter} onDragStart={onDragStart} onDragMove={onDragMove} onDragEnd={onDragEnd} onDragCancel={() => (setActiveId(null), setGroupTarget(null), setInsertion(null))}>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <div className={cn('space-y-2', className)}>
          {blocks}
          <AddTile variant="loose" onAdd={k => add(k, { after: null })} className="mt-3" />
        </div>
      </SortableContext>
      <DragOverlay dropAnimation={null}>{null}</DragOverlay>
    </DndContext>
  );
};

const nearestRest = (items: Item[], anchorId: string | null): number | undefined => {
  const steps = items.flatMap(it => (it.kind === 'block' ? it.steps : [it]));
  const idx = anchorId ? steps.findIndex(s => s.id === anchorId) : steps.length - 1;
  for (let k = idx; k >= 0; k--) {
    const s = steps[k];
    if (s.kind === 'rest') return s.seconds;
  }
  return undefined;
};

// ── sortable wrappers ──
type SortProps = Record<string, unknown>;

/** Owns the sortable transform on its own wrapper so the swipe wrapper's overflow never clips the moving row. */
const SortableStep = ({ id, disabled, className, render }: { id: string; disabled?: boolean; className?: string; render: (p: SortProps) => React.ReactNode }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled });
  const style: React.CSSProperties = { transform: CSS.Translate.toString(transform), transition, opacity: isDragging ? 0.95 : 1, touchAction: 'pan-y' };
  return (
    <div ref={setNodeRef} style={style} className={cn('relative overflow-hidden', className)}>
      {render({ ...attributes, ...listeners })}
    </div>
  );
};

/** A block is one sortable (its header carries the listeners) plus a zero-height end marker. */
const SortableBlock = ({ id, endId, render, className }: { id: string; endId: string; render: (p: SortProps) => React.ReactNode; className?: string }) => {
  const head = useSortable({ id });
  const end = useSortable({ id: endId, disabled: true });
  const style: React.CSSProperties = { transform: CSS.Translate.toString(head.transform), transition: head.transition, touchAction: 'pan-y' };
  return (
    <div ref={head.setNodeRef} style={style} className={className}>
      {render({ ...head.attributes, ...head.listeners })}
      <div ref={end.setNodeRef} className="h-0" aria-hidden />
    </div>
  );
};
