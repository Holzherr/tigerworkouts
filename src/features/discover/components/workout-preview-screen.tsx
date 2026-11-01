import { ChevronLeft, ChevronRight, ExternalLink, Globe, Layers, Lock, Menu, Pencil, Play, Plus, Share2, Smartphone, Trash2, Video } from 'lucide-react';
import { localDate } from '@/shared/utils/dates';
import { Fragment, useState } from 'react';
import { Button } from '@/shared/components/ui/button';
import { Chip } from '@/shared/components/ui/chip';
import { ClipThumb } from '@/shared/components/ui/clip-thumb';
import { cn, fmtClock, fmtNum } from '@/shared/utils/ui-utils';
import { addBlock, blockSeconds, countLabel, forLabel, loadLabel, modeLabel, removeItem, replaceStep, ROLE_LABEL, runsheetMinutes, scoreType, setRuns, shortUnit, straightSetStep, type Block, type ExerciseStep, type Item, type Runsheet } from '@/features/runsheet/model';
import { ExerciseSheet } from '@/features/runsheet/components/exercise-sheet';
import type { SessionResult } from '@/features/runsheet/progression';
import { fmtScore } from '@/features/runsheet/progression';
import { KIND_LABEL } from './workout-card';
import type { Today } from '@/features/runsheet/targets';
import type { Stall } from '@/features/results/stall';
import { StallCard, TodayLine } from '@/features/results/components/targets';
import { RunsheetList, type RunsheetListProps } from '@/features/runsheet/components/runsheet-list';
import { BlockReorder } from '@/features/runsheet/components/block-reorder';
import { BlockSheet } from '@/features/runsheet/components/block-sheet';
import { useUndo } from '@/shared/components/ui/undo-toast';

/** One block open for editing in place (a tap on its header): the editor's list over just that
 * block, its settings in a sheet, Done to read again. A step dragged out lands beside it. */
const EditableBlock = ({ runsheet: r, block, editor: { onChange, ...list }, sheetOpen, onSheet, onDone, onReorder }: { runsheet: Runsheet; block: Block; editor: NonNullable<WorkoutPreviewScreenProps['editor']>; sheetOpen: boolean; onSheet: (open: boolean) => void; onDone: () => void; onReorder: () => void }) => {
  const [expanded, setExpanded] = useState<string | null>(null);
  const undo = useUndo();
  const at = r.items.indexOf(block);
  const setItems = (items: Item[]) => onChange({ ...r, items });
  const splice = (next: Item[]) => setItems([...r.items.slice(0, at), ...next, ...r.items.slice(at + 1)]);
  return (
    <section className="rounded-card ring-2 ring-brand">
      <div className="flex justify-end px-1 pt-1">
        <Button variant="quiet" size="inline" className="font-extrabold text-brand" onClick={onDone} data-testid="block-done">
          Done
        </Button>
      </div>
      <RunsheetList {...list} onReorder={onReorder} items={[block]} onChange={splice} expandedId={expanded === block.id ? null : expanded} onExpandedChange={id => (id === block.id ? onSheet(true) : setExpanded(id))} onRemoved={(before, what) => undo.offer(what, () => splice(before))} />
      <BlockSheet block={sheetOpen ? block : null} onOpenChange={o => onSheet(o)} onChange={b => splice([b])} onRemove={() => (setItems(removeItem(r.items, block.id)), undo.offer(`Removed ${block.name || 'block'}`, () => setItems(r.items)))} />
      {undo.toast}
    </section>
  );
};

