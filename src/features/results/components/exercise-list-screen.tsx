import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/shared/components/ui/button';
import { ClipThumb } from '@/shared/components/ui/clip-thumb';
import type { ExerciseRef } from '@/features/runsheet/model';
import type { SessionResult } from '@/features/runsheet/progression';
import { loggedExercises } from '../logbook';

export interface ExerciseListScreenProps {
  results: SessionResult[];
  exercise: (key: string) => ExerciseRef;
  onBack: () => void;
  onOpen: (exerciseKey: string) => void;
}

/** Every exercise you have logged, most recently done first, with a search box over the names. */
export const ExerciseListScreen = ({ results, exercise, onBack, onOpen }: ExerciseListScreenProps) => {
  const [q, setQ] = useState('');
  const all = loggedExercises(results).map(x => ({ ...x, ex: exercise(x.exerciseKey) }));
  const shown = q.trim() ? all.filter(x => x.ex.name.toLowerCase().includes(q.trim().toLowerCase())) : all;
  return (
    <div className="flex h-full min-h-0 flex-col bg-canvas">
      <header className="safe-top shrink-0 bg-surface px-4 pt-2 pb-3">
        <Button variant="quiet" size="inline" onClick={onBack} className="-ml-1 text-muted">
          <ChevronLeft /> History
        </Button>
        <h1 className="mt-1 text-[22px] font-extrabold">Exercises</h1>
        <label className="mt-2 flex items-center gap-2 rounded-control border border-line bg-canvas px-3">
          <Search className="size-4 text-faint" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search exercises" aria-label="Search exercises" className="h-10 min-w-0 flex-1 bg-transparent text-[16px] outline-none" />
        </label>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {all.length === 0 && <div className="py-10 text-center text-[13px] text-muted">Nothing logged yet.</div>}
        {all.length > 0 && shown.length === 0 && <div className="py-10 text-center text-[13px] text-muted">No logged exercise matches “{q}”.</div>}
        {shown.length > 0 && (
          <div className="overflow-hidden rounded-card border border-line bg-surface [&>*+*]:border-t [&>*+*]:border-line-soft">
            {shown.map(x => (
              <button key={x.exerciseKey} type="button" onClick={() => onOpen(x.exerciseKey)} className="flex w-full items-center gap-2.5 px-3 py-2 text-left active:bg-line-soft">
                <ClipThumb size="sm" clip={x.ex.clip} poster={x.ex.poster} icon={x.ex.icon ?? '🏋️'} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[14px] font-semibold">{x.ex.name}</div>
                  <div className="text-[12px] text-muted">
                    {x.sessions} {x.sessions === 1 ? 'session' : 'sessions'} · last {new Date(x.lastAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                  </div>
                </div>
                <ChevronRight className="size-4 shrink-0 text-faint" />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
