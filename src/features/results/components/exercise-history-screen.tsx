import { ChevronLeft } from 'lucide-react';
import { ClipThumb } from '@/shared/components/ui/clip-thumb';
import { Button } from '@/shared/components/ui/button';
import { shortUnit, type ExerciseRef } from '@/features/runsheet/model';
import type { SessionResult } from '@/features/runsheet/progression';
import { chartMetrics, exerciseHistory, fmtDur, fmtNum, inRange, lowerIsBetter, METRIC_LABEL, pointsFor, RANGE_LABEL, records, setLabel, type ChartMetric, type ChartRange, type LogKind, type Rec, type Records } from '../logbook';
import { useState } from 'react';
import { cn } from '@/shared/utils/ui-utils';
import { ProgressChart } from './progress-chart';
import { StallCard } from './targets';
import type { Stall } from '../stall';

export interface ExerciseHistoryScreenProps {
  exercise: ExerciseRef;
  /** The catalogue group: a rower's pace reads per 500 m. */
  group?: string;
  results: SessionResult[];
  onBack: () => void;
  /** Opens a session from its row. */
  onSession?: (id: string) => void;
  backLabel?: string;
  /** A best that has not moved in weeks, with two ways out; shown under the chart until dismissed. */
  stall?: Stall;
  onDismissStall?: () => void;
  /** Opens another exercise's logbook, from a swap option. */
  onExercise?: (key: string) => void;
}

const date = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

/** Pace per 500 m on a rower or ski erg, as their monitors show it; per km for anything else. */
export const paceOver = (group?: string) => (group === 'rower' ? 500 : 1000);

const chartLabel = (kind: LogKind, unit: string, per: number) =>
  kind === 'strength'
    ? `Estimated 1RM${unit ? ` · ${unit}` : ''}`
    : kind === 'load'
      ? unit === 'kph'
        ? 'Top speed · kph'
        : `Top load${unit ? ` · ${unit}` : ''}`
      : kind === 'reps'
        ? 'Most reps in a set'
        : kind === 'pace'
          ? `Fastest pace · per ${per === 500 ? '500 m' : 'km'}`
          : kind === 'distance'
            ? 'Furthest in a set · m'
            : kind === 'calories'
              ? 'Most calories in a set'
              : kind === 'time'
                ? 'Longest set'
                : 'Rounds per session';

const metricLabel = (m: ChartMetric, unit: string, per: number) => (m === 'volume' ? `Volume per session${unit ? ` · ${unit}` : ''}` : m === 'totalReps' ? 'Total reps per session' : chartLabel(m, unit, per));

/** A row of small toggle pills, each a 44px-tall tap. */
const Pills = <T extends string>({ label, options, value, onChange }: { label: string; options: [T, string][]; value: T; onChange: (v: T) => void }) => (
  <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1">
    {options.map(([v, text]) => (
      <button key={v} type="button" role="radio" aria-checked={v === value} onClick={() => onChange(v)} className="flex min-h-11 items-center">
        <span className={cn('rounded-pill px-2.5 py-1 text-[12px] font-bold', v === value ? 'bg-ink text-white' : 'bg-line-soft text-body')}>{text}</span>
      </button>
    ))}
  </div>
);

interface Tile {
  label: string;
  value: string;
  sub?: string;
}

/** The distances with a fastest time, the most done first: at most two tiles. */
const fastestTiles = (r: Records, done: Map<string, number>): Tile[] =>
  Object.entries(r.fastest ?? {})
    .sort((a, b) => (done.get(b[0]) ?? 0) - (done.get(a[0]) ?? 0) || Number(a[0]) - Number(b[0]))
    .slice(0, 2)
    .map(([m, rec]) => ({ label: `Fastest ${fmtNum(Number(m))} m`, value: fmtDur(rec.value), sub: date(rec.at) }));

/** What records mean for this kind of work. Timed work gets what exists rather than blanks. */
const tiles = (r: Records, unit: string, last?: string, done = new Map<string, number>()): Tile[] => {
  const u = unit ? ` ${unit}` : '';
  const t = (label: string, rec: Rec | undefined, value: (n: number) => string, withSet = false): Tile[] =>
    rec ? [{ label, value: value(rec.value), sub: [withSet && rec.set ? setLabel(rec.set) : '', date(rec.at)].filter(Boolean).join(' · ') }] : [];
  const sessions: Tile = { label: 'Sessions', value: `${r.sessions}`, ...(last ? { sub: `last ${date(last)}` } : {}) };
  if (r.kind === 'strength')
    return [...t('Heaviest', r.heaviest, n => `${fmtNum(n)}${u}`, true), ...t('Best est. 1RM', r.e1rm, n => `${fmtNum(n)}${u}`, true), ...t('Most reps', r.reps, n => fmtNum(n), true), ...t('Best volume', r.volume, n => `${fmtNum(Math.round(n))}${u}`)];
  if (r.kind === 'load') return [...t(unit === 'kph' ? 'Top speed' : 'Heaviest', r.heaviest, n => `${fmtNum(n)}${u}`), sessions];
  if (r.kind === 'reps') return [...t('Most reps', r.reps, n => fmtNum(n)), sessions];
  if (r.kind === 'pace') return [...fastestTiles(r, done), ...t('Furthest', r.distance, n => `${fmtNum(n)} m`, true), sessions].slice(0, 4);
  if (r.kind === 'distance') return [...t('Furthest', r.distance, n => `${fmtNum(n)} m`), sessions];
  if (r.kind === 'calories') return [...t('Most calories', r.calories, n => `${fmtNum(n)} cal`, true), sessions];
  if (r.kind === 'time') return [...t('Longest', r.longest, fmtDur), sessions];
  return [sessions];
};

