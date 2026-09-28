import { Check, ChevronLeft, ChevronRight, Copy, HeartPulse, Pencil, Share2, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/shared/components/ui/button';
import { Chip } from '@/shared/components/ui/chip';
import { ClipThumb } from '@/shared/components/ui/clip-thumb';
import { StatTiles } from '@/shared/components/ui/stat-tiles';
import { FULL_LIBRARY as LIB } from '@/features/workouts/imported';
import { workedFrom } from '../effort';
import { SessionStats } from './session-stats';
import { fmtClock } from '@/shared/utils/ui-utils';
import { scoreType, type ExerciseRef, type Runsheet } from '@/features/runsheet/model';
import { fmtScore, type SessionResult } from '@/features/runsheet/progression';
import { celebrate } from '../celebrate';
import { shareCardData } from '../share-card';
import { EffortRow } from './effort-row';
import { ShareCardSheet } from './share-card-sheet';
import { editSet, rowKey } from '../edit-sets';
import { setLabel, setsOf } from '../logbook';
import { roundPRs } from '../rounds';
import { LoggedSets } from './logged-sets';
import { SplitsCard } from './splits-card';
import { fromLocalInput, toLocalInput } from '@/shared/utils/dates';

/** A new start time, with the end moved by the same amount so the duration holds. */
const moved = (r: SessionResult, startedAt: string): Partial<SessionResult> => {
  const shift = Date.parse(startedAt) - Date.parse(r.startedAt);
  return { startedAt, ...(r.endedAt ? { endedAt: new Date(Date.parse(r.endedAt) + shift).toISOString() } : {}) };
};

export interface SessionDetailScreenProps {
  result: SessionResult;
  runsheet?: Runsheet;
  exercise: (key: string) => ExerciseRef;
  /** Device rows (Fitbit / Google Health) overlapping the session; loaded by the host. */
  loadDevice?: () => Promise<{ source: string; data: Record<string, unknown> }[]>;
  onBack: () => void;
  onChange: (patch: Partial<SessionResult>) => void;
  onDelete: () => void;
  onRepeat?: () => void;
  /** Every session, for the streak line under the stats. */
  history?: SessionResult[];
  bodyweightKg?: number;
  /** Opens an exercise's history from its row. */
  onExercise?: (exerciseKey: string) => void;
}

const hr = (d: Record<string, unknown>) => {
  const n = (k: string) => (typeof d[k] === 'number' ? (d[k] as number) : undefined);
  return { avg: n('avg_hr') ?? n('avgHr') ?? n('heart_rate_avg'), max: n('max_hr') ?? n('maxHr') ?? n('heart_rate_max'), cal: n('calories') ?? n('kcal'), name: (d.name as string) ?? (d.activity as string) };
};

/**
 * One logged session: title, date and time, score and duration tiles, what was done per exercise
 * (load, reps, dropped), heart rate from a matched watch record when there is one, editable
 * date, duration, effort and notes, Repeat, the share card, and a Copy for pasting to a coach.
 * Delete at the bottom.
 */
export const SessionDetailScreen = ({ result: r, runsheet, exercise, loadDevice, onBack, onChange, onDelete, onRepeat, history = [], bodyweightKg, onExercise }: SessionDetailScreenProps) => {
  const [device, setDevice] = useState<ReturnType<typeof hr>[] | null>(null);
  const [sharing, setSharing] = useState(false);
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    let alive = true;
    loadDevice?.().then(rows => alive && setDevice(rows.map(x => hr(x.data)))).catch(() => alive && setDevice([]));
    return () => {
      alive = false;
    };
  }, [loadDevice]);
  const type = runsheet ? scoreType(runsheet) : 'none';
  const dur = r.durationSec ?? (r.activity ? r.activity.minutes * 60 : undefined);
  const text = [`${r.title ?? r.runsheetId} · ${toLocalInput(r.startedAt).replace('T', ' ')}`, r.scoreText ? `Score: ${r.scoreText}` : '', dur ? `Duration: ${Math.round(dur / 60)} min` : '', ...r.steps.map(s => `- ${exercise(s.exerciseKey).name}: ${setsOf(s).map(x => setLabel(x, exercise(s.exerciseKey).unit)).filter(Boolean).join(', ')}${s.incline !== undefined ? `, incline ${s.incline}` : ''}`), r.rpe ? `Effort: ${r.rpe}/10` : '', r.notes ? `Notes: ${r.notes}` : ''].filter(Boolean).join('\n');
  // The last time this workout was done, for the round times; and the block names they are under.
  const last = r.activity ? undefined : history.filter(x => x.runsheetId === r.runsheetId && !x.activity && x.startedAt < r.startedAt && x.id !== r.id).sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];
  const blockName = (id: string) => runsheet?.items.flatMap(i => (i.kind === 'block' && i.id === id ? [i.name] : []))[0];
  return (
    <div className="flex h-full min-h-0 flex-col bg-canvas">
      <header className="safe-top shrink-0 bg-surface px-4 pt-2 pb-3">
        <Button variant="quiet" size="inline" onClick={onBack} className="-ml-1 text-muted">
          <ChevronLeft /> History
        </Button>
        <h1 className="mt-1 text-[20px] leading-tight font-extrabold">{r.title ?? r.activity?.name ?? r.runsheetId}</h1>
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[13px] text-muted">
          <input type="datetime-local" value={toLocalInput(r.startedAt)} onChange={e => e.target.value && onChange(moved(r, fromLocalInput(e.target.value)))} className="rounded-control border border-line bg-surface px-2 py-1 text-[14px] text-ink" aria-label="Date and time" />
          {!r.activity && (
            <label className="flex items-center gap-1">
              <input type="number" inputMode="numeric" min={1} max={600} value={dur ? Math.round(dur / 60) : ''} onChange={e => { const m = Number(e.target.value); if (m > 0) onChange({ durationSec: m * 60, ...(r.endedAt ? { endedAt: new Date(Date.parse(r.startedAt) + m * 60_000).toISOString() } : {}) }); }} className="w-16 rounded-control border border-line bg-surface px-2 py-1 text-[14px] text-ink tabular-nums" aria-label="Duration in minutes" />
              min
            </label>
          )}
          {r.completed === false && <Chip variant="warn">stopped early</Chip>}
          {r.activity?.intensity && <Chip variant="outline">{r.activity.intensity}</Chip>}
        </div>
      </header>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3">
        <StatTiles stats={[{ value: r.scoreText ?? (r.score !== undefined ? fmtScore(type, r.score) : '–'), label: type === 'none' ? 'score' : type }, { value: dur ? fmtClock(dur) : '–', label: 'duration' }, { value: device?.[0]?.avg ?? r.device?.avgHr ?? '–', label: 'avg HR' }]} />
        <SessionStats result={r} worked={workedFrom(r, runsheet, k => ({ name: exercise(k).name, group: LIB[k]?.group }))} history={history} bodyweightKg={bodyweightKg} />
        {device && device.length > 0 && (
          <div className="flex items-center gap-2 rounded-card border border-line bg-surface px-3 py-2 text-[13px]">
            <HeartPulse className="size-4 text-brand" />
            <span className="text-body">
              {device[0].name ?? 'Watch'}: {device[0].avg ? `avg ${device[0].avg}` : ''}
              {device[0].max ? ` · max ${device[0].max}` : ''}
              {device[0].cal ? ` · ${device[0].cal} kcal` : ''}
            </span>
          </div>
        )}
        <SplitsCard result={r} last={last} blockName={blockName} records={roundPRs(r, history)} />
        {r.steps.length > 0 && (
          <section aria-label="Sets" className="overflow-hidden rounded-card border border-line bg-surface">
            <div className="flex items-center justify-between border-b border-line-soft px-3 py-1.5">
              <span className="text-[11px] font-bold tracking-widest text-muted uppercase">Sets</span>
              <Button variant="quiet" size="inline" onClick={() => setEditing(e => !e)} aria-pressed={editing}>
                {editing ? <Check /> : <Pencil />} {editing ? 'Done' : 'Edit sets'}
              </Button>
            </div>
            <div className="[&>*+*]:border-t [&>*+*]:border-line-soft">
              {r.steps.map(s => {
                const ex = exercise(s.exerciseKey);
                const Head = onExercise && !editing ? 'button' : 'div';
                return (
                  <div key={rowKey(s)} className="px-3 py-2">
                    <Head {...(onExercise && !editing ? { type: 'button' as const, onClick: () => onExercise(s.exerciseKey) } : {})} className="flex w-full items-center gap-2.5 pb-1.5 text-left">
                      <ClipThumb size="sm" clip={ex.clip} poster={ex.poster} icon={ex.icon ?? '🏋️'} />
                      <div className="min-w-0 flex-1 truncate text-[14px] font-semibold">{ex.name}</div>
                      {s.incline !== undefined && <span className="text-[12px] text-muted">incline {s.incline}</span>}
                      {s.success === false && <Chip size="sm" variant="danger">missed</Chip>}
                      {onExercise && !editing && <ChevronRight className="size-4 shrink-0 text-faint" />}
                    </Head>
                    <LoggedSets row={s} exercise={ex} editing={editing} onEdit={(i, patch) => onChange({ steps: editSet(r, rowKey(s), i, patch).steps })} />
                  </div>
                );
              })}
            </div>
          </section>
        )}
        <EffortRow value={r.rpe} onChange={rpe => onChange({ rpe })} />
        <textarea value={r.notes ?? ''} onChange={e => onChange({ notes: e.target.value || undefined })} placeholder="Notes" rows={3} className="w-full rounded-card border border-line bg-surface px-3 py-2 text-[16px] outline-none focus:border-hint" />
        <div className="flex gap-2">
          {onRepeat && (
            <Button block onClick={onRepeat}>
              Do it again
            </Button>
          )}
          <Button variant="ghost" onClick={() => setSharing(true)} aria-label="Share card">
            <Share2 />
          </Button>
          <Button variant="ghost" onClick={() => navigator.clipboard?.writeText(text)}>
            <Copy /> Copy
          </Button>
        </div>
        {sharing && <ShareCardSheet open={sharing} onOpenChange={setSharing} data={shareCardData(r, celebrate(r, history), type, k => exercise(k))} />}
        <Button variant="danger" block onClick={() => confirm('Delete this session?') && onDelete()}>
          <Trash2 /> Delete session
        </Button>
      </div>
    </div>
  );
};
