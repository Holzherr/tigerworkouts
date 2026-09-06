import { Check, ChevronLeft, ChevronRight, Pause, Play, SkipForward, X } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/shared/components/ui/button';
import { Chip } from '@/shared/components/ui/chip';
import { ClipThumb } from '@/shared/components/ui/clip-thumb';
import { Stepper } from '@/shared/components/ui/stepper';
import { cn, fmtClock, fmtNum } from '@/shared/utils/ui-utils';
import { forLabel, shortUnit, type Runsheet } from '@/features/runsheet/model';
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
  onSetReps: (reps: number) => void;
  onDrop: (stepId: string) => void;
  onFinish: () => void;
  onExit: () => void;
}

const MODE_LABEL: Record<string, string> = { loose: '', rounds: 'Round', fortime: 'For time · round', amrap: 'AMRAP · round', emom: 'EMOM · minute', ladder: 'Rung' };

/**
 * The gym screen. Dark header with the block name, round counter and total elapsed; a big clock
 * (countdown for timed steps, count-up for reps-based ones); the current step as a card with a
 * 72px clip, name, target stepper (adjustments are logged with the time) or a reps stepper; a
 * "next" row; and a control bar: back, pause/resume, Done or Skip. Swipe the card left to drop
 * that exercise for the rest of the session. Rest slots show the coming step.
 */
export const TimerScreen = ({ runsheet, state, now, onDone, onSkip, onBack, onPause, onResume, onAdjust, onSetReps, onDrop, onFinish, onExit }: TimerScreenProps) => {
  const [confirmExit, setConfirmExit] = useState(false);
  const slot = R.current(state);
  const nxt = R.next(state);
  const clock = R.clock(state, now);
  const total = R.elapsed(state, now);
  const paused = state.phase === 'paused';
  const lead = state.phase === 'lead' || (paused && state.i === 0 && Object.keys(state.blockStart).length === 0);
  const done = state.phase === 'done';
  const bElapsed = R.blockElapsed(state, now);
  const stepOf = slot?.step;
  const target = slot ? R.targetOf(state, slot) : undefined;
  const reps = slot && stepOf?.kind === 'exercise' ? (state.actuals[slot.id]?.reps ?? (stepOf.forMode === 'reps' || stepOf.forMode === 'amrap' ? stepOf.forValue : 0)) : 0;
  const isRest = slot?.kind === 'rest';
  const timed = clock.left !== undefined;
  const bigNumber = done ? fmtClock(total) : lead ? String(Math.ceil(clock.left ?? 0)) : timed ? fmtClock(clock.left ?? 0) : fmtClock(clock.spent);
  const progress = slot?.seconds && clock.left !== undefined ? 1 - clock.left / slot.seconds : 0;
  const capLeft = slot?.capSec ? Math.max(0, slot.capSec - bElapsed) : undefined;

  return (
    <div className="flex h-full min-h-0 flex-col bg-ink text-white">
      <header className="safe-top shrink-0 px-4 pt-2 pb-2">
        <div className="flex items-center justify-between">
          <button type="button" onClick={() => setConfirmExit(true)} className="flex items-center gap-1 text-[13px] text-white/70">
            <X className="size-4" /> Exit
          </button>
          <div className="text-[13px] tabular-nums text-white/70">{fmtClock(total)} total</div>
        </div>
        <div className="mt-2 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate text-[15px] font-bold">{slot?.blockName ?? runsheet.title}</div>
            <div className="text-[12px] text-white/60">
              {slot && slot.mode !== 'loose' ? `${MODE_LABEL[slot.mode]} ${slot.round + 1}${slot.mode === 'amrap' ? '' : ` of ${slot.rounds}`}` : runsheet.title}
              {slot?.rung ? ` · ${slot.rung} reps` : ''}
              {capLeft !== undefined ? ` · ${fmtClock(capLeft)} left` : slot?.mode === 'fortime' ? ` · ${fmtClock(bElapsed)}` : ''}
            </div>
          </div>
          <Chip variant="brand-solid" size="sm" className="shrink-0">
            {state.i + 1} / {state.slots.length}
          </Chip>
        </div>
        <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-white/15">
          <div className="h-full bg-brand transition-[width] duration-200" style={{ width: `${Math.round(progress * 100)}%` }} />
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4">
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
          <div className="mt-3 flex items-center gap-2.5 rounded-card bg-white/5 px-3 py-2">
            {nxt.step.kind === 'exercise' ? <ClipThumb size="sm" clip={nxt.step.exercise.clip} poster={nxt.step.exercise.poster} icon={nxt.step.exercise.icon} /> : <ClipThumb size="sm" variant="rest" className="bg-white/20 text-white" />}
            <div className="min-w-0 flex-1">
              <div className="text-[11px] font-bold tracking-widest text-white/50 uppercase">Next</div>
              <div className="truncate text-[14px] font-semibold">{nxt.step.kind === 'exercise' ? nxt.step.exercise.name : 'Rest'}</div>
            </div>
            <span className="text-[12px] text-white/60">{nxt.step.kind === 'exercise' ? forLabel(nxt.step) : `${nxt.seconds}s`}</span>
          </div>
        )}
        {done && (
          <div className="rounded-card bg-white/10 p-4 text-center">
            <div className="text-[18px] font-extrabold">Done</div>
            <div className="mt-1 text-[13px] text-white/70">{fmtClock(total)} · log the result to keep it</div>
          </div>
        )}
        {!isRest && !done && !lead && <div className="pt-2 text-center text-[11px] text-white/40">Swipe the card left to drop this exercise for tonight</div>}
      </div>

      <div className="safe-bottom shrink-0 px-4 pt-2 pb-3">
        {done ? (
          <Button block variant="brand" onClick={onFinish}>
            <Check /> Log result
          </Button>
        ) : (
          <div className="flex gap-2">
            <Button variant="dark" size="icon" onClick={onBack} aria-label="Previous" className="bg-white/10">
              <ChevronLeft />
            </Button>
            <Button variant="dark" size="icon" onClick={paused ? onResume : onPause} aria-label={paused ? 'Resume' : 'Pause'} className="bg-white/10">
              {paused ? <Play /> : <Pause />}
            </Button>
            {timed || lead ? (
              <Button block variant="ghost" onClick={onSkip} className="border-white/20 bg-white/10 text-white">
                <SkipForward /> Skip {isRest ? 'rest' : ''}
              </Button>
            ) : (
              <Button block variant="brand" onClick={onDone}>
                <Check /> Done
              </Button>
            )}
            {!timed && !lead && (
              <Button variant="dark" size="icon" onClick={onSkip} aria-label="Skip" className="bg-white/10">
                <ChevronRight />
              </Button>
            )}
          </div>
        )}
        {paused && !done && <div className="pt-2 text-center text-[12px] text-white/60">Paused</div>}
      </div>

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
