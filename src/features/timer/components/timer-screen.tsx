import * as Dialog from '@radix-ui/react-dialog';
import { Check, ChevronLeft, ChevronRight, ChevronsRight, List, Medal, Plus, MoreHorizontal, Pause, Play, Shuffle, SkipForward, Square, Trash2, Volume2, VolumeX, X } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { Button } from '@/shared/components/ui/button';
import { ClipThumb } from '@/shared/components/ui/clip-thumb';
import { Sheet } from '@/shared/components/ui/sheet';
import { Stepper } from '@/shared/components/ui/stepper';
import { cn, fmtClock, fmtNum } from '@/shared/utils/ui-utils';
import { loadStepper, metersStep } from '@/shared/utils/step-sizes';
import { countLabel, extraLogs, forLabel, hasLoad, roundsLabel, nextSetType, setMarks, shortUnit, showsLoad, straightSetStep, type Block, type ExerciseRef, type ExerciseStep, type Item, type Runsheet, type SetType, type StepLog } from '@/features/runsheet/model';
import { fmtInUnit, loadText, unitText } from '@/shared/utils/units';
import { kitOf, type Equipment } from '@/features/runsheet/plates';
import { PlatesButton } from '@/features/runsheet/components/plate-sheet';
import { SetMark } from '@/features/runsheet/components/set-grid';
import { lastSetLabel, lastTimeLabel } from '@/features/runsheet/last-used';
import type { SetResult } from '@/features/runsheet/progression';
import { SwipeToRemove } from '@/features/runsheet/components/swipe-to-remove';
import { ExerciseSheet } from '@/features/runsheet/components/exercise-sheet';
import * as R from '../runner';
import { Target } from 'lucide-react';
import { useContext } from 'react';
import { TimerExtrasContext } from '../timer-extras';
import { raceLine } from '../pace';
import type { Alternative } from '@/features/exercises/alternatives';

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
  /** Metres or calories done on a distance or calorie step, when not the plan's. */
  onSetAmount?: (value: number, field?: R.Amount) => void;
  onDrop: (stepId: string) => void;
  onStartBlock?: () => void;
  /** Change a step from the overview, before it comes round. Applies to the rest of the session. */
  onAdjustStep?: (stepId: string, patch: { target?: number; incline?: number }) => void;
  /** The set grid a straight-set block runs as. Without it those blocks show the card like any other. */
  sets?: SetActions;
  /** −15 s / +15 s on the rest counting down. */
  onAdjustRest?: (deltaSec: number) => void;
  /** What this exercise was done at last time; the hint on the card copies it into the set. */
  lastFor?: (step: ExerciseStep) => SetResult | undefined;
  onFill?: (slotId: string, set: SetResult) => void;
  /** "Round 4 — 12 s ahead" against the last session of this workout. */
  ghost?: string;
  /** Today's target where the timer is: "Target 24 × 10", "Target 8+ · 1:15 a round". */
  goal?: string;
  /** Tones off. With `onToggleMute`, a speaker button in the header switches them. */
  muted?: boolean;
  onToggleMute?: () => void;
  /** Settings → My equipment, for the plate calculator beside a barbell load. */
  equipment?: Equipment;
  onFinish: () => void;
  onExit: () => void;
  /** What else trains the same movement, for Swap exercise; its load converted to the new kit. */
  alternativesFor?: (step: ExerciseStep, target?: number) => Alternative[];
  /** Swap a step's exercise from here to the end of the session (the machine is taken). */
  onSwap?: (stepId: string, to: ExerciseRef, target?: number) => void;
  /** Slots whose set beat a record when it was ticked: a medal on the row. */
  prs?: string[];
  /** The live region a screen reader hears. Off only for a demo that loops: on a page of copy it would read the whole workout aloud. */
  announce?: boolean;
  /** End the running block here and go on to the next one, from the ⋯ menu. */
  onEndBlock?: () => void;
  /** "Round n done": an AMRAP's or EMOM's round of plain rep work is one card and one tap. Without it those rounds run a step at a time. */
  onRoundDone?: () => void;
  /** Reps into the round an AMRAP's cap cut short, asked once at the gate after it. */
  onExtraReps?: (blockId: string, reps: number) => void;
}

export interface SetActions {
  adjust: (slotId: string, target: number) => void;
  setReps: (slotId: string, reps: number) => void;
  /** Metres or calories for a set that records them; `field` picks which. */
  setAmount?: (slotId: string, value: number, field?: R.Amount) => void;
  /** The tick: Done on the running set, a late log on one passed without a tick. */
  complete: (slotId: string) => void;
  /** Un-tick a done set so its weight can be put right. */
  reopen: (slotId: string) => void;
  hintFor?: (step: ExerciseStep, round: number) => string | undefined;
  /** Last time's set for a row. With `fill`, the row's hint is a button that copies it in. */
  lastFor?: (step: ExerciseStep, round: number) => SetResult | undefined;
  fill?: (slotId: string, set: SetResult) => void;
  /** A tap on the set number: warm-up, normal, drop set, to failure. */
  setType?: (slotId: string, type: SetType) => void;
  /** "+ Add set": one more set of the block, a copy of its last set. */
  add?: (blockId: string) => void;
}

/**
 * A straight-set block on the timer: a done set is one line ("✓ Set 1   45 kg × 10", the tick
 * un-ticks it), and every set still to do is a row of its own with its steppers and last time's set
 * of the same number, changeable before and during it (Priyanka, 14 Nov 2026: the sets after the
 * next one were folded into "2 more sets"). "+ Add set" under the last copies it. No column header:
 * the units sit under the steppers. The rest between sets counts down above the grid. Port of
 * `setGrid` in TimerView.swift.
 */
