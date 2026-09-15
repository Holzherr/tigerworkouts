import { Button } from '@/shared/components/ui/button';
import { fmtClock } from '@/shared/utils/ui-utils';
import type { ExerciseRef } from '@/features/runsheet/model';
import type { SessionResult } from '@/features/runsheet/progression';

export interface LogImportScreenProps {
  result: SessionResult | null;
  exercise: (key: string) => ExerciseRef;
  onSave: (r: SessionResult) => void;
  onDiscard: () => void;
}

const when = (iso: string) => new Date(iso).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/**
 * Landing for a "log this session" link: a workout done away from the timer, laid out for
 * checking before it joins History. The link carries the whole session, so nothing is fetched.
 */
export const LogImportScreen = ({ result: r, exercise, onSave, onDiscard }: LogImportScreenProps) => {
  if (!r)
    return (
      <div className="flex h-full flex-col items-center justify-center bg-canvas p-6 text-center">
        <h1 className="text-[18px] font-bold">This link didn't work</h1>
        <p className="mt-1 text-[13px] text-muted">Ask for it again.</p>
        <Button className="mt-4" variant="ghost" onClick={onDiscard}>
          Back
        </Button>
      </div>
    );
  return (
    <div className="mx-auto flex h-full w-full max-w-[420px] flex-col bg-canvas">
      <div className="flex-1 overflow-y-auto p-6">
        <div className="text-[11px] font-bold tracking-widest text-muted uppercase">Log this session</div>
        <h1 className="mt-2 text-[22px] font-extrabold">{r.title ?? 'Workout'}</h1>
        <div className="mt-1 text-[13px] text-muted">
          {when(r.startedAt)}
          {r.durationSec ? ` · ${fmtClock(r.durationSec)}` : ''}
          {r.completed === false ? ' · part of the workout' : ''}
        </div>
        <ul className="mt-5 flex flex-col gap-2">
          {r.steps.map((s, i) => {
            const ex = exercise(s.exerciseKey);
            return (
              <li key={`${s.stepId}-${i}`} className="flex items-baseline justify-between gap-3 rounded-card bg-surface px-4 py-3">
                <span className="text-[15px] font-semibold">{ex.name}</span>
                <span className="shrink-0 text-[13px] text-muted">
                  {s.target !== undefined ? `${s.target} ${ex.unit ?? 'kg'}` : '—'}
                  {s.incline !== undefined ? `, incline ${s.incline}` : ''}
                </span>
              </li>
            );
          })}
        </ul>
        {r.notes && <p className="mt-4 rounded-card bg-surface px-4 py-3 text-[13px] text-body">{r.notes}</p>}
      </div>
      <div className="flex gap-2 border-t border-line bg-surface p-4">
        <Button block onClick={() => onSave(r)}>
          Save to History
        </Button>
        <Button variant="ghost" onClick={onDiscard}>
          Not now
        </Button>
      </div>
    </div>
  );
};