/**
 * One exercise across every session: the clip and name, a line chart of the best set per session,
 * a stall card when the best has not moved in weeks, record tiles with the date each was set, then
 * the sessions newest first with their sets. A set that beat a record standing at the time carries
 * a small PR marker.
 */
export const ExerciseHistoryScreen = ({ exercise: ex, group, results, onBack, onSession, backLabel = 'Back', stall, onDismissStall, onExercise }: ExerciseHistoryScreenProps) => {
  const history = exerciseHistory(results, ex.key, ex.unit);
  const rec = records(results, ex.key, ex.unit);
  const unit = shortUnit(ex.unit);
  const per = paceOver(group);
  const metrics = chartMetrics(rec.kind);
  const [picked, setMetric] = useState<ChartMetric>(metrics[0]);
  const metric = metrics.includes(picked) ? picked : metrics[0];
  const [range, setRange] = useState<ChartRange>('all');
  const all = pointsFor(history, metric, per);
  const points = inRange(all, range, Date.now());
  // How often each distance was done, so the fastest-time tiles show the ones that matter.
  const done = new Map<string, number>();
  for (const x of history.flatMap(s => s.sets)) if (x.meters !== undefined && x.seconds !== undefined) done.set(String(Math.round(x.meters)), (done.get(String(Math.round(x.meters))) ?? 0) + 1);
  const timeAxis = metric === 'pace' || metric === 'time';
  return (
    <div className="flex h-full min-h-0 flex-col bg-canvas">
      <header className="safe-top shrink-0 bg-surface px-4 pt-2 pb-3">
        <Button variant="quiet" size="inline" onClick={onBack} className="-ml-1 text-muted">
          <ChevronLeft /> {backLabel}
        </Button>
        <div className="mt-1 flex items-center gap-3">
          <ClipThumb size="sm" clip={ex.clip} poster={ex.poster} icon={ex.icon ?? '🏋️'} />
          <h1 className="min-w-0 flex-1 text-[20px] leading-tight font-extrabold">{ex.name}</h1>
        </div>
      </header>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3">
        {history.length === 0 && <div className="py-10 text-center text-[13px] text-muted">Not logged yet. Finish a workout with it and it shows up here.</div>}
        {all.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-x-2">
            {metrics.length > 1 ? <Pills label="Chart shows" options={metrics.map(m => [m, METRIC_LABEL[m] ?? m])} value={metric} onChange={setMetric} /> : <span />}
            <Pills label="Range" options={(Object.keys(RANGE_LABEL) as ChartRange[]).map(r => [r, RANGE_LABEL[r]])} value={range} onChange={setRange} />
          </div>
        )}
        {points.length > 0 && <ProgressChart points={points} label={metricLabel(metric, unit, per)} format={timeAxis ? fmtDur : undefined} invert={metric !== 'volume' && metric !== 'totalReps' && lowerIsBetter(metric)} />}
        {all.length > 0 && points.length === 0 && <div className="rounded-card border border-line bg-surface px-3 py-4 text-center text-[13px] text-muted">No sessions in the last {range === '3m' ? '3 months' : 'year'}.</div>}
        {stall && onDismissStall && <StallCard stall={stall} onDismiss={onDismissStall} onExercise={onExercise} />}
        {history.length > 0 && (
          <div className="grid grid-cols-2 gap-2">
            {tiles(rec, unit, history[0]?.startedAt, done).map(t => (
              <div key={t.label} className="rounded-card border border-line bg-surface px-3 py-2.5">
                <div className="text-[11px] font-semibold text-muted">{t.label}</div>
                <div className="text-[20px] font-black tabular-nums">{t.value}</div>
                <div className="truncate text-[11px] text-muted">{t.sub ?? '\u00a0'}</div>
              </div>
            ))}
          </div>
        )}
        {history.length > 0 && <div className="px-1 pt-1 text-[11px] font-bold tracking-widest text-muted uppercase">Sessions</div>}
        {history.map(s => {
          const counted = s.sets.filter(x => setLabel(x, unit));
          const body = (
            <>
              <div className="flex items-baseline justify-between gap-2">
                <div className="min-w-0 truncate text-[14px] font-bold">{s.title}</div>
                <div className="shrink-0 text-[12px] text-muted">{date(s.startedAt)}</div>
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {counted.length === 0 && <span className="text-[13px] text-body">{s.sets.length} {s.sets.length === 1 ? 'round' : 'rounds'}</span>}
                {s.sets.map((x, i) =>
                  setLabel(x, unit) ? (
                    <span key={i} className="inline-flex items-center gap-1 rounded-pill bg-line-soft px-2 py-0.5 text-[13px] font-semibold tabular-nums">
                      {setLabel(x, unit)}
                      {s.prs[i] && <span className="rounded-pill bg-brand px-1 text-[9px] font-black tracking-wide text-white" aria-label="personal record">PR</span>}
                    </span>
                  ) : null
                )}
                {rec.kind === 'load' && counted.length > 1 && <span className="text-[12px] text-muted">{counted.length} rounds</span>}
                {s.incline !== undefined && <span className="text-[12px] text-muted">incline {fmtNum(s.incline)}%</span>}
              </div>
            </>
          );
          return onSession && s.id ? (
            <button key={s.id} type="button" onClick={() => onSession(s.id!)} className="block w-full rounded-card border border-line bg-surface px-3 py-2.5 text-left active:bg-line-soft">
              {body}
            </button>
          ) : (
            <div key={s.id ?? s.startedAt} className="rounded-card border border-line bg-surface px-3 py-2.5">
              {body}
            </div>
          );
        })}
      </div>
    </div>
  );
};