const TimerSetGrid = ({ state, step, blockId, actions, equipment, prs = [], onHowTo }: { state: R.RunState; step: ExerciseStep; blockId: string; actions: SetActions; equipment?: Equipment; prs?: string[]; onHowTo?: () => void }) => {
  const rows = state.slots.map((sl, idx) => ({ sl, idx })).filter(x => x.sl.blockId === blockId && x.sl.kind === 'work');
  const on = rows.find(x => x.idx >= state.i)?.sl.id;
  // A load given as a % of a training max or × bodyweight shows once it is resolved into target.
  const loadCol = showsLoad(step);
  const barbell = loadCol && kitOf(step.exercise) === 'barbell';
  const types = rows.map(x => R.typeAt(state, x.idx));
  const marks = setMarks(types);
  const count = countLabel(step.forMode);
  const unit = unitText(shortUnit(step.exercise.unit));
  const lt = (n: number) => loadText(n, step.exercise.unit);
  // A distance or calorie set counts its metres or calories; a timed one shows the time it ran once done.
  const amount = step.forMode === 'meters' || step.forMode === 'calories';
  const clocked = step.forMode === 'seconds' || step.forMode === 'minutes';
  // What the step is set to log beyond its count, each in a column of its own: reps in a timed set,
  // metres and calories on a timed row.
  const logged = extraLogs(step).filter(l => l === 'reps' || actions.setAmount);
  const loggedUnit = (l: StepLog) => (l === 'meters' ? 'm' : l === 'calories' ? 'cal' : 'reps');
  const live = state.phase === 'running' || state.phase === 'paused';
  const view = rows.map(({ sl, idx }, n) => {
    const a = state.actuals[sl.id];
    const done = a?.doneAt !== undefined;
    const load = R.effectiveTarget(state, idx);
    const plan = sl.step.kind === 'exercise' ? sl.step.forValue : 0;
    // A timed set's count is its time: what it ran once done, the plan before (reps it logs go in their own column).
    const reps = amount ? (R.amountAt(state, sl) ?? 0) : clocked ? (done && a?.seconds !== undefined ? (step.forMode === 'minutes' ? a.seconds / 60 : a.seconds) : plan) : (a?.reps ?? plan);
    const n10 = fmtNum(Math.round(reps * 10) / 10);
    const extra = logged.map(l => (l === 'reps' ? a?.reps : R.amountAt(state, sl, l)));
    const base = loadCol && count ? `${load !== undefined ? lt(load) : '—'} ${unit} × ${n10}`.replace(/ {2}/, ' ') : loadCol ? `${load !== undefined ? lt(load) : '—'} ${unit}`.trim() : count ? `${n10} ${count.toLowerCase()}` : '';
    const what = [base, ...logged.flatMap((l, k) => (extra[k] !== undefined ? [`${fmtNum(extra[k]!)} ${loggedUnit(l)}`] : []))].filter(Boolean).join(' · ');
    const canTick = done || idx < state.i || (live && (idx === state.i || (sl.id === on && state.slots.slice(state.i, idx).every(x => x.kind === 'rest'))));
    return { sl, idx, n, done, load, reps, extra, what, canTick, edit: !done, name: /^\d+$/.test(marks[n]) ? `Set ${marks[n]}` : `Set ${n + 1} (${marks[n]})` };
  });
  const tick = (v: (typeof view)[number]) => (
    <button
      type="button"
      aria-label={v.done ? `Un-tick set ${v.n + 1}` : `Tick set ${v.n + 1}`}
      aria-pressed={v.done}
      disabled={!v.canTick}
      onClick={e => {
        e.stopPropagation();
        if (v.done) actions.reopen(v.sl.id);
        else actions.complete(v.sl.id);
      }}
      className="grid size-11 shrink-0 place-items-center disabled:opacity-70"
    >
      <span className={cn('grid size-7 place-items-center rounded-full border-2', v.done ? 'border-brand bg-brand text-white' : 'border-body text-body')}>
        <Check className="size-4" strokeWidth={3} />
      </span>
    </button>
  );
  return (
    <div className="rounded-card bg-surface px-3 py-1.5 text-ink max-[359px]:px-2" aria-label="Sets">
      <button type="button" onClick={onHowTo} disabled={!onHowTo} aria-label={`How to do ${step.exercise.name}`} className="flex w-full items-center gap-3 border-b border-line-soft py-2 text-left">
        <ClipThumb size="md" clip={step.exercise.clip} poster={step.exercise.poster} icon={step.exercise.icon} />
        <span className="min-w-0 flex-1 text-[20px] leading-tight font-extrabold">{step.exercise.name}</span>
      </button>
      {view.map(v => {
        if (!v.edit) {
          return (
            <div key={v.sl.id} className="flex min-h-12 items-center gap-1 border-b border-line-soft last:border-0">
              {tick(v)}
              <span className="flex-1 text-[15px] text-body">{v.name}</span>
              {v.done && prs.includes(v.sl.id) && (
                <span className="grid size-7 shrink-0 place-items-center rounded-full bg-brand text-white" aria-label="Personal record" title="Personal record">
                  <Medal className="size-4" />
                </span>
              )}
              <span className="pr-1 text-[16px] font-semibold text-body tabular-nums">{v.what}</span>
            </div>
          );
        }
        // Last time's set of the same number, only when it was the same kind of set: a warm-up is not
        // shown last week's working weight.
        const prior = actions.lastFor?.(step, v.n);
        const last = prior && (prior.type ?? 'normal') === types[v.n] ? prior : undefined;
        const hint = last ? lastSetLabel(last, step.exercise.unit)?.replace(/^last /, 'last time ') : actions.hintFor?.(step, v.n);
        const copy = last && actions.fill ? { ...(loadCol && last.load !== undefined ? { load: last.load } : {}), ...((count || logged.includes('reps')) && last.reps !== undefined ? { reps: last.reps } : {}), ...(logged.includes('meters') && last.meters !== undefined ? { meters: last.meters } : {}), ...(logged.includes('calories') && last.calories !== undefined ? { calories: last.calories } : {}) } : undefined;
        const when = v.sl.id === on ? (v.idx === state.i && live ? 'now' : 'next') : undefined;
        return (
          <div key={v.sl.id} className="border-b border-line-soft py-2 last:border-0">
            <div className="flex min-h-8 items-center gap-1">
              <span className="text-[15px] font-bold text-brand-ink">Set</span>
              <SetMark mark={marks[v.n]} type={types[v.n]} label={`Set ${v.n + 1}`} onCycle={actions.setType ? () => actions.setType!(v.sl.id, nextSetType(types[v.n])) : undefined} className={cn('text-[15px]', types[v.n] === 'normal' && 'min-w-0 px-0 text-brand-ink')} />
              <span className="text-[15px] font-bold text-brand-ink">{when ? `· ${when}` : ''}</span>
              {barbell && <PlatesButton load={v.load} equipment={equipment} />}
              <span className="flex-1" />
              {hint && copy && Object.keys(copy).length ? (
                <button type="button" aria-label={`Use last time for set ${v.n + 1}`} onClick={() => actions.fill!(v.sl.id, copy)} className="min-h-8 text-[13px] text-muted underline decoration-dotted underline-offset-2">
                  {hint}
                </button>
              ) : (
                hint && <span className="text-[13px] text-muted">{hint}</span>
              )}
            </div>
            <div className="mt-1 flex items-center gap-2 max-[359px]:gap-1">
              {loadCol && (
                <div className="flex min-w-0 flex-1 flex-col items-center">
                  <Stepper size="sm" fluid aria-label={`Set ${v.n + 1} load`} {...loadStepper(step.exercise, v.load ?? 0, t => actions.adjust(v.sl.id, t))} />
                  <span className="text-[11px] text-muted">{unit}</span>
                </div>
              )}
              {count && (
                <div className="flex min-w-0 flex-1 flex-col items-center">
                  {!clocked && (!amount || actions.setAmount) ? (
                    <Stepper size="sm" fluid aria-label={`Set ${v.n + 1} ${count.toLowerCase()}`} value={v.reps} min={0} max={amount ? 99999 : 999} step={step.forMode === 'meters' ? metersStep(step.exercise, 10) : 1} onChange={x => (amount ? actions.setAmount!(v.sl.id, x) : actions.setReps(v.sl.id, x))} />
                  ) : (
                    <span className="flex h-11 items-center text-[18px] font-bold tabular-nums">{fmtNum(Math.round(v.reps * 10) / 10)}</span>
                  )}
                  <span className="text-[11px] text-muted">{count.toLowerCase()}</span>
                </div>
              )}
              {logged.map((l, k) => (
                <div key={l} className="flex min-w-0 flex-1 flex-col items-center">
                  <Stepper size="sm" fluid aria-label={`Set ${v.n + 1} ${l === 'reps' ? 'reps' : l === 'meters' ? 'metres' : 'calories'} done`} value={v.extra[k] ?? 0} min={0} max={l === 'reps' ? 999 : 99999} step={l === 'meters' ? metersStep(step.exercise, Math.max(10, step.exercise.step)) : 1} onChange={x => (l === 'reps' ? actions.setReps(v.sl.id, x) : actions.setAmount!(v.sl.id, x, l))} />
                  <span className="text-[11px] text-muted">{loggedUnit(l)} done</span>
                </div>
              ))}
              {tick(v)}
            </div>
          </div>
        );
      })}
      {actions.add && R.canAddSet(state, blockId) && (
        <button type="button" onClick={() => actions.add!(blockId)} title="Copies the last set's weight and reps" className="flex min-h-11 w-full items-center justify-center gap-1.5 text-[15px] font-semibold text-brand-ink">
          <Plus className="size-4" /> Add set
        </button>
      )}
    </div>
  );
};

