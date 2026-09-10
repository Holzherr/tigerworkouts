import { Check, ChevronLeft, ChevronRight, List, MoreHorizontal, Pause, Play, SkipForward, Square } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/shared/components/ui/button';
import { ClipThumb } from '@/shared/components/ui/clip-thumb';
import { Sheet } from '@/shared/components/ui/sheet';
import { Stepper } from '@/shared/components/ui/stepper';
import { cn, fmtClock, fmtNum } from '@/shared/utils/ui-utils';
import { forLabel, shortUnit, type Block, type ExerciseStep, type Item, type Runsheet } from '@/features/runsheet/model';
import { SwipeToRemove } from '@/features/runsheet/components/swipe-to-remove';
import * as R from '../runner';

export interface TimerScreenProps {
  runsheet: Runsheet;
  state: R.RunState;
  now: number;
  onDone: () => void;
  onSkip: () => void;
  onBack: () => void;
  onPause: () => void;
  onResume: () => void;
  onAdjust: (target: number) => void;
  onAdjustIncline?: (incline: number) => void;
  onSetReps: (reps: number) => void;
  onDrop: (stepId: string) => void;
  onStartBlock?: () => void;
  onFinish: () => void;
  onExit: () => void;
}

const MODE_LABEL: Record<string, string> = { loose: '', rounds: 'Round', fortime: 'For time · round', amrap: 'AMRAP · round', emom: 'EMOM · minute', ladder: 'Rung' };
const isTreadmill = (s: ExerciseStep) => s.exercise.unit === 'kph' || s.incline !== undefined;

const partItems = (r: Runsheet): Item[] => r.items.filter(i => i.kind !== 'ref');
const stepsOf = (it: Item): ExerciseStep[] => (it.kind === 'block' ? it.steps : [it]).filter((s): s is ExerciseStep => s.kind === 'exercise');
const partTitle = (it: Item) => (it.kind === 'block' ? it.name || 'Block' : it.kind === 'exercise' ? it.exercise.name : 'Rest');
const stepLine = (s: ExerciseStep) => [forLabel(s), s.target !== undefined ? `${fmtNum(s.target)} ${shortUnit(s.exercise.unit ?? '')}`.trim() : '', s.incline !== undefined ? `incline ${s.incline}` : ''].filter(Boolean).join(' · ');

/**
 * The gym screen. Header: block name, "Block 2 of 7 · Round 3 of 8", a progress bar whose
 * background is the whole session and whose bright fill is the current step, elapsed top right.
 * Work steps sit on ink, rest steps on navy so the colour alone says which is which. Entering a
 * new block parks the timer on a "Start block" card (equipment changes take time). Bottom bar:
 * a ⋯ menu (previous, overview, stop), Pause and Skip/Done at equal size. Tap the Next row to see
 * what the coming block asks for; the overview sheet lists every part with progress.
 */
