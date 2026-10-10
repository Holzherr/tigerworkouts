import { ChevronLeft, ChevronRight, ExternalLink, Globe, Layers, Lock, Pencil, Play, Plus, Share2, Smartphone, Trash2, Video } from 'lucide-react';
import { localDate } from '@/shared/utils/dates';
import { Fragment, useState } from 'react';
import { Button } from '@/shared/components/ui/button';
import { Chip } from '@/shared/components/ui/chip';
import { ClipThumb } from '@/shared/components/ui/clip-thumb';
import { fmtClock, fmtNum, plural } from '@/shared/utils/ui-utils';
import { addBlock, blockSeconds, countLabel, forLabel, loadLabel, modeLabel, plannedSet, removeItem, ROLE_LABEL, runsheetMinutes, scoreType, shortUnit, straightSetStep, type Block, type ExerciseStep, type Item, type Runsheet } from '@/features/runsheet/model';
import { ExerciseSheet } from '@/features/runsheet/components/exercise-sheet';
import type { SessionResult } from '@/features/runsheet/progression';
import { fmtScore } from '@/features/runsheet/progression';
import { KIND_LABEL } from './workout-card';
import type { Today } from '@/features/runsheet/targets';
import type { Stall } from '@/features/results/stall';
import { StallCard, TodayLine } from '@/features/results/components/targets';
import { RunsheetList, type RunsheetListProps } from '@/features/runsheet/components/runsheet-list';
import { BlockSheet } from '@/features/runsheet/components/block-sheet';
import { useUndo } from '@/shared/components/ui/undo-toast';

/** The workout's rows, editable in place: the editor's list, block settings in a sheet. */
const EditableList = ({ runsheet: r, editor: { onChange, ...list } }: { runsheet: Runsheet; editor: NonNullable<WorkoutPreviewScreenProps['editor']> }) => {
  const [expanded, setExpanded] = useState<string | null>(null);
  const undo = useUndo();
  const block = r.items.find((i): i is Block => i.kind === 'block' && i.id === expanded) ?? null;
  const setItems = (items: Item[]) => onChange({ ...r, items });
  const add = (items: Item[], open: string) => (setItems(items), setExpanded(open));
  const oneOff = () => list.onPickExercise().then(step => step && add([...r.items, step], step.id));
  return (
    <>
      <RunsheetList {...list} items={r.items} onChange={setItems} expandedId={block ? null : expanded} onExpandedChange={setExpanded} onRemoved={(before, what) => undo.offer(what, () => setItems(before))} />
      <div className="flex gap-2">
        <Button variant="ghost" block onClick={() => { const next = addBlock(r.items); add(next.items, next.blockId); }}>
          <Layers /> Add block
        </Button>
        <Button variant="ghost" block onClick={oneOff}>
          <Plus /> Add a one-off exercise
        </Button>
      </div>
      <BlockSheet block={block} onOpenChange={o => !o && setExpanded(null)} onChange={b => setItems(r.items.map(i => (i.id === b.id ? b : i)))} onRemove={() => block && (setItems(removeItem(r.items, block.id)), undo.offer(`Removed ${block.name || 'block'}`, () => setItems(r.items)))} />
      {undo.toast}
    </>
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
  /** Given, the page is the editor (as on the phone): the same rows as the editor, a block's header
   * opens its sheet, Add block and Add a one-off exercise under the list. Every change comes here. */
  editor?: Omit<RunsheetListProps, 'items' | 'onChange' | 'expandedId' | 'onExpandedChange' | 'onRemoved'> & { onChange: (r: Runsheet) => void };
}

/** A straight-set block read as the gym writes it: set, load, reps — one line each. */
const SetList = ({ block, step }: { block: Block; step: ExerciseStep }) => {
  const unit = shortUnit(step.exercise.unit);
  const count = countLabel(step.forMode)?.toLowerCase();
  return (
    <div className="px-3 pt-0.5 pb-1.5" aria-label="Sets">
      {Array.from({ length: block.repeat }, (_, i) => {
        const p = plannedSet(step, i);
        return (
          <div key={i} className="flex items-center gap-3 py-0.5 text-[13px] tabular-nums">
            <span className="w-12 font-bold text-muted">Set {i + 1}</span>
            <span className="flex-1 font-semibold">{[p.load !== undefined && unit ? `${fmtNum(p.load)} ${unit}` : '', count ? `${fmtNum(p.reps)} ${count}` : forLabel(step)].filter(Boolean).join(' × ')}</span>
          </div>
        );
      })}
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
export const WorkoutPreviewScreen = ({ runsheet: r, history = [], lastTime, onBack, onStart, onEditAndStart, onFollowAlong, onLogOnly, onSave, saved, onShare, onStepChange, onCreator, onTogglePublic, appHref, onExerciseHistory, hasHistory, today, stall, onDismissStall, onDelete, editor }: WorkoutPreviewScreenProps) => {
  const [open, setOpen] = useState<ExerciseStep | null>(null);
  const kind = r.source?.kind ?? 'user';
  const score = scoreType(r);
  // A for-time that was stopped or capped has no finish time to be best at.
  const scored = history.filter(h => h.score !== undefined && (score !== 'time' || h.completed !== false));
  const best = scored.length ? (score === 'time' ? scored.reduce((a, b) => (b.score! < a.score! ? b : a)) : scored.reduce((a, b) => (b.score! > a.score! ? b : a))) : undefined;
  const last = history[0];
  return (
    <div className="flex h-full min-h-0 flex-col bg-canvas">
      <header className="safe-top shrink-0 bg-surface px-4 pt-2 pb-3">
        <Button variant="quiet" size="inline" onClick={onBack} className="-ml-1 text-muted">
          <ChevronLeft /> Back
        </Button>
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
        {editor ? <EditableList runsheet={r} editor={editor} /> : r.items.map((it, i) => {
          if (it.kind === 'ref') return null;
          const role = it.role && it.role !== 'main' ? ROLE_LABEL[it.role] : null;
          if (it.kind === 'block') {
            const straight = straightSetStep(it);
            return (
              <section key={it.id} className="rounded-card border border-line bg-surface">
                <div className="flex items-center gap-2 px-3 pt-2.5 pb-1.5">
                  <div className="min-w-0 flex-1">
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
                        <span className="text-[13px] font-semibold tabular-nums">{straight ? plural(it.repeat, 'set') : [loadLabel(s), forLabel(s)].filter(Boolean).join(' · ')}</span>
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
        {r.source?.license && <p className="px-1 text-[11px] text-faint">{r.source.license}</p>}
        {onDelete && (
          <Button variant="danger" block onClick={() => confirm(`Delete ${r.title || 'this workout'}? Sessions you logged with it stay in History.`) && onDelete()}>
            <Trash2 /> Delete workout
          </Button>
        )}
        <ExerciseSheet
          step={open}
          onOpenChange={o => !o && setOpen(null)}
          onTarget={onStepChange && open ? t => (onStepChange(open.id, { target: t }), setOpen({ ...open, target: t })) : undefined}
          onIncline={onStepChange && open ? v => (onStepChange(open.id, { incline: v }), setOpen({ ...open, incline: v })) : undefined}
          note={onStepChange ? 'Saved to this workout.' : undefined}
          onHistory={onExerciseHistory && open && (hasHistory?.(open) ?? true) ? () => onExerciseHistory(open) : undefined}
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