/** A second tap on Skip this soon after the lead-in was skipped is ignored. */
export const DOUBLE_TAP_MS = 600;

const MODE_LABEL: Record<string, string> = { loose: '', rounds: 'Round', fortime: 'For time · round', amrap: 'AMRAP · round', emom: 'EMOM · minute', ladder: 'Rung' };
/** An EMOM every 60 s counts minutes; any other interval counts intervals. */
const modeLabelOf = (sl: R.Slot) => (sl.mode === 'emom' && sl.everySec !== undefined && sl.everySec !== 60 ? 'EMOM · interval' : MODE_LABEL[sl.mode]);
const isTreadmill = (s: ExerciseStep) => s.exercise.unit === 'kph' || s.incline !== undefined;

const partItems = (r: Runsheet): Item[] => r.items.filter(i => i.kind !== 'ref');
const stepsOf = (it: Item): ExerciseStep[] => (it.kind === 'block' ? it.steps : [it]).filter((s): s is ExerciseStep => s.kind === 'exercise');
const partTitle = (it: Item) => (it.kind === 'block' ? it.name || 'Block' : it.kind === 'exercise' ? it.exercise.name : 'Rest');
const stepLine = (s: ExerciseStep) => [forLabel(s), s.target !== undefined ? fmtInUnit(s.target, s.exercise.unit ?? '') : '', s.incline !== undefined ? `incline ${s.incline}` : ''].filter(Boolean).join(' · ');

/**
 * The gym screen. Header: block name, "Block 2 of 7 · Round 3 of 8", a progress bar whose
 * background is the whole session and whose bright fill is the current step, elapsed top right.
 * Work steps sit on ink, rest steps on navy so the colour alone says which is which. Entering a
 * new block parks the timer on a "Start block" card (equipment changes take time). ⋯ top right
 * (swap, overview, end workout); Back, Pause or Done early, and Skip small; the big button Pause on
 * a countdown, "Set 2 of 4 done" on a set. Tap Next for the coming block; the overview lists all.
 */