export interface WorkoutPreviewScreenProps {
  runsheet: Runsheet;
  history?: SessionResult[];
  /** "last time 57.5 × 8" under an exercise that has been done before. */
  lastTime?: (step: ExerciseStep) => string | undefined;
  onBack?: () => void;
  onStart?: () => void;
  onEditAndStart?: () => void;
  onFollowAlong?: () => void;
  onLogOnly?: () => void;
  onSave?: () => void;
  saved?: boolean;
  onShare?: () => void;
  /** Given, every exercise on the page is editable where it is read — no edit mode. */
  onStepChange?: (stepId: string, patch: { target?: number; incline?: number }) => void;
  /** Opens the creator's public page from the attribution line. */
  onCreator?: () => void;
  /** Given for your own workouts: flips it between private and on your public page. */
  onTogglePublic?: () => void;
  /** tigerworkouts:// link that opens this workout in the iOS app. */
  appHref?: string;
  /** Opens an exercise's logbook from its sheet. */
  onExerciseHistory?: (step: ExerciseStep) => void;
  /** Whether an exercise has logged history; the sheet's History row shows only when it does. */
  hasHistory?: (step: ExerciseStep) => boolean;
  /** What to aim for today, from history; every exercise with a target is listed under the line. */
  today?: Today;
  /** The workout's own stall (a score that stopped moving), shown under today's target. */
  stall?: Stall;
  onDismissStall?: () => void;
  /** Given for your own workouts: deletes it, after asking. */
  onDelete?: () => void;
  /** Given, the page is also the editor (as on the phone): it reads plain, a tap on a block's
   * header opens that block alone for editing (steppers, add, drag, its sheet) until its Done, and
   * the grip that reorders blocks always shows (Nick, 1 Nov 2026). Formerly: until Edit, with
   * Add block and Add a one-off exercise under them, until Done (Nick, 18 Oct 2026). Every change
   * comes here, and saves as it is made. */
  /** Opens with this block open for editing (stories, screenshots). */
  initialEditing?: string;
  editor?: Omit<RunsheetListProps, 'items' | 'onChange' | 'expandedId' | 'onExpandedChange' | 'onRemoved'> & { onChange: (r: Runsheet) => void };
}

/** A straight-set block whose sets differ, read as the gym writes it: one line per run of sets
 * alike ("Set 1  40 kg × 12", "Sets 2–5  60 kg × 8"). Sets all alike need no list: the block's
 * ×N says it. */
const SetList = ({ block, step }: { block: Block; step: ExerciseStep }) => {
  const unit = shortUnit(step.exercise.unit);
  const count = countLabel(step.forMode)?.toLowerCase();
  const runs = setRuns(block);
  if (runs.length < 2) return null;
  return (
    <div className="px-3 pt-0.5 pb-1.5" aria-label="Sets">
      {runs.map(run => (
        <div key={run.from} className="flex items-center gap-3 py-0.5 text-[13px] tabular-nums">
          <span className="w-16 font-bold text-muted">{run.count > 1 ? `Sets ${run.from + 1}–${run.from + run.count}` : `Set ${run.from + 1}`}</span>
          <span className="flex-1 font-semibold">{[run.load !== undefined && unit ? `${fmtNum(run.load)} ${unit}` : '', count ? `${fmtNum(run.reps)} ${count}` : forLabel(step)].filter(Boolean).join(' × ')}</span>
        </div>
      ))}
    </div>
  );
};

const SCORE_TEXT: Record<string, string> = { time: 'For time', rounds: 'AMRAP: rounds + reps', reps: 'Total reps', load: 'For load', distance: 'For distance' };

/**
 * Workout page: title, attribution line with a source link, description, chips for length / mode
 * / score, the blocks and steps, the user's best and last results, and the actions: Start,
 * Edit & start, Follow along for videos, Save. Tapping any exercise opens it — the clip, the cue,
 * and its numbers as steppers when the host can save them.
 */
