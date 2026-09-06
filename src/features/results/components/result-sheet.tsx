import { ArrowRight, Check, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '@/shared/components/ui/button';
import { Chip } from '@/shared/components/ui/chip';
import { ClipThumb } from '@/shared/components/ui/clip-thumb';
import { Stepper } from '@/shared/components/ui/stepper';
import { cn } from '@/shared/utils/ui-utils';
import { scoreType, type ExerciseStep, type Runsheet } from '@/features/runsheet/model';
import { fmtScore, nextLoads, resolveTarget, type NextLoad, type SessionResult, type StepResult, type TrainingMaxes } from '@/features/runsheet/progression';
import { ScoreEntry } from './score-entry';

export interface ResultSheetProps {
  runsheet: Runsheet;
  /** Earlier results of this runsheet, newest first, for the progression rules. */
  history?: SessionResult[];
  trainingMaxes?: TrainingMaxes;
  bodyweightKg?: number;
  startedAt?: string;
  /** What the timer recorded: score, per-step targets and reps, duration. */
  initial?: Partial<SessionResult>;
  onSave: (result: SessionResult, next: NextLoad[]) => void;
  onCancel?: () => void;
}

const exerciseSteps = (r: Runsheet): ExerciseStep[] => r.items.flatMap(it => (it.kind === 'block' ? it.steps : it.kind === 'ref' ? [] : [it])).filter((s): s is ExerciseStep => s.kind === 'exercise');

/**
 * End-of-session sheet. Top: the score entry for the workout's score type. Middle: one line per
 * exercise with the load used and, for program sessions, a "made it / missed" toggle and the
 * reps on any 5+ or max set. Bottom: "Next time" lines produced by the progression rules, then
 * Save. Pure: the host stores the result and updates training maxes.
 */
export const ResultSheet = ({ runsheet, history = [], trainingMaxes = {}, bodyweightKg, startedAt, initial, onSave, onCancel }: ResultSheetProps) => {
  const type = scoreType(runsheet);
  const steps = useMemo(() => exerciseSteps(runsheet), [runsheet]);
  const hasProgression = !!runsheet.progression || runsheet.items.some(i => i.kind === 'block' && i.progression);
  const [score, setScore] = useState<number | undefined>(initial?.score);
  const [notes, setNotes] = useState('');
  const [rows, setRows] = useState<Record<string, StepResult>>(() =>
    Object.fromEntries(
      steps.map(s => {
        const rec = initial?.steps?.find(x => x.stepId === s.id);
        return [s.id, { stepId: s.id, exerciseKey: s.exercise.key, target: rec?.target ?? resolveTarget(s, trainingMaxes, bodyweightKg), success: rec?.success ?? (hasProgression ? true : undefined), reps: rec?.reps ?? (s.forMode === 'amrap' || s.forMode === 'max' ? [s.forValue] : undefined) }];
      })
    )
  );
  const result: SessionResult = { ...initial, runsheetId: runsheet.id ?? runsheet.title, title: runsheet.title, startedAt: initial?.startedAt ?? startedAt ?? new Date().toISOString(), endedAt: initial?.endedAt ?? new Date().toISOString(), score, scoreText: score !== undefined ? fmtScore(type, score) : undefined, steps: Object.values(rows), notes: notes || undefined };
  const next = useMemo(() => nextLoads(runsheet, result, history, trainingMaxes), [runsheet, result, history, trainingMaxes]);
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
        {steps.map(s => {
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
                    {s.forMode === 'amrap' ? `${s.forValue}+ reps` : s.forMode === 'max' ? 'max' : `${s.forValue} ${s.forMode}`}
                    {s.targetPct ? ` · ${s.targetPct}% TM` : ''}
                  </div>
                </div>
                {s.exercise.unit && s.exercise.unit !== 'reps' && <Stepper size="sm" aria-label="Load used" value={row.target ?? 0} step={s.exercise.step} onChange={t => set(s.id, { target: t })} />}
              </div>
              {(hasProgression || logsReps) && (
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
        {next.length > 0 && (
          <section className="rounded-card border border-brand-line bg-brand-soft px-3 py-2">
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
          </section>
        )}
        <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Notes (how it felt, what to change)" rows={2} className="w-full rounded-card border border-line bg-surface px-3 py-2 text-[16px] outline-none focus:border-hint" />
      </div>
      <div className="safe-bottom shrink-0 border-t border-line bg-surface p-3">
        <div className="flex gap-2">
          <Button block onClick={() => onSave(result, next)}>
            <Check /> Save result
          </Button>
          {onCancel && (
            <Button variant="ghost" onClick={onCancel}>
              Discard
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};
