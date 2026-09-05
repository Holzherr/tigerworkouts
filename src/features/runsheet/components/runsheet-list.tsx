import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/shared/utils/ui-utils';
import { appendToBlock, flatten, groupOnto, insertAfter, makeRest, moveRow, removeStep, replaceStep, updateBlock, type Block, type ExerciseStep, type Item, type Row, type Step } from '../model';
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
  className?: string;
}

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
export const RunsheetList = ({ items, onChange, onPickExercise, onSwapExercise, expandedId: expandedProp, onExpandedChange, autoRest = 30, className }: RunsheetListProps) => {
  const [expandedLocal, setExpandedLocal] = useState<string | null>(null);
  const expandedId = expandedProp === undefined ? expandedLocal : expandedProp;
  const setExpanded = (id: string | null) => (onExpandedChange ? onExpandedChange(id) : setExpandedLocal(id));
  const toggle = (id: string) => setExpanded(expandedId === id ? null : id);

  const rows = useMemo(() => flatten(items), [items]);
  const ids = useMemo(() => rows.map(r => r.id), [rows]);

  const [activeId, setActiveId] = useState<string | null>(null);
  const [groupTarget, setGroupTarget] = useState<string | null>(null);
  const dwell = useRef<{ id: string; since: number } | null>(null);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: LIFT_MS, tolerance: 6 } })
  );

  const onDragStart = (e: DragStartEvent) => {
    setActiveId(String(e.active.id));
    setExpanded(null);
    if (navigator.vibrate) navigator.vibrate(10);
  };

  const onDragMove = (e: DragMoveEvent) => {
    const { active, over } = e;
    const overRow = over ? rows.find(r => r.id === over.id) : undefined;
    const activeRow = rows.find(r => r.id === active.id);
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
    setActiveId(null);
    setGroupTarget(null);
    dwell.current = null;
    if (!over) return;
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
  const renderStep = (row: Extract<Row, { type: 'step' }>, inBlock: boolean) => (
    <SortableStep
      key={row.id}
      id={row.id}
      disabled={expandedId === row.id}
      className={cn(!inBlock && 'rounded-card border border-line bg-surface', groupTarget === row.id && 'rounded-card ring-2 ring-brand ring-offset-2 ring-offset-canvas', activeId === row.id && 'z-10')}
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
          />
        </SwipeToRemove>
      )}
    />
  );

  const blocks: React.ReactNode[] = [];
  let i = 0;
  while (i < rows.length) {
    const r = rows[i];
    if (r.type === 'step') {
      blocks.push(
        <Fragment key={r.id}>
          {renderStep(r, false)}
          {!activeId && <SeamInsert onInsert={k => add(k, { after: r.id })} className="mt-2" />}
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
      blocks.push(
        <SortableBlock
          key={block.id}
          id={block.id}
          endId={endRow?.id ?? `${block.id}:end`}
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
      i = j + 1;
      continue;
    }
    i++;
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={onDragStart} onDragMove={onDragMove} onDragEnd={onDragEnd} onDragCancel={() => (setActiveId(null), setGroupTarget(null))}>
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
const SortableBlock = ({ id, endId, render }: { id: string; endId: string; render: (p: SortProps) => React.ReactNode }) => {
  const head = useSortable({ id });
  const end = useSortable({ id: endId, disabled: true });
  const style: React.CSSProperties = { transform: CSS.Translate.toString(head.transform), transition: head.transition, touchAction: 'pan-y' };
  return (
    <div ref={head.setNodeRef} style={style}>
      {render({ ...head.attributes, ...head.listeners })}
      <div ref={end.setNodeRef} className="h-0" aria-hidden />
    </div>
  );
};