export const WorkoutPreviewScreen = ({ runsheet: r, history = [], lastTime, onBack, onStart, onEditAndStart, onFollowAlong, onLogOnly, onSave, saved, onShare, onStepChange, onCreator, onTogglePublic, appHref, onExerciseHistory, hasHistory, today, stall, onDismissStall, onDelete, editor, initialEditing }: WorkoutPreviewScreenProps) => {
  const [open, setOpen] = useState<ExerciseStep | null>(null);
  // The block a tap on its header opened for editing, and whether its settings sheet is up.
  const [focus, setFocus] = useState<string | undefined>(initialEditing);
  const [blockSheet, setBlockSheet] = useState(false);
  const [reordering, setReordering] = useState(false);
  const focused = r.items.find((i): i is Block => i.kind === 'block' && i.id === focus);
  const setItems = (items: Item[]) => editor?.onChange({ ...r, items });
  const openBlock = (id: string, sheet = false) => (setFocus(id), setBlockSheet(sheet));
  // In the read view an exercise's sheet still changes its numbers, through the editor when there is one.
  const stepChange =
    onStepChange ??
    (editor &&
      ((id: string, patch: { target?: number; incline?: number }) => {
        const found = r.items.flatMap(i => (i.kind === 'block' ? i.steps : i.kind === 'ref' ? [] : [i])).find((s): s is ExerciseStep => s.id === id && s.kind === 'exercise');
        if (found) editor.onChange({ ...r, items: replaceStep(r.items, id, { ...found, ...patch }) });
      }));
  const historyOf = (s: ExerciseStep) => (onExerciseHistory ? ((hasHistory?.(s) ?? true) ? () => onExerciseHistory(s) : undefined) : editor?.historyFor?.(s));
  const kind = r.source?.kind ?? 'user';
  const score = scoreType(r);
  // A for-time that was stopped or capped has no finish time to be best at.
  const scored = history.filter(h => h.score !== undefined && (score !== 'time' || h.completed !== false));
  const best = scored.length ? (score === 'time' ? scored.reduce((a, b) => (b.score! < a.score! ? b : a)) : scored.reduce((a, b) => (b.score! > a.score! ? b : a))) : undefined;
  const last = history[0];
  return (
    <div className="flex h-full min-h-0 flex-col bg-canvas">
      <header className="safe-top shrink-0 bg-surface px-4 pt-2 pb-3">
        <div className="flex items-center justify-between gap-2">
          <Button variant="quiet" size="inline" onClick={onBack} className="-ml-1 text-muted">
            <ChevronLeft /> Back
          </Button>
        </div>
        <h1 className="mt-1 text-[22px] leading-tight font-extrabold">{r.title}</h1>
        <div className="mt-1 flex flex-wrap items-center gap-x-1 text-[13px] text-muted">
          <span>{(kind === 'user' && r.ownerId ? 'Creator' : KIND_LABEL[kind])}</span>
          {(r.source?.author ?? r.creator) &&
            (onCreator ? (
              <button type="button" onClick={onCreator} className="font-semibold text-brand">
                · {r.source?.author ?? r.creator}
              </button>
            ) : (
              <span>· {r.source?.author ?? r.creator}</span>
            ))}
          {r.program && (
            <span>
              · {r.program.name}, {r.program.day}
            </span>
          )}
          {r.source?.url && (
            <a href={r.source.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-brand">
              · source <ExternalLink className="size-3" />
            </a>
          )}
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Chip variant="value">{runsheetMinutes(r)} min</Chip>
          {r.timeCapSec && <Chip variant="outline">cap {fmtClock(r.timeCapSec)}</Chip>}
          {score !== 'none' && <Chip variant="brand">{SCORE_TEXT[score]}</Chip>}
          {r.level && <Chip variant="outline">{r.level}</Chip>}
          {onTogglePublic && (
            <Chip variant={r.public ? 'brand' : 'outline'} onClick={onTogglePublic} aria-label={r.public ? 'Public — tap to make private' : 'Private — tap to make public'}>
              {r.public ? <Globe className="size-3.5" /> : <Lock className="size-3.5" />} {r.public ? 'Public' : 'Private'}
            </Chip>
          )}
        </div>
        {appHref && (
          <a href={appHref} className="mt-2 inline-flex items-center gap-1.5 text-[13px] font-bold text-brand">
            <Smartphone className="size-4" /> Open in the app
          </a>
        )}
      </header>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3">
        {today && (
          <div className="rounded-card border border-brand-line bg-surface px-3 py-2.5">
            <TodayLine text={today.text} detail={today.sets.length > 1 ? today.sets[0].reason : today.detail} />
            {today.sets.slice(1).map(t => (
              <div key={t.stepId} className="mt-1.5 pl-6 text-[13px]">
                <span className="font-bold">{t.name} {t.text}</span>
                <div className="text-[12px] text-muted">{t.reason}</div>
              </div>
            ))}
          </div>
        )}
        {stall && onDismissStall && <StallCard stall={stall} onDismiss={onDismissStall} />}
        {r.description && <p className="px-1 text-[14px] leading-relaxed text-body">{r.description}</p>}
        {(best || last) && (
          <div className="flex gap-2">
            {best && (
              <div className="flex-1 rounded-card border border-line bg-surface px-3 py-2">
                <div className="text-[11px] font-bold tracking-widest text-muted uppercase">Best</div>
                <div className="text-[17px] font-extrabold tabular-nums">{fmtScore(score, best.score, best.scoreText)}</div>
              </div>
            )}
            {last && (
              <div className="flex-1 rounded-card border border-line bg-surface px-3 py-2">
                <div className="text-[11px] font-bold tracking-widest text-muted uppercase">Last · {localDate(last.startedAt)}</div>
                <div className="text-[17px] font-extrabold tabular-nums">{last.score !== undefined ? fmtScore(score, last.score, last.scoreText) : 'done'}</div>
              </div>
            )}
          </div>
        )}
        {r.items.map((it, i) => {
          if (it.kind === 'ref') return null;
          const role = it.role && it.role !== 'main' ? ROLE_LABEL[it.role] : null;
          if (it.kind === 'block') {
            if (editor && it === focused) return <EditableBlock key={it.id} runsheet={r} block={it} editor={editor} sheetOpen={blockSheet} onSheet={setBlockSheet} onDone={() => setFocus(undefined)} onReorder={() => setReordering(true)} />;
            const straight = straightSetStep(it);
            return (
              <section key={it.id} className="rounded-card border border-line bg-surface">
                <div className="flex items-center gap-2 px-3 pt-2.5 pb-1.5">
                  <div
                    className={cn('min-w-0 flex-1', editor && 'cursor-pointer')}
                    {...(editor ? { role: 'button', tabIndex: 0, 'aria-label': `Edit ${it.name || 'block'}`, onClick: () => openBlock(it.id), onKeyDown: (e: React.KeyboardEvent) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), openBlock(it.id)) } : {})}
                  >
                    <div className="truncate text-[14px] font-bold">
                      {role ? `${role} · ` : ''}
                      {it.name}
                    </div>
                    <div className="text-[12px] text-muted">
                      {Math.round(blockSeconds(it) / 60)} min{it.restBetweenSec ? ` · rest ${it.restBetweenSec}s between` : ''}
                      {it.note ? ` · ${it.note}` : ''}
                    </div>
                  </div>
                  <Chip variant="brand" size="md" className="font-extrabold">
                    {modeLabel(it)}
                  </Chip>
                  {editor && (
                    <button type="button" aria-label="Reorder blocks" data-testid="block-grip" onClick={() => setReordering(true)} className="-mr-1 grid size-9 shrink-0 place-items-center text-muted active:text-ink">
                      <Menu className="size-5" />
                    </button>
                  )}
                </div>
                <div className="[&>*+*]:border-t [&>*+*]:border-line-soft">
                  {it.steps.map(s =>
                    s.kind === 'rest' ? (
                      <div key={s.id} className="flex items-center gap-2.5 px-3 py-1.5">
                        <ClipThumb size="sm" variant="rest" />
                        <div className="min-w-0 flex-1 truncate text-[14px] text-body">Rest</div>
                        <span className="text-[13px] font-semibold tabular-nums">{s.seconds}s</span>
                      </div>
                    ) : (
                      <Fragment key={s.id}>
                      <button type="button" onClick={() => setOpen(s)} className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left active:bg-line-soft">
                        <ClipThumb size="sm" clip={s.exercise.clip} poster={s.exercise.poster} icon={s.exercise.icon} />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[14px]">{s.exercise.name}</div>
                          {lastTime?.(s) && <div className="truncate text-[12px] text-muted">{lastTime(s)}</div>}
                        </div>
                        <span className="text-[13px] font-semibold tabular-nums">{[loadLabel(s), forLabel(s)].filter(Boolean).join(' · ')}</span>
                        <ChevronRight className="size-4 shrink-0 text-faint" />
                      </button>
                      {straight && <SetList block={it} step={straight} />}
                      </Fragment>
                    )
                  )}
                </div>
              </section>
            );
          }
          if (it.kind === 'rest')
            return (
              <div key={it.id ?? i} className="flex items-center gap-2.5 rounded-card border border-line bg-surface px-3 py-2">
                <ClipThumb size="sm" variant="rest" />
                <div className="min-w-0 flex-1 truncate text-[14px] font-semibold">Rest</div>
                <span className="text-[13px] font-semibold tabular-nums">{it.seconds}s</span>
              </div>
            );
          return (
            <button key={it.id ?? i} type="button" onClick={() => setOpen(it)} className="flex w-full items-center gap-2.5 rounded-card border border-line bg-surface px-3 py-2 text-left active:bg-line-soft">
              <ClipThumb size="sm" clip={it.exercise.clip} poster={it.exercise.poster} icon={it.exercise.icon} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[14px] font-semibold">{it.exercise.name}</div>
                {(role || lastTime?.(it)) && <div className="truncate text-[12px] text-muted">{[role, lastTime?.(it)].filter(Boolean).join(' · ')}</div>}
              </div>
              <span className="text-[13px] font-semibold tabular-nums">{[loadLabel(it), forLabel(it)].filter(Boolean).join(' · ')}</span>
              <ChevronRight className="size-4 shrink-0 text-faint" />
            </button>
          );
        })}
        {editor && (
          <div className="flex gap-2">
            <Button variant="ghost" block onClick={() => { const next = addBlock(r.items); setItems(next.items); openBlock(next.blockId, true); }}>
              <Layers /> Add block
            </Button>
            <Button variant="ghost" block onClick={() => editor.onPickExercise().then(step => step && setItems([...r.items, step]))}>
              <Plus /> Add a one-off exercise
            </Button>
          </div>
        )}
        {reordering && <BlockReorder open items={r.items} refTitle={editor?.refTitle} onCancel={() => setReordering(false)} onDone={next => (setReordering(false), next.some((it, k) => it !== r.items[k]) && setItems(next))} />}
        {r.source?.license && <p className="px-1 text-[11px] text-faint">{r.source.license}</p>}
        {onDelete && (
          <Button variant="danger" block onClick={() => confirm(`Delete ${r.title || 'this workout'}? Sessions you logged with it stay in History.`) && onDelete()}>
            <Trash2 /> Delete workout
          </Button>
        )}
        <ExerciseSheet
          step={open}
          onOpenChange={o => !o && setOpen(null)}
          onTarget={stepChange && open ? t => (stepChange(open.id, { target: t }), setOpen({ ...open, target: t })) : undefined}
          onIncline={stepChange && open ? v => (stepChange(open.id, { incline: v }), setOpen({ ...open, incline: v })) : undefined}
          note={stepChange ? 'Saved to this workout.' : undefined}
          onHistory={open ? historyOf(open) : undefined}
        />
      </div>
      <div className="safe-bottom shrink-0 border-t border-line bg-surface p-3">
        <div className="flex gap-2">
          {r.video && onFollowAlong ? (
            <Button block onClick={onFollowAlong}>
              <Video /> Follow along
            </Button>
          ) : (
            <Button block onClick={onStart}>
              <Play /> Start
            </Button>
          )}
          {onEditAndStart && (
            <Button variant="ghost" onClick={onEditAndStart} aria-label="Edit and start">
              <Pencil /> Edit
            </Button>
          )}
          {onSave && (
            <Button variant={saved ? 'soft' : 'ghost'} onClick={onSave}>
              {saved ? 'Saved' : 'Save'}
            </Button>
          )}
          {onShare && (
            <Button variant="ghost" size="icon" aria-label="Share" onClick={onShare}>
              <Share2 />
            </Button>
          )}
        </div>
        {onLogOnly && (
          <button type="button" onClick={onLogOnly} className="mt-1 min-h-11 w-full text-center text-[13px] font-bold text-brand">
            Did it already? Log a result
          </button>
        )}
      </div>
    </div>
  );
};
