import { useState } from 'react';
import { Dropdown } from '@/shared/components/ui/dropdown';
import { NumberEntry } from '@/shared/components/ui/number-entry';
import { numberText } from '@/shared/utils/number-entry';
import { customStep, LOAD_STEP_CHOICES, loadStep, METER_STEP_CHOICES, metersStep, setStepSize, useStepSizes, type StepKind } from '@/shared/utils/step-sizes';
import { extraLogs, hasSetting, settingLabel, shortUnit, type ExerciseStep } from '../model';

/** The step counts metres: it is done for a distance, or logs one. */
export const countsMeters = (s: ExerciseStep) => s.forMode === 'meters' || extraLogs(s).includes('meters');
/** What − and + move this step's metres by before one is picked: 10 m on a distance, the machine's own on a timed piece. */
export const metersFallback = (s: ExerciseStep) => (s.forMode === 'meters' ? 10 : Math.max(10, s.exercise.step || 0));

const Row = ({ title, unit, value, custom, choices, onSet }: { title: string; unit: string; value: number; custom: boolean; choices: number[]; onSet: (v: number | undefined) => void }) => {
  const [other, setOther] = useState(false);
  const listed = choices.includes(value);
  const options = [
    ...(listed ? [] : [{ value: String(value), label: `${numberText(value)} ${unit}` }]),
    ...choices.map(c => ({ value: String(c), label: `${numberText(c)} ${unit}` })),
    { value: 'other', label: 'Other…' },
    ...(custom ? [{ value: 'own', label: "The exercise's own" }] : []),
  ];
  return (
    <div className="flex min-h-11 items-center justify-between gap-3 px-3 py-1.5">
      <span className="text-[15px] text-body">{title}</span>
      {other ? (
        <span className="flex items-center gap-1.5">
          <NumberEntry aria-label={`${title} (${unit})`} value={value} min={0} max={1000} onChange={v => (onSet(v), setOther(false))} className="w-20 rounded-control border border-line bg-surface text-[15px]" />
          <span className="text-[13px] text-muted">{unit}</span>
        </span>
      ) : (
        <Dropdown aria-label={title} value={String(value)} options={options} onValueChange={v => (v === 'other' ? setOther(true) : onSet(v === 'own' ? undefined : Number(v)))} />
      )}
    </div>
  );
};

/**
 * What − and + move by on this exercise, everywhere it is listed: the load (or speed) step and, on
 * a distance, metres. Picked from a short list, typed under Other, or put back to the exercise's own.
 */
export const StepSizes = ({ step }: { step: ExerciseStep }) => {
  useStepSizes();
  const key = step.exercise.key;
  const meters = countsMeters(step);
  if (!hasSetting(step) && !meters) return null;
  const set = (kind: StepKind) => (v: number | undefined) => setStepSize(key, kind, v);
  return (
    <div className="divide-y divide-line-soft rounded-card border border-line bg-surface" aria-label="Step sizes">
      {hasSetting(step) && <Row title={`${settingLabel(step)} steps`} unit={shortUnit(step.exercise.unit)} value={loadStep(step.exercise)} custom={customStep(key, 'load') !== undefined} choices={LOAD_STEP_CHOICES} onSet={set('load')} />}
      {meters && <Row title="Distance steps" unit="m" value={metersStep(step.exercise, metersFallback(step))} custom={customStep(key, 'meters') !== undefined} choices={METER_STEP_CHOICES} onSet={set('meters')} />}
    </div>
  );
};
