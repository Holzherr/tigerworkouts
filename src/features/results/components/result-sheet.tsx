import { ArrowRight, Check, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '@/shared/components/ui/button';
import { Chip } from '@/shared/components/ui/chip';
import { ClipThumb } from '@/shared/components/ui/clip-thumb';
import { FULL_LIBRARY as LIB } from '@/features/workouts/imported';
import { workedFrom } from '../effort';
import { SessionStats } from './session-stats';
import { Stepper } from '@/shared/components/ui/stepper';
import { cn } from '@/shared/utils/ui-utils';
import { forLabel, measureOf, scoreType, type ExerciseStep, type Runsheet } from '@/features/runsheet/model';
import { fmtScore, nextLoads, resolveTarget, type NextLoad, type SessionOrigin, type SessionResult, type StepResult, type TrainingMaxes } from '@/features/runsheet/progression';
import { ScoreEntry } from './score-entry';
import { BodyweightPrompt } from './bodyweight-prompt';
import { nextTime, ruled, type Intent } from '@/features/runsheet/targets';
import type { Equipment } from '@/features/runsheet/plates';
import { celebrate } from '../celebrate';
import { shareCardData } from '../share-card';
import { CelebrationCard } from './celebration-card';
import { EffortRow } from './effort-row';
import { ShareCardSheet } from './share-card-sheet';
import { SplitsCard } from './splits-card';
import { withRowLoad } from '../edit-sets';

export interface ResultSheetProps {
  runsheet: Runsheet;
  /** Earlier results of this runsheet, newest first, for the progression rules. */
  history?: SessionResult[];
  /** Every session logged, any workout, for the workout count, streak and records. Defaults to `history`. */
  allResults?: SessionResult[];
  trainingMaxes?: TrainingMaxes;
  bodyweightKg?: number;
  startedAt?: string;
  /** What the timer recorded: score, per-step targets and reps, duration. */
  initial?: Partial<SessionResult>;
  /** Where the user started this session from; saved on the result so home_reco_used can be measured. */
  startedFrom?: SessionOrigin;
  onSave: (result: SessionResult, next: NextLoad[]) => void;
  onCancel?: () => void;
  /** Set while bodyweight has never been given or skipped: asks for it under the stats. */
  onBodyweight?: (kg: number | undefined) => void;
  /** How hard the next-time targets push (Settings → Suggestions). */
  intent?: Intent;
  /** Settings → My equipment: next time's loads snap to what it can make. */
  equipment?: Equipment;
}

const exerciseSteps = (r: Runsheet): ExerciseStep[] => r.items.flatMap(it => (it.kind === 'block' ? it.steps : it.kind === 'ref' ? [] : [it])).filter((s): s is ExerciseStep => s.kind === 'exercise');

/**
 * End-of-session sheet. Top: the score entry for the workout's score type. Then the celebration
 * (workout count, streak, records set, deltas vs last time, Share) and the 1–10 effort row. Middle: one line per
 * exercise with the load used and, for program sessions, a "made it / missed" toggle and the
 * reps on any 5+ or max set — only on exercises a progression rule reads. Bottom: "Next time" lines produced by the progression rules and,
 * for everything they do not move, the targets read from history (targets.ts), then Save. Pure:
 * the host stores the result and updates training maxes.
 */
export const ResultSheet = ({ runsheet, history = [], allResults = history, trainingMaxes = {}, bodyweightKg, startedAt, initial, startedFrom, onSave, onCancel, onBodyweight, intent = 'maintain', equipment }: ResultSheetProps) => {
  const type = scoreType(runsheet);
  const steps = useMemo(() => exerciseSteps(runsheet), [runsheet]);
  // Made it / Missed only where a progression rule reads it: a rule on one block says nothing
  // about the exercises in the others.
  const hasRule = (s: ExerciseStep) => ruled(runsheet, s);
  const [score, setScore] = useState<number | undefined>(initial?.score);
  const [notes, setNotes] = useState('');
  const [rpe, setRpe] = useState<number | undefined>(initial?.rpe);
  const [sharing, setSharing] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  // From the timer, a step it did not log was not done — skipped or never reached — and gets no row:
  // a row with the planned load would count as sets done. Without a timer run (Log only) every
  // planned step is there to fill in by hand.
  const fromTimer = initial?.steps !== undefined;
  // What the timer logged beyond one row per planned step — a step swapped mid-session has a row
  // per exercise — rides through untouched, and each row keeps its per-set results.
  const matched = (s: ExerciseStep) => initial?.steps?.find(x => x.stepId === s.id && x.exerciseKey === s.exercise.key) ?? initial?.steps?.find(x => x.stepId === s.id);
  const extra = (initial?.steps ?? []).filter(x => !steps.some(s => matched(s) === x));
  const [rows, setRows] = useState<Record<string, StepResult>>(() =>
    Object.fromEntries(
      steps.filter(s => !fromTimer || matched(s)).map(s => {
        const rec = matched(s);
        return [s.id, { ...rec, stepId: s.id, exerciseKey: rec?.exerciseKey ?? s.exercise.key, target: rec?.target ?? resolveTarget(s, trainingMaxes, bodyweightKg, equipment), success: rec?.success ?? (hasRule(s) ? true : undefined), reps: rec?.reps ?? (s.forMode === 'amrap' || s.forMode === 'max' ? [s.forValue] : undefined) }];
      })
    )
  );
  const result: SessionResult = { ...initial, runsheetId: runsheet.id ?? runsheet.title, title: runsheet.title, startedAt: initial?.startedAt ?? startedAt ?? new Date().toISOString(), endedAt: initial?.endedAt ?? new Date().toISOString(), score, scoreText: score !== undefined ? fmtScore(type, score) : undefined, steps: [...Object.values(rows), ...extra], notes: notes || undefined, rpe, startedFrom };
  const exerciseName = (k: string) => ({ name: LIB[k]?.name ?? k, unit: LIB[k]?.unit });
  const celebration = celebrate(result, allResults, undefined, k => exerciseSteps(runsheet).find(s => s.exercise.key === k)?.exercise.unit ?? LIB[k]?.unit);
  const next = useMemo(() => nextLoads(runsheet, result, history, trainingMaxes, equipment), [runsheet, result, history, trainingMaxes, equipment]);
  // Targets from history for what the programme rules do not move: the score, loads, reps.
  const targets = useMemo(() => nextTime(runsheet, result, history, intent, next.map(n => n.exerciseKey), equipment), [runsheet, result, history, intent, next, equipment]);
  const blockName = (id: string) => runsheet.items.flatMap(i => (i.kind === 'block' && i.id === id ? [i.name] : []))[0];
  // The session was logged when the timer ended, so it is already in `history`: last time is the one before it.
  const previous = useMemo(() => [...history].filter(h => !initial?.id || h.id !== initial.id).sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0], [history, initial?.id]);
  const set = (id: string, patch: Partial<StepResult>) => setRows(r => ({ ...r, [id]: { ...r[id], ...patch } }));
  const seen = new Set<string>();

  return (
    <div className="flex h-full min-h-0 flex-col bg-canvas">
      <header className="safe-top shrink-0 border-b border-line bg-surface px-4 pt-3 pb-3">
        <div className="text-[12px] text-muted">Log result</div>
        <h1 className="text-[19px] leading-tight font-extrabold">{runsheet.title}</h1>
        {initial?.durationSec !== undefined && <div className="mt-0.5 text-[12px] text-muted">{Math.round(initial.durationSec / 60)} min{initial.completed === false ? ' · stopped early' : ''}</div>}
        {type !== 'none' && <ScoreEntry type={type} value={score} onChange={setScore} className="mt-3" />}
      </header>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-3">
        <CelebrationCard celebration={celebration} scoreType={type} exercise={exerciseName} blockName={blockName} onShare={() => setSharing(true)} />
        <SplitsCard result={result} last={celebration.last} blockName={blockName} records={celebration.rounds} />
        <EffortRow value={rpe} onChange={setRpe} />
        <SessionStats result={result} worked={workedFrom(result, runsheet, k => ({ name: LIB[k]?.name ?? k, group: LIB[k]?.group }))} history={history} bodyweightKg={bodyweightKg} />
        {onBodyweight && bodyweightKg === undefined && <BodyweightPrompt onSave={kg => onBodyweight(kg)} onSkip={() => onBodyweight(undefined)} />}
        {steps.map(s => {
          if (!rows[s.id]) return null;
          if (seen.has(s.exercise.key) && s.forMode !== 'amrap' && s.forMode !== 'max') return null;
          seen.add(s.exercise.key);
          const row = rows[s.id];
          const logsReps = s.forMode === 'amrap' || s.forMode === 'max';
          return (
            <div key={s.id} className="rounded-card border border-line bg-surface px-3 py-2">
              <div className="flex items-center gap-2.5">
                <ClipThumb size="sm" clip={s.exercise.clip} poster={s.exercise.poster} icon={s.exercise.icon} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[14px] font-semibold">{s.exercise.name}</div>
                  <div className="text-[12px] text-muted">
                    {forLabel(s)}
                    {s.targetPct ? ` · ${s.targetPct}% TM` : ''}
                  </div>
                </div>
                {s.exercise.unit && s.exercise.unit !== 'reps' && !measureOf(s.exercise.unit) && <Stepper size="sm" aria-label="Load used" value={row.target ?? 0} step={s.exercise.step} onChange={t => setRows(r => ({ ...r, [s.id]: withRowLoad(r[s.id], t) }))} />}
              </div>
              {(hasRule(s) || logsReps) && (
                <div className="mt-2 flex items-center justify-between gap-2">
                  {logsReps ? (
                    <>
                      <span className="text-[12px] text-muted">Reps done</span>
                      <Stepper size="sm" aria-label="Reps done" value={row.reps?.at(-1) ?? 0} min={0} max={200} onChange={n => set(s.id, { reps: [n], success: s.forMode === 'amrap' ? n >= s.forValue : undefined })} />
                    </>
                  ) : (
                    <>
                      <span className="text-[12px] text-muted">All sets done?</span>
                      <div className="flex gap-1.5">
                        <Chip variant={row.success ? 'on' : 'outline'} onClick={() => set(s.id, { success: true })}>
                          <Check className="size-3.5" /> Made it
                        </Chip>
                        <Chip variant={row.success === false ? 'danger' : 'outline'} onClick={() => set(s.id, { success: false })}>
                          <X className="size-3.5" /> Missed
                        </Chip>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {(next.length > 0 || targets.length > 0) && (
          <section aria-label="Next time" className="rounded-card border border-brand-line bg-brand-soft px-3 py-2">
            <div className="text-[11px] font-bold tracking-widest text-brand-ink uppercase">Next time</div>
            {next.map(n => (
              <div key={n.exerciseKey} className="mt-1.5 text-[13px]">
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate font-semibold">{n.name}</span>
                  <span className={cn('flex shrink-0 items-center gap-1 tabular-nums whitespace-nowrap', n.to !== n.from && 'font-bold')}>
                    {n.from ?? '?'} <ArrowRight className="size-3.5 text-faint" /> {n.to ?? '?'} kg
                  </span>
                </div>
                <div className="text-[11px] text-muted">{n.reason}</div>
              </div>
            ))}
            {targets.map(t => (
              <div key={t.key} className="mt-1.5 text-[13px]">
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate font-semibold">{t.key === 'score' ? 'Score' : t.name}</span>
                  <span className="shrink-0 font-bold whitespace-nowrap tabular-nums">{t.text}</span>
                </div>
                <div className="text-[11px] text-muted">{t.reason}</div>
              </div>
            ))}
          </section>
        )}
        {previous?.notes && !notes && (
          <button type="button" onClick={() => setNotes(previous.notes ?? '')} className="mb-1 block w-full rounded-card bg-canvas px-3 py-2 text-left text-[12px] text-muted">
            <span className="font-bold text-ink">Last time:</span> {previous.notes} <span className="text-brand">· tap to reuse</span>
          </button>
        )}
        <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Notes (how it felt, what to change)" rows={2} className="w-full rounded-card border border-line bg-surface px-3 py-2 text-[16px] outline-none focus:border-hint" />
      </div>
      {sharing && <ShareCardSheet open={sharing} onOpenChange={setSharing} data={shareCardData(result, celebration, type, exerciseName)} />}
      <div className="safe-bottom shrink-0 border-t border-line bg-surface p-3">
        {confirmDiscard ? (
          <div>
            <p className="pb-2 text-[13px] text-muted">This workout is already in History. Discard takes it out, here and on your other devices.</p>
            <div className="flex gap-2">
              <Button block variant="danger" onClick={onCancel}>
                Discard workout
              </Button>
              <Button variant="ghost" onClick={() => setConfirmDiscard(false)}>
                Keep
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex gap-2">
            <Button block onClick={() => onSave(result, next)}>
              <Check /> Save result
            </Button>
            {onCancel && (
              // A session the timer logged is already saved: Discard deletes it, so it asks first.
              <Button variant="ghost" onClick={() => (initial?.id ? setConfirmDiscard(true) : onCancel())}>
                Discard
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