export const TimerScreen = ({ runsheet, state, now, onDone, onSkip, onBack, onPause, onResume, onAdjust, onAdjustIncline, onSetReps, onDrop, onStartBlock, onFinish, onExit }: TimerScreenProps) => {
  const [confirmExit, setConfirmExit] = useState(false);
  const [menu, setMenu] = useState(false);
  const [overview, setOverview] = useState(false);
  const [peek, setPeek] = useState<number | null>(null);
  const slot = R.current(state);
  const nxt = R.next(state);
  const clock = R.clock(state, now);
  const total = R.elapsed(state, now);
  const paused = state.phase === 'paused';
  const ready = state.phase === 'ready';
  const lead = state.phase === 'lead' || (paused && state.i === 0 && Object.keys(state.blockStart).length === 0);
  const done = state.phase === 'done';
  const bElapsed = R.blockElapsed(state, now);
  const stepOf = slot?.step;
  const idx = state.i;
  const target = slot ? R.effectiveTarget(state, idx) : undefined;
  const incline = slot ? R.effectiveIncline(state, idx) : undefined;
  const reps = slot && stepOf?.kind === 'exercise' ? (state.actuals[slot.id]?.reps ?? (stepOf.forMode === 'reps' || stepOf.forMode === 'amrap' ? stepOf.forValue : 0)) : 0;
  const isRest = slot?.kind === 'rest';
  const timed = clock.left !== undefined;
  const bigNumber = done ? fmtClock(total) : lead ? String(Math.ceil(clock.left ?? 0)) : timed ? fmtClock(clock.left ?? 0) : fmtClock(clock.spent);
  const progress = slot?.seconds && clock.left !== undefined ? 1 - clock.left / slot.seconds : 0;
  const all = R.overall(state, now);
  const capLeft = slot?.capSec ? Math.max(0, slot.capSec - bElapsed) : undefined;
  const items = partItems(runsheet);
  const nextIsNewPart = !!nxt && !!slot && nxt.part !== slot.part;
  const partOf = (p: number) => items[p];

  const partLabel = slot ? `${slot.parts > 1 ? `Block ${slot.part + 1} of ${slot.parts}` : ''}${slot.mode !== 'loose' ? `${slot.parts > 1 ? ' · ' : ''}${MODE_LABEL[slot.mode]} ${slot.round + 1}${slot.mode === 'amrap' ? '' : ` of ${slot.rounds}`}` : ''}` : runsheet.title;

  return (
    <div className={cn('flex h-full min-h-0 flex-col text-white transition-colors duration-300', isRest && !ready ? 'bg-rest' : 'bg-ink')}>
      <header className="safe-top shrink-0 px-4 pt-2 pb-2">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate text-[15px] font-bold">{slot?.blockName ?? (stepOf?.kind === 'exercise' ? stepOf.exercise.name : runsheet.title)}</div>
            <div className="text-[16px] font-bold text-white/85">
              {partLabel}
              {slot?.rung ? ` · ${slot.rung} reps` : ''}
              {capLeft !== undefined ? ` · ${fmtClock(capLeft)} left` : slot?.mode === 'fortime' ? ` · ${fmtClock(bElapsed)}` : ''}
            </div>
          </div>
          <button type="button" onClick={() => setOverview(true)} className="shrink-0 text-right" aria-label="Workout overview">
            <div className="text-[15px] font-bold tabular-nums">{Math.round(all * 100)}%</div>
            <div className="text-[12px] tabular-nums text-white/60">{fmtClock(total)}</div>
          </button>
        </div>
        <button type="button" onClick={() => setOverview(true)} className="relative mt-2 block h-2 w-full overflow-hidden rounded-full bg-white/15" aria-label="Workout overview">
          <div className="absolute inset-y-0 left-0 bg-white/35 transition-[width] duration-300" style={{ width: `${Math.round(all * 100)}%` }} />
          <div className="absolute inset-y-0 left-0 bg-brand transition-[width] duration-200" style={{ width: `${Math.round(progress * 100)}%` }} />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4">
        {ready && slot ? (
          <div className="py-4">
            <div className="text-[11px] font-bold tracking-widest text-brand uppercase">Next block · {slot.parts > 1 ? `${slot.part + 1} of ${slot.parts}` : ''}</div>
            <div className="mt-1 text-[28px] leading-tight font-black">{partTitle(partOf(slot.part))}</div>
            <div className="mt-1 text-[13px] text-white/60">{slot.mode !== 'loose' ? `${slot.rounds} ${slot.mode === 'amrap' ? 'AMRAP' : 'rounds'}` : forLabel(stepOf as ExerciseStep)}</div>
            <div className="mt-3 space-y-1.5">
              {stepsOf(partOf(slot.part)).map(s => (
                <div key={s.id} className="flex items-center gap-2.5 rounded-card bg-white/10 px-3 py-2">
                  <ClipThumb size="sm" clip={s.exercise.clip} poster={s.exercise.poster} icon={s.exercise.icon} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[14px] font-semibold">{s.exercise.name}</div>
                    <div className="text-[12px] text-white/60">{stepLine(s)}</div>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 text-center text-[13px] text-white/60">Set up, then start. The clock waits.</div>
          </div>
        ) : (
          <>
            <div className={cn('py-4 text-center font-black tabular-nums tracking-tight', lead ? 'text-[96px] leading-none text-brand' : 'text-[72px] leading-none')}>{bigNumber}</div>
            {lead && <div className="-mt-2 pb-3 text-center text-[13px] text-white/60">Get ready</div>}
            {!timed && !lead && !done && slot && <div className="-mt-2 pb-3 text-center text-[13px] text-white/60">{isRest ? 'Rest' : 'Tap Done when finished'}</div>}

            {slot && !done && (
              <SwipeToRemove onRemove={() => onDrop(slot.step.id)} disabled={isRest || paused} className="rounded-card">
                <div className={cn('rounded-card p-3', isRest ? 'bg-white/10' : 'bg-white text-ink')}>
                  <div className="flex items-center gap-3">
                    {stepOf?.kind === 'exercise' ? <ClipThumb size="lg" clip={stepOf.exercise.clip} poster={stepOf.exercise.poster} icon={stepOf.exercise.icon} /> : <ClipThumb size="lg" variant="rest" className="bg-white/20 text-white" />}
                    <div className="min-w-0 flex-1">
                      <div className="text-[18px] leading-tight font-extrabold">{stepOf?.kind === 'exercise' ? stepOf.exercise.name : 'Rest'}</div>
                      <div className={cn('text-[13px]', isRest ? 'text-white/70' : 'text-muted')}>
                        {stepOf?.kind === 'exercise' ? forLabel(stepOf) : `${slot.seconds ?? 0}s`}
                        {stepOf?.kind === 'exercise' && stepOf.exercise.cue ? ` · ${stepOf.exercise.cue}` : ''}
                      </div>
                    </div>
                  </div>
                  {stepOf?.kind === 'exercise' && (
                    <div className="mt-3 space-y-2">
                      {stepOf.exercise.unit && stepOf.exercise.unit !== 'reps' && (
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-[14px]">
                            {stepOf.exercise.unit === 'kph' ? 'Speed' : 'Weight'} <span className="text-muted">({shortUnit(stepOf.exercise.unit)})</span>
                          </span>
                          <Stepper aria-label="Target" value={target ?? 0} step={stepOf.exercise.step} onChange={onAdjust} />
                        </div>
                      )}
                      {isTreadmill(stepOf) && onAdjustIncline && (
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-[14px]">Incline</span>
                          <Stepper aria-label="Incline" value={incline ?? 0} step={1} min={0} max={30} onChange={onAdjustIncline} />
                        </div>
                      )}
                      {(stepOf.forMode === 'reps' || stepOf.forMode === 'amrap' || stepOf.forMode === 'max') && (
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-[14px]">Reps done</span>
                          <Stepper aria-label="Reps" value={reps} min={0} max={500} onChange={onSetReps} />
                        </div>
                      )}
                      {state.actuals[slot.id]?.changes.length ? <div className="text-[11px] text-muted">Changed: {state.actuals[slot.id].changes.map(c => `${fmtNum(c.target)} at ${c.atSec}s`).join(', ')}</div> : null}
                    </div>
                  )}
                </div>
              </SwipeToRemove>
            )}

            {nxt && !done && (
              <button type="button" onClick={() => setPeek(nxt.part)} className={cn('mt-3 flex w-full items-center gap-2.5 rounded-card px-3 py-2 text-left', nextIsNewPart ? 'border border-brand/60 bg-brand/15' : 'bg-white/5')}>
                {nxt.step.kind === 'exercise' ? <ClipThumb size="sm" clip={nxt.step.exercise.clip} poster={nxt.step.exercise.poster} icon={nxt.step.exercise.icon} /> : <ClipThumb size="sm" variant="rest" className="bg-white/20 text-white" />}
                <div className="min-w-0 flex-1">
                  <div className={cn('text-[11px] font-bold tracking-widest uppercase', nextIsNewPart ? 'text-brand' : 'text-white/50')}>{nextIsNewPart ? `Next block · ${partTitle(partOf(nxt.part))}` : 'Next'}</div>
                  <div className="truncate text-[14px] font-semibold">{nxt.step.kind === 'exercise' ? nxt.step.exercise.name : 'Rest'}</div>
                </div>
                <span className="text-[12px] text-white/60">{nxt.step.kind === 'exercise' ? forLabel(nxt.step) : `${nxt.seconds}s`}</span>
                <ChevronRight className="size-4 text-white/40" />
              </button>
            )}
            {done && (
              <div className="rounded-card bg-white/10 p-4 text-center">
                <div className="text-[18px] font-extrabold">Done</div>
                <div className="mt-1 text-[13px] text-white/70">{fmtClock(total)} · log the result to keep it</div>
              </div>
            )}
            {!isRest && !done && !lead && <div className="pt-2 text-center text-[11px] text-white/40">Swipe the card left to drop this exercise for tonight</div>}
          </>
        )}
      </div>

      <div className="safe-bottom shrink-0 px-4 pt-2 pb-3">
        {done ? (
          <Button block variant="brand" onClick={onFinish}>
            <Check /> Log result
          </Button>
        ) : ready ? (
          <div className="flex gap-2">
            <Button variant="dark" size="icon" onClick={() => setMenu(true)} aria-label="More" className="shrink-0 bg-white/10">
              <MoreHorizontal />
            </Button>
            <Button block variant="brand" onClick={onStartBlock}>
              <Play /> Start block
            </Button>
          </div>
        ) : (
          <div className="flex gap-2">
            <Button variant="dark" size="icon" onClick={() => setMenu(true)} aria-label="More" className="shrink-0 bg-white/10">
              <MoreHorizontal />
            </Button>
            <Button block variant="dark" onClick={paused ? onResume : onPause} className={cn('bg-white/10', paused && 'bg-white text-ink')}>
              {paused ? <Play /> : <Pause />} {paused ? 'Resume' : 'Pause'}
            </Button>
            {timed || lead ? (
              <Button block variant="ghost" onClick={onSkip} className="border-white/20 bg-white/10 text-white">
                <SkipForward /> Skip{isRest ? ' rest' : ''}
              </Button>
            ) : (
              <Button block variant="brand" onClick={onDone}>
                <Check /> Done
              </Button>
            )}
          </div>
        )}
        {paused && !done && <div className="pt-2 text-center text-[12px] text-white/60">Paused</div>}
      </div>

      <Sheet open={menu} onOpenChange={setMenu} title="Session">
        <div className="space-y-2">
          <Button block variant="ghost" onClick={() => (setMenu(false), onBack())}>
            <ChevronLeft /> Previous step
          </Button>
          {!timed && !lead && !ready && (
            <Button block variant="ghost" onClick={() => (setMenu(false), onSkip())}>
              <SkipForward /> Skip this step
            </Button>
          )}
          <Button block variant="ghost" onClick={() => (setMenu(false), setOverview(true))}>
            <List /> Workout overview
          </Button>
          <Button block variant="danger" onClick={() => (setMenu(false), setConfirmExit(true))}>
            <Square /> Stop workout
          </Button>
        </div>
      </Sheet>

      <Sheet open={overview} onOpenChange={setOverview} title={`${Math.round(all * 100)}% · ${fmtClock(total)}`} height="80dvh">
        <div className="space-y-1.5">
          {items.map((it, p) => {
            const status = slot && !done ? (p < slot.part ? 'done' : p === slot.part ? 'now' : 'todo') : done ? 'done' : 'todo';
            return (
              <div key={p} className={cn('rounded-card border px-3 py-2', status === 'now' ? 'border-brand bg-brand-soft' : status === 'done' ? 'border-line bg-canvas text-muted' : 'border-line bg-surface')}>
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-[14px] font-bold">
                      {p + 1}. {partTitle(it)}
                    </div>
                    <div className="text-[12px] text-muted">{it.kind === 'block' ? `${(it as Block).repeat} rounds · ${stepsOf(it).map(s => s.exercise.name).join(', ')}` : it.kind === 'exercise' ? stepLine(it) : ''}</div>
                  </div>
                  <span className={cn('shrink-0 text-[11px] font-bold tracking-widest uppercase', status === 'now' ? 'text-brand' : status === 'done' ? 'text-muted' : 'text-faint')}>{status === 'now' ? 'Now' : status === 'done' ? 'Done' : ''}</span>
                </div>
              </div>
            );
          })}
        </div>
      </Sheet>

      <Sheet open={peek !== null} onOpenChange={o => !o && setPeek(null)} title={peek !== null && partOf(peek) ? partTitle(partOf(peek)) : 'Next'}>
        {peek !== null && partOf(peek) && (
          <div className="space-y-1.5">
            {partOf(peek).kind === 'block' && <div className="text-[12px] text-muted">{(partOf(peek) as Block).repeat} rounds</div>}
            {stepsOf(partOf(peek)).map(s => (
              <div key={s.id} className="flex items-center gap-2.5 rounded-card border border-line bg-surface px-3 py-2">
                <ClipThumb size="sm" clip={s.exercise.clip} poster={s.exercise.poster} icon={s.exercise.icon} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[14px] font-semibold">{s.exercise.name}</div>
                  <div className="text-[12px] text-muted">{stepLine(s)}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Sheet>

      {confirmExit && (
        <div className="absolute inset-0 z-20 flex items-end bg-ink/70 p-4" onClick={() => setConfirmExit(false)}>
          <div className="w-full space-y-2 rounded-card bg-surface p-4 text-ink" onClick={e => e.stopPropagation()}>
            <div className="text-[16px] font-bold">Stop this session?</div>
            <p className="text-[13px] text-muted">{fmtClock(total)} so far. You can log what you did, or discard it.</p>
            <Button block onClick={onFinish}>
              Log what I did
            </Button>
            <Button block variant="danger" onClick={onExit}>
              Discard session
            </Button>
            <Button block variant="quiet" onClick={() => setConfirmExit(false)}>
              Keep going
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};