export const TimerScreen = ({ runsheet, state, now, onDone, onSkip, onBack, onPause, onResume, onAdjust, onAdjustIncline, onSetReps, onSetAmount, onDrop, onStartBlock, onAdjustStep, sets, onAdjustRest, lastFor, onFill, ghost, goal, muted, onToggleMute, equipment, onFinish, onExit, alternativesFor, onSwap, prs, onEndBlock, onRoundDone, onExtraReps, announce = true }: TimerScreenProps) => {
  const [confirmExit, setConfirmExit] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [menu, setMenu] = useState(false);
  const { onSuggestions } = useContext(TimerExtrasContext);
  const [overview, setOverview] = useState(false);
  const [peek, setPeek] = useState<number | null>(null);
  const [look, setLook] = useState<ExerciseStep | null>(null);
  const [swapping, setSwapping] = useState(false);
  /** The slot whose steppers are open; any other slot shows them folded. */
  const [changing, setChanging] = useState<string | null>(null);
  const leadSkippedAt = useRef(0);
  const slot = R.current(state);
  const nxt = R.next(state);
  const clock = R.clock(state, now);
  const total = R.elapsed(state, now);
  const paused = state.phase === 'paused';
  const ready = state.phase === 'ready';
  const lead = state.phase === 'lead' || (paused && (state.pausedFrom ? state.pausedFrom === 'lead' : state.i === 0 && Object.keys(state.blockStart).length === 0));
  const done = state.phase === 'done';
  // The lead-in's Skip and the first step's Skip are the same button: a second tap landing just
  // after the lead-in went is the same press, not a skip of set 1.
  const skip = () => {
    if (lead) leadSkippedAt.current = Date.now();
    else if (Date.now() - leadSkippedAt.current < DOUBLE_TAP_MS) return;
    onSkip();
  };
  const bElapsed = R.blockElapsed(state, now);
  const stepOf = slot?.step;
  const idx = state.i;
  const target = slot ? R.effectiveTarget(state, idx) : undefined;
  const incline = slot ? R.effectiveIncline(state, idx) : undefined;
  const reps = slot && stepOf?.kind === 'exercise' ? (state.actuals[slot.id]?.reps ?? (stepOf.forMode === 'reps' || stepOf.forMode === 'amrap' ? stepOf.forValue : 0)) : 0;
  const isRest = slot?.kind === 'rest';
  const timed = clock.left !== undefined;
  // Timed work ends with Done early, which logs the time it ran; a rest or the lead-in is skipped.
  const timedWork = timed && !isRest && !lead && slot?.kind === 'work' && R.timesWork(slot);
  // EMOM reps: the big clock is the minute running out, and Done logs the set as for any reps.
  const emomWork = !lead && R.minuteOnly(slot);
  // A countdown ends by itself: its big button is Pause. A set's says which set it logs.
  const countdown = (timed && !emomWork) || lead;
  // A round of plain rep work (Cindy) is one card with one button: see `R.roundSlots`.
  const round = onRoundDone && slot && !ready && !done ? R.roundSlots(state) : undefined;
  const cut = onExtraReps ? R.cappedRound(state) : undefined;
  const setDone = slot?.kind !== 'work' ? 'Done' : round ? `Round ${slot.round + 1} done` : slot.mode === 'amrap' ? `Set ${slot.round + 1} done` : slot.rounds > 1 ? `Set ${slot.round + 1} of ${slot.rounds} done` : 'Done';
  // The metres and/or calories the step records: what it is done for, then what it is set to log.
  const amountFields = slot && onSetAmount ? R.amountFields(slot) : [];
  const amountOf = (f: R.Amount) => (slot ? R.amountAt(state, slot, f) : undefined);
  const bigNumber = done ? fmtClock(total) : lead ? String(Math.ceil(clock.left ?? 0)) : timed ? fmtClock(clock.left ?? 0) : fmtClock(clock.spent);
  const progress = slot?.seconds && clock.left !== undefined ? 1 - clock.left / slot.seconds : 0;
  const all = R.overall(state, now);
  const capLeft = R.capLeft(state, now);
  const minuteLeft = R.minuteLeft(state, now);
  const items = partItems(runsheet);
  // A new block, not a loose step or rest that happens to be its own part.
  const nextIsNewPart = !!nxt && !!slot && nxt.part !== slot.part && items[nxt.part]?.kind === 'block';
  const partOf = (p: number) => items[p];

  const blockSteps = slot ? stepsOf(partOf(slot.part)) : [];
  const stepPos = slot && stepOf?.kind === 'exercise' ? blockSteps.findIndex(s => s.id === stepOf.id) : -1;
  const showPos = blockSteps.length > 1 && stepPos >= 0;
  const part = slot ? partOf(slot.part) : undefined;
  // The straight-set block as it runs now: a swap mid-block changes the exercise from the set on.
  const planned = sets && part?.kind === 'block' && slot?.blockId ? straightSetStep(part) : undefined;
  const straight = planned && ((state.slots.slice(idx).find(sl => sl.blockId === slot?.blockId && sl.kind === 'work')?.step as ExerciseStep | undefined) ?? planned);

  // The exercise Swap acts on: the one on the card, else the straight-set block's during its rest.
  const swapStep = stepOf?.kind === 'exercise' ? stepOf : straight;
  const swapTarget = swapStep ? (stepOf?.kind === 'exercise' ? target : R.plannedTarget(state, swapStep.id)) : undefined;
  // Once per exercise, not per tick: the call filters and sorts the whole library, and at five
  // renders a second it was most of what the timer did while a set was running.
  const swappable = !!(swapStep && onSwap && alternativesFor && !done);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- alternativesFor is a fresh arrow each render
  const options = useMemo(() => (swappable && swapStep && alternativesFor ? alternativesFor(swapStep, swapTarget) : []), [swappable, swapStep?.id, swapStep?.exercise.key, swapTarget]);
  const restAdjustable = !!onAdjustRest && isRest && timed && !slot?.untilBoundary && (state.phase === 'running' || paused);
  const last = slot && stepOf?.kind === 'exercise' && !done && !lead ? lastFor?.(stepOf) : undefined;
  const lastLabel = last && stepOf?.kind === 'exercise' ? lastTimeLabel(last, stepOf) : undefined;
  const race = raceLine(goal, ghost);
  // The numbers a set logs, folded into one line ("24 kg × 10 reps") until Change opens them.
  const dials: ('load' | 'incline' | 'reps' | R.Amount)[] = stepOf?.kind !== 'exercise' ? [] : [
    ...(hasLoad(stepOf.exercise) ? ['load' as const] : []),
    ...(isTreadmill(stepOf) && onAdjustIncline ? ['incline' as const] : []),
    ...(R.repsField(slot) ? ['reps' as const] : []),
    ...amountFields,
  ];
  const changeOpen = !!slot && changing === slot.id;
  const summary = stepOf?.kind !== 'exercise' ? '' : [
    [dials.includes('load') ? `${target !== undefined ? loadText(target, stepOf.exercise.unit) : '—'} ${unitText(shortUnit(stepOf.exercise.unit))}` : '', dials.includes('reps') ? `${fmtNum(reps)} reps` : '', ...amountFields.map(f => `${fmtNum(amountOf(f) ?? 0)} ${f === 'meters' ? 'm' : 'cal'}`)].filter(Boolean).join(' × '),
    dials.includes('incline') ? `${fmtNum(incline ?? 0)}% incline` : '',
  ].filter(Boolean).join(' · ');
  const partLabel = slot ? `${slot.parts > 1 ? `Block ${slot.part + 1} of ${slot.parts}` : ''}${slot.mode !== 'loose' ? `${slot.parts > 1 ? ' · ' : ''}${modeLabelOf(slot)} ${slot.round + 1}${slot.mode === 'amrap' ? '' : ` of ${slot.rounds}`}` : ''}` : runsheet.title;
  // What a screen reader hears when the session moves on: the phase, the step and the set, never
  // the countdown. It reads the plan (the lead-in and rest lengths), not the clock, so a tick
  // leaves it as it was and the live region only speaks on a change.
  const announcement = done ? 'Workout finished' : paused ? 'Paused' : ready && slot ? `Next block: ${partTitle(partOf(slot.part))}, set up then start` : lead ? `Get ready, ${state.leadSec} seconds` : !slot ? '' : isRest ? `Rest, ${Math.round(slot.seconds ?? 0)} seconds` : stepOf?.kind !== 'exercise' ? '' : round ? `${slot.blockName || 'Round'}, round ${slot.round + 1}` : straight ? `${stepOf.exercise.name}, set ${slot.round + 1} of ${slot.rounds}` : `${stepOf.exercise.name}, ${forLabel(stepOf)}${slot.rounds > 1 ? `, round ${slot.round + 1}${slot.mode === 'amrap' ? '' : ` of ${slot.rounds}`}` : ''}`;

  return (
    <div inert={confirmExit} className={cn('flex h-full min-h-0 flex-col text-white transition-colors duration-300', isRest && !ready ? 'bg-rest' : 'bg-night')}>
      {announce && (
        <div aria-live="polite" role="status" className="sr-only">
          {announcement}
        </div>
      )}
      <header className="safe-top shrink-0 px-4 pt-2 pb-2">
        <div className="flex items-center gap-3">
          {!done && (
            <button type="button" onClick={() => setConfirmExit(true)} aria-label="End session" className="grid size-11 shrink-0 place-items-center rounded-full bg-white/10">
              <X className="size-5" />
            </button>
          )}
          <div className="min-w-0 flex-1">
            <div className="truncate text-[17px] font-bold">{slot?.blockName ?? (stepOf?.kind === 'exercise' ? stepOf.exercise.name : runsheet.title)}</div>
            <div className="text-[14px] text-white/60">
              {partLabel}
              {slot?.rung ? ` · ${slot.rung} reps` : ''}
              {capLeft === undefined && slot?.mode === 'fortime' ? ` · ${fmtClock(bElapsed)}` : ''}
            </div>
          </div>
          <div className="shrink-0 text-right">
            <div className="text-[17px] font-bold tabular-nums">{Math.round(all * 100)}%</div>
            <div className="text-[13px] tabular-nums text-white/60">{fmtClock(total)}</div>
          </div>
          {!done && (
            <button type="button" onClick={() => setMenu(true)} aria-label="More" className="grid size-11 shrink-0 place-items-center rounded-full bg-white/10">
              <MoreHorizontal className="size-5" />
            </button>
          )}
        </div>
        <div className="relative mt-3 h-1 w-full overflow-hidden rounded-full bg-white/15">
          <div className="absolute inset-y-0 left-0 bg-white/35 transition-[width] duration-300" style={{ width: `${Math.round(all * 100)}%` }} />
          <div className="absolute inset-y-0 left-0 bg-brand transition-[width] duration-200" style={{ width: `${Math.round(progress * 100)}%` }} />
        </div>
        {race && !done && <div className="mt-2 text-[14px] text-white/60 tabular-nums">{race}</div>}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 max-[359px]:px-2">
        {ready && slot ? (
          <div className="py-4">
            {cut && (
              <div className="mb-4 flex items-center justify-between gap-3 rounded-card bg-surface px-3.5 py-2.5 text-ink">
                <span className="text-[15px] font-semibold">Time. Reps into round {cut.round + 1}</span>
                <Stepper aria-label={`Reps into round ${cut.round + 1}`} value={cut.extra} min={0} max={Math.max(0, cut.reps - 1)} onChange={v => onExtraReps!(cut.blockId, v)} />
              </div>
            )}
            <div className="text-[11px] font-bold tracking-widest text-brand uppercase">Next block{slot.parts > 1 ? ` · ${slot.part + 1} of ${slot.parts}` : ''}</div>
            <div className="mt-1 text-[28px] leading-tight font-black">{partTitle(partOf(slot.part))}</div>
            <div className="mt-1 text-[13px] text-white/60">{slot.mode !== 'loose' && partOf(slot.part).kind === 'block' ? roundsLabel(partOf(slot.part) as Block) : forLabel(stepOf as ExerciseStep)}</div>
            <div className="mt-3 space-y-1.5">
              {stepsOf(partOf(slot.part)).map(s => (
                <div key={s.id} className="flex items-center gap-2.5 rounded-card bg-white/10 px-3 py-2">
                  <ClipThumb size="sm" clip={s.exercise.clip} poster={s.exercise.poster} icon={s.exercise.icon} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[14px] font-semibold">{s.exercise.name}</div>
                    <div className="text-[12px] text-white/60">{stepLine(s)}</div>
                  </div>
                  {/* The load can be set here before the block starts, also when the plan gives none. */}
                  {onAdjustStep && hasLoad(s.exercise) && (
                    <div className="flex shrink-0 flex-col items-center">
                      <Stepper size="sm" aria-label={`${s.exercise.name} ${s.exercise.unit === 'kph' ? 'speed' : 'weight'}`} {...loadStepper(s.exercise, R.plannedTarget(state, s.id) ?? 0, t => onAdjustStep(s.id, { target: t }))} className="text-ink" />
                      <span className="text-[11px] text-white/60">{unitText(shortUnit(s.exercise.unit))}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div className="mt-4 text-center text-[13px] text-white/60">Set up, then start. The clock waits.</div>
          </div>
        ) : (
          <>
            {restAdjustable ? (
              // −15 s and +15 s either side of the rest clock, one row.
              <div className="flex items-center justify-center gap-3 pt-4">
                <Button variant="dark" onClick={() => onAdjustRest!(-15)} aria-label="15 seconds less rest" className="h-11 min-w-16 shrink-0 rounded-full bg-white/10 px-3 text-white tabular-nums">
                  −15s
                </Button>
                <div className="text-center text-[72px] leading-none font-black tracking-tight tabular-nums">{bigNumber}</div>
                <Button variant="dark" onClick={() => onAdjustRest!(15)} aria-label="15 seconds more rest" className="h-11 min-w-16 shrink-0 rounded-full bg-white/10 px-3 text-white tabular-nums">
                  +15s
                </Button>
              </div>
            ) : (
              <div className={cn('pt-4 text-center font-black tabular-nums tracking-tight', lead ? 'text-[96px] leading-none text-brand' : 'text-[72px] leading-none')}>{bigNumber}</div>
            )}
            {/* An adjustable rest has −15s/+15s beside it instead of "0:02 of 1:30", as in the mockup. */}
            {!lead && !done && timed && slot?.seconds && !restAdjustable ? (
              <div className="pb-3 text-center text-[13px] tabular-nums text-white/60">
                {fmtClock(clock.spent)} of {fmtClock(slot.seconds)}
              </div>
            ) : (
              <div className="pb-1" />
            )}
            {lead && <div className="-mt-2 pb-3 text-center text-[13px] text-white/60">Get ready</div>}
            {lead && <div className="-mt-1 pb-3 text-center text-[12px] text-white/60">The web timer needs the screen on.</div>}
            {!timed && !lead && !done && slot && !round && <div className="-mt-2 pb-3 text-center text-[13px] text-white/60">{isRest ? 'Rest' : straight ? 'Tick the set when you finish it' : 'Tap Done when finished'}</div>}
            {emomWork && !done && !round && <div className="-mt-2 pb-3 text-center text-[13px] text-white/60">Tap Done when finished</div>}
            {minuteLeft !== undefined && !lead && !done && (
              <div className={cn('mx-auto mb-3 w-fit rounded-full bg-white/10 px-3 py-1 text-[13px] font-bold tabular-nums', minuteLeft <= 10 && (isRest ? 'text-brand-line' : 'text-brand'))} aria-label={`Time left in the ${slot?.everySec && slot.everySec !== 60 ? 'interval' : 'minute'}`}>
                {fmtClock(minuteLeft)} left in the {slot?.everySec && slot.everySec !== 60 ? 'interval' : 'minute'}
              </div>
            )}
            {capLeft !== undefined && !lead && !done && (
              <div className="mx-auto mb-3 w-fit rounded-full bg-white/10 px-3 py-1 text-[13px] font-bold tabular-nums" aria-label="Time left in the block">
                {fmtClock(capLeft)} left in the block
              </div>
            )}

            {straight && slot?.blockId && !done && !lead && <TimerSetGrid key={slot.blockId} state={state} step={straight} blockId={slot.blockId} actions={sets!} equipment={equipment} prs={prs} onHowTo={() => setLook(straight)} />}

            {round && slot && (
              <div className="rounded-card bg-surface px-3 py-1.5 text-ink" aria-label={`Round ${slot.round + 1}`}>
                {round.map(j => {
                  const sl = state.slots[j];
                  if (sl.step.kind !== 'exercise') return null;
                  const es = sl.step;
                  const ticked = state.actuals[sl.id]?.doneAt !== undefined;
                  return (
                    <button key={sl.id} type="button" onClick={() => setLook(es)} aria-label={`${es.exercise.name}, ${forLabel(es)}${ticked ? ', done' : ''}. How to do it`} className="flex min-h-15 w-full items-center gap-3 border-b border-line-soft py-1.5 text-left last:border-0">
                      <ClipThumb size="md" clip={es.exercise.clip} poster={es.exercise.poster} icon={es.exercise.icon} />
                      <span className={cn('min-w-0 flex-1 text-[19px] leading-tight font-extrabold', ticked && 'text-muted')}>{es.exercise.name}</span>
                      {ticked && <Check className="size-4 shrink-0 text-muted" strokeWidth={3} />}
                      <span className={cn('shrink-0 text-[22px] font-extrabold tabular-nums', ticked && 'text-muted')}>{fmtNum(es.forValue)}</span>
                    </button>
                  );
                })}
              </div>
            )}

            {slot && !done && !round && !(straight && !lead) && (
              <SwipeToRemove onRemove={() => onDrop(slot.step.id)} disabled={isRest || paused} className="rounded-card">
                <div className={cn('rounded-card p-4', isRest ? 'bg-white/10' : 'bg-surface text-ink')}>
                  <div className="flex items-center gap-3.5">
                    {stepOf?.kind === 'exercise' ? (
                      <button type="button" onClick={() => setLook(stepOf)} aria-label={`How to do ${stepOf.exercise.name}`} className="shrink-0 rounded-card">
                        <ClipThumb size="lg" clip={stepOf.exercise.clip} poster={stepOf.exercise.poster} icon={stepOf.exercise.icon} />
                      </button>
                    ) : (
                      <ClipThumb size="lg" variant="rest" className="bg-white/20 text-white" />
                    )}
                    <div className="min-w-0 flex-1">
                      {showPos && (
                        <div className={cn('text-[12px] font-bold tracking-wider uppercase', isRest ? 'text-white/60' : 'text-brand-ink')}>
                          Exercise {stepPos + 1} of {blockSteps.length}
                        </div>
                      )}
                      <div className="text-[24px] leading-tight font-extrabold">{stepOf?.kind === 'exercise' ? stepOf.exercise.name : 'Rest'}</div>
                      {!dials.length && <div className={cn('text-[13px]', isRest ? 'text-white/70' : 'text-muted')}>{stepOf?.kind === 'exercise' ? forLabel(stepOf) : `${slot.seconds ?? 0}s`}</div>}
                    </div>
                  </div>
                  {stepOf?.kind === 'exercise' && dials.length > 0 && (
                    <>
                      {/* What you will log, as one line; Change opens the steppers in place. */}
                      <button type="button" onClick={() => setChanging(changeOpen ? null : slot.id)} aria-expanded={changeOpen} aria-label={`${summary}${lastLabel ? `, ${lastLabel}` : ''}. ${changeOpen ? 'Close' : 'Change'}`} className="mt-3.5 flex min-h-15 w-full items-center gap-2.5 rounded-control bg-line-soft px-3.5 py-2.5 text-left">
                        <span className="min-w-0 flex-1">
                          <span className="block text-[22px] leading-tight font-extrabold tabular-nums">{summary}</span>
                          {lastLabel && <span className="mt-0.5 block text-[13px] text-muted">{lastLabel[0].toUpperCase() + lastLabel.slice(1)}</span>}
                        </span>
                        <span className="shrink-0 text-[15px] font-semibold text-brand-ink">{changeOpen ? 'Close' : 'Change'}</span>
                      </button>
                      {changeOpen && (
                        <div className="mt-3 space-y-2">
                          {dials.includes('load') && (
                            <div className="flex items-center justify-between gap-3">
                              <span className="text-[14px]">
                                {stepOf.exercise.unit === 'kph' ? 'Speed' : 'Weight'} <span className="text-muted">({unitText(shortUnit(stepOf.exercise.unit))})</span>
                              </span>
                              <div className="flex items-center">
                                {kitOf(stepOf.exercise) === 'barbell' && <PlatesButton load={target} equipment={equipment} />}
                                <Stepper aria-label="Target" {...loadStepper(stepOf.exercise, target ?? 0, onAdjust)} />
                              </div>
                            </div>
                          )}
                          {dials.includes('incline') && (
                            <div className="flex items-center justify-between gap-3">
                              <span className="text-[14px]">Incline</span>
                              <Stepper aria-label="Incline" value={incline ?? 0} step={1} min={0} max={30} onChange={onAdjustIncline!} />
                            </div>
                          )}
                          {dials.includes('reps') && (
                            <div className="flex items-center justify-between gap-3">
                              <span className="text-[14px]">Reps done</span>
                              <Stepper aria-label="Reps" value={reps} min={0} max={500} onChange={onSetReps} />
                            </div>
                          )}
                          {amountFields.map(f => (
                            <div key={f} className="flex items-center justify-between gap-3">
                              <span className="text-[14px]">{f === 'meters' ? 'Metres done' : 'Calories done'}</span>
                              <Stepper aria-label={f === 'meters' ? 'Metres' : 'Calories'} value={amountOf(f) ?? 0} min={0} max={99999} step={f === 'meters' ? metersStep(stepOf.exercise, stepOf.forMode === 'meters' ? 10 : Math.max(10, stepOf.exercise.step)) : 1} onChange={v => onSetAmount!(v, f)} />
                            </div>
                          ))}
                          {lastLabel && onFill && (
                            <button type="button" aria-label="Use last time" onClick={() => onFill(slot.id, last!)} className="min-h-11 text-left text-[13px] font-semibold text-brand-ink underline decoration-dotted underline-offset-2">
                              Use last time ({lastLabel.replace(/^last time /, '')})
                            </button>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </SwipeToRemove>
            )}

            {nxt && !done && !round && (
              <button type="button" onClick={() => setPeek(nxt.part)} className={cn('sticky bottom-0 mt-3 flex min-h-11 w-full items-center gap-2.5 px-1.5 text-left text-[16px] transition-colors duration-300', isRest ? 'bg-rest' : 'bg-night')}>
                <span className={cn('shrink-0 text-[13px] font-semibold tracking-wider uppercase', nextIsNewPart ? (isRest ? 'text-brand-line' : 'text-brand') : 'text-white/60')}>{nextIsNewPart ? 'Next block' : 'Next'}</span>
                <span className="min-w-0 flex-1 truncate">{nextIsNewPart ? partTitle(partOf(nxt.part)) : nxt.step.kind === 'exercise' ? nxt.step.exercise.name : 'Rest'}</span>
                <span className="shrink-0 text-white/60 tabular-nums">{nxt.step.kind === 'exercise' ? forLabel(nxt.step) : fmtClock(nxt.seconds ?? 0)}</span>
              </button>
            )}
            {done && (
              <div className="rounded-card bg-white/10 p-4 text-center">
                <div className="text-[18px] font-extrabold">Workout saved</div>
                <div className="mt-1 text-[13px] text-white/70">{fmtClock(total)}</div>
              </div>
            )}
          </>
        )}
      </div>

      <div className="safe-bottom shrink-0 px-4 pt-2 pb-3">
        {done ? (
          <Button block size="xl" variant="brand" onClick={onFinish}>
            <Check /> Review result
          </Button>
        ) : ready ? (
          <div className="flex gap-2">
            <Button block size="xl" variant="brand" onClick={onStartBlock}>
              <Play /> Start block
            </Button>
          </div>
        ) : (
          <>
            <div className="flex gap-2 pb-2">
              <Button variant="dark" size="lg" onClick={onBack} disabled={idx === 0 || lead} aria-label="Previous step" className="shrink-0 bg-white/10 text-white max-[359px]:px-3">
                <ChevronLeft />
              </Button>
              {!countdown ? (
                <Button block size="lg" variant="dark" onClick={paused ? onResume : onPause} className={cn('bg-white/10 text-white max-[359px]:gap-1.5 max-[359px]:px-2', paused && 'bg-white text-night')}>
                  {paused ? <Play /> : <Pause />} {paused ? 'Resume' : 'Pause'}
                </Button>
              ) : (
                timedWork && (
                  <Button block size="lg" variant="dark" onClick={onDone} className="bg-white/10 text-white max-[359px]:gap-1.5 max-[359px]:px-2">
                    <Check /> Done early
                  </Button>
                )
              )}
              <Button block size="lg" variant="dark" onClick={skip} aria-label={lead || isRest ? undefined : 'Skip this step'} className="bg-white/10 text-white max-[359px]:gap-1.5 max-[359px]:px-2">
                <SkipForward /> Skip{isRest ? ' rest' : ''}
              </Button>
            </div>
            {countdown ? (
              <Button block size="xl" variant="brand" onClick={paused ? onResume : onPause} className={cn(paused && 'bg-white text-night')}>
                {paused ? <Play /> : <Pause />} {paused ? 'Resume' : 'Pause'}
              </Button>
            ) : (
              <Button block size="xl" variant="brand" onClick={round ? onRoundDone : onDone}>
                <Check /> {setDone}
              </Button>
            )}
          </>
        )}
        {paused && !done && <div className="pt-2 text-center text-[12px] text-white/60">Paused</div>}
      </div>

      <Sheet open={menu} onOpenChange={setMenu} title="Session">
        <div className="space-y-2">
          <Button block variant="ghost" onClick={() => (setMenu(false), onBack())}>
            <ChevronLeft /> Previous step
          </Button>
          {(!timed || timedWork || emomWork) && !lead && !ready && (
            <Button block variant="ghost" onClick={() => (setMenu(false), onSkip())}>
              <SkipForward /> Skip this step
            </Button>
          )}
          {onEndBlock && slot?.blockId && !lead && (state.phase === 'running' || paused) && (
            <Button block variant="ghost" onClick={() => (setMenu(false), onEndBlock())}>
              <ChevronsRight /> End this block
            </Button>
          )}
          {options.length > 0 && (
            <Button block variant="ghost" onClick={() => (setMenu(false), setSwapping(true))}>
              <Shuffle /> Swap exercise
            </Button>
          )}
          {slot && stepOf?.kind === 'exercise' && !lead && !ready && (
            <Button block variant="ghost" onClick={() => (setMenu(false), onDrop(slot.step.id))}>
              <Trash2 /> Drop this exercise
            </Button>
          )}
          <Button block variant="ghost" onClick={() => (setMenu(false), setOverview(true))}>
            <List /> Workout overview
          </Button>
          {onSuggestions && (
            <Button block variant="ghost" onClick={() => (setMenu(false), onSuggestions())}>
              <Target /> Suggestions
            </Button>
          )}
          {onToggleMute && (
            <Button block variant="ghost" onClick={onToggleMute} aria-pressed={!!muted}>
              {muted ? <VolumeX /> : <Volume2 />} {muted ? 'Unmute tones' : 'Mute tones'}
            </Button>
          )}
          <Button block variant="danger" onClick={() => (setMenu(false), setConfirmExit(true))}>
            <Square /> End workout
          </Button>
        </div>
      </Sheet>

      <Sheet open={swapping} onOpenChange={setSwapping} title={swapStep ? `Instead of ${swapStep.exercise.name}` : 'Swap exercise'}>
        <div className="space-y-1.5">
          {options.map(o => (
            <button
              key={o.exercise.key}
              type="button"
              onClick={() => {
                setSwapping(false);
                if (swapStep) onSwap?.(swapStep.id, o.exercise, o.target);
              }}
              className="flex min-h-14 w-full items-center gap-2.5 rounded-card border border-line bg-surface px-3 py-2 text-left active:bg-line-soft"
            >
              <ClipThumb size="sm" clip={o.exercise.clip} poster={o.exercise.poster} icon={o.exercise.icon} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[14px] font-semibold">{o.exercise.name}</div>
                <div className="text-[12px] text-muted">{[o.why, o.target !== undefined ? fmtInUnit(o.target, o.exercise.unit) : ''].filter(Boolean).join(' · ')}</div>
              </div>
              <ChevronRight className="size-4 shrink-0 text-faint" />
            </button>
          ))}
          <p className="px-1 pt-1 text-[12px] text-muted">Swapping keeps the rounds you have already done.</p>
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
                    <div className="text-[12px] text-muted">{it.kind === 'block' ? roundsLabel(it as Block) : ''}</div>
                  </div>
                  <span className={cn('shrink-0 text-[11px] font-bold tracking-widest uppercase', status === 'now' ? 'text-brand-ink' : status === 'done' ? 'text-muted' : 'text-faint')}>{status === 'now' ? 'Now' : status === 'done' ? 'Done' : ''}</span>
                </div>
                <div className="mt-1.5 space-y-1">
                  {stepsOf(it).map(es => (
                    <button key={es.id} type="button" onClick={() => setLook(es)} className="flex w-full items-center gap-2 rounded-lg bg-canvas px-2 py-1.5 text-left active:bg-line-soft">
                      <ClipThumb size="sm" clip={es.exercise.clip} poster={es.exercise.poster} icon={es.exercise.icon} />
                      <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">{es.exercise.name}</span>
                      <span className="shrink-0 text-[12px] text-muted tabular-nums">{stepLine(es)}</span>
                      <ChevronRight className="size-4 shrink-0 text-faint" />
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </Sheet>

      <Sheet open={peek !== null} onOpenChange={o => !o && setPeek(null)} title={peek !== null && partOf(peek) ? partTitle(partOf(peek)) : 'Next'}>
        {peek !== null && partOf(peek) && (
          <div className="space-y-1.5">
            {partOf(peek).kind === 'block' && <div className="text-[12px] text-muted">{roundsLabel(partOf(peek) as Block)}</div>}
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

      <ExerciseSheet
        step={look}
        onOpenChange={o => !o && setLook(null)}
        target={look ? R.plannedTarget(state, look.id) : undefined}
        incline={look ? R.plannedIncline(state, look.id) : undefined}
        onTarget={onAdjustStep && look ? t => (onAdjustStep(look.id, { target: t }), setLook({ ...look })) : undefined}
        onIncline={onAdjustStep && look ? v => (onAdjustStep(look.id, { incline: v }), setLook({ ...look })) : undefined}
        note={onAdjustStep ? 'Applies from here to the end of the session.' : undefined}
      />

      <Dialog.Root open={confirmExit} onOpenChange={o => (setConfirmExit(o), !o && setConfirmDiscard(false))}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-night/70" />
          <Dialog.Content aria-modal="true" className="fixed inset-x-0 bottom-0 z-50 mx-auto w-full max-w-[480px] p-4 outline-none">
            {confirmDiscard ? (
              <div className="w-full space-y-2 rounded-card bg-surface p-4 text-ink">
                <Dialog.Title className="text-[16px] font-bold">Discard this session?</Dialog.Title>
                <Dialog.Description className="text-[13px] text-muted">{fmtClock(total)} of work is not saved.</Dialog.Description>
                <Button block variant="danger" onClick={onExit}>
                  Discard session
                </Button>
                <Button block variant="quiet" onClick={() => setConfirmDiscard(false)}>
                  Keep going
                </Button>
              </div>
            ) : (
              <div className="w-full space-y-2 rounded-card bg-surface p-4 text-ink">
                <Dialog.Title className="text-[16px] font-bold">End this session?</Dialog.Title>
                <Dialog.Description className="text-[13px] text-muted">{fmtClock(total)} so far. Save what you did, or discard it.</Dialog.Description>
                <Button block onClick={onFinish}>
                  Finish and save
                </Button>
                <Button block variant="danger" onClick={() => setConfirmDiscard(true)}>
                  Discard
                </Button>
                <Button block variant="quiet" onClick={() => setConfirmExit(false)}>
                  Keep going
                </Button>
              </div>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
};
