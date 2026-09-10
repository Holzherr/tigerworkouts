import { ChevronLeft, Copy, HeartPulse, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/shared/components/ui/button';
import { Chip } from '@/shared/components/ui/chip';
import { ClipThumb } from '@/shared/components/ui/clip-thumb';
import { StatTiles } from '@/shared/components/ui/stat-tiles';
import { fmtClock } from '@/shared/utils/ui-utils';
import { scoreType, type ExerciseRef, type Runsheet } from '@/features/runsheet/model';
import { fmtScore, type SessionResult } from '@/features/runsheet/progression';

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
}

const hr = (d: Record<string, unknown>) => {
  const n = (k: string) => (typeof d[k] === 'number' ? (d[k] as number) : undefined);
  return { avg: n('avg_hr') ?? n('avgHr') ?? n('heart_rate_avg'), max: n('max_hr') ?? n('maxHr') ?? n('heart_rate_max'), cal: n('calories') ?? n('kcal'), name: (d.name as string) ?? (d.activity as string) };
};

/**
 * One logged session: title, date and time, score and duration tiles, what was done per exercise
 * (load, reps, dropped), heart rate from a matched watch record when there is one, editable
 * date and notes, Repeat, and a Copy for pasting to a coach. Delete at the bottom.
 */
export const SessionDetailScreen = ({ result: r, runsheet, exercise, loadDevice, onBack, onChange, onDelete, onRepeat }: SessionDetailScreenProps) => {
  const [device, setDevice] = useState<ReturnType<typeof hr>[] | null>(null);
  useEffect(() => {
    let alive = true;
    loadDevice?.().then(rows => alive && setDevice(rows.map(x => hr(x.data)))).catch(() => alive && setDevice([]));
    return () => {
      alive = false;
    };
  }, [loadDevice]);
  const type = runsheet ? scoreType(runsheet) : 'none';
  const dur = r.durationSec ?? (r.activity ? r.activity.minutes * 60 : undefined);
  const text = [`${r.title ?? r.runsheetId} · ${r.startedAt.slice(0, 16).replace('T', ' ')}`, r.scoreText ? `Score: ${r.scoreText}` : '', dur ? `Duration: ${Math.round(dur / 60)} min` : '', ...r.steps.map(s => `- ${exercise(s.exerciseKey).name}: ${s.target !== undefined ? `${s.target} ${exercise(s.exerciseKey).unit}` : ''}${s.incline !== undefined ? `, incline ${s.incline}` : ''}${s.reps?.length ? ` × ${s.reps.join(', ')} reps` : ''}`), r.notes ? `Notes: ${r.notes}` : ''].filter(Boolean).join('\n');
  return (
    <div className="flex h-full min-h-0 flex-col bg-canvas">
      <header className="safe-top shrink-0 bg-surface px-4 pt-2 pb-3">
        <Button variant="quiet" size="inline" onClick={onBack} className="-ml-1 text-muted">
          <ChevronLeft /> History
        </Button>
        <h1 className="mt-1 text-[20px] leading-tight font-extrabold">{r.title ?? r.activity?.name ?? r.runsheetId}</h1>
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[13px] text-muted">
          <input type="datetime-local" value={r.startedAt.slice(0, 16)} onChange={e => e.target.value && onChange({ startedAt: new Date(e.target.value).toISOString() })} className="rounded-control border border-line bg-surface px-2 py-1 text-[14px] text-ink" aria-label="Date and time" />
          {r.completed === false && <Chip variant="warn">stopped early</Chip>}
          {r.activity?.intensity && <Chip variant="outline">{r.activity.intensity}</Chip>}
        </div>
      </header>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3">
        <StatTiles stats={[{ value: r.scoreText ?? (r.score !== undefined ? fmtScore(type, r.score) : '–'), label: type === 'none' ? 'score' : type }, { value: dur ? fmtClock(dur) : '–', label: 'duration' }, { value: device?.[0]?.avg ?? r.device?.avgHr ?? '–', label: 'avg HR' }]} />
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
        {r.steps.length > 0 && (
          <div className="overflow-hidden rounded-card border border-line bg-surface [&>*+*]:border-t [&>*+*]:border-line-soft">
            {r.steps.map(s => {
              const ex = exercise(s.exerciseKey);
              return (
                <div key={s.stepId} className="flex items-center gap-2.5 px-3 py-2">
                  <ClipThumb size="sm" clip={ex.clip} poster={ex.poster} icon={ex.icon ?? '🏋️'} />
                  <div className="min-w-0 flex-1 truncate text-[14px] font-semibold">{ex.name}</div>
                  <div className="text-[13px] tabular-nums">
                    {s.target !== undefined && ex.unit && ex.unit !== 'reps' ? `${s.target} ${ex.unit}` : ''}
                    {s.reps?.length ? `${s.target !== undefined && ex.unit && ex.unit !== 'reps' ? ' · ' : ''}${s.reps.join(', ')} reps` : ''}
                  </div>
                  {s.success === false && <Chip size="sm" variant="danger">missed</Chip>}
                </div>
              );
            })}
          </div>
        )}
        <textarea value={r.notes ?? ''} onChange={e => onChange({ notes: e.target.value || undefined })} placeholder="Notes" rows={3} className="w-full rounded-card border border-line bg-surface px-3 py-2 text-[16px] outline-none focus:border-hint" />
        <div className="flex gap-2">
          {onRepeat && (
            <Button block onClick={onRepeat}>
              Do it again
            </Button>
          )}
          <Button variant="ghost" onClick={() => navigator.clipboard?.writeText(text)}>
            <Copy /> Copy
          </Button>
        </div>
        <Button variant="danger" block onClick={() => confirm('Delete this session?') && onDelete()}>
          <Trash2 /> Delete session
        </Button>
      </div>
    </div>
  );
};
