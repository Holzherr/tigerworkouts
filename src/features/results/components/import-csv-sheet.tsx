import { FileUp } from 'lucide-react';
import { useRef, useState } from 'react';
import { Button } from '@/shared/components/ui/button';
import { Sheet } from '@/shared/components/ui/sheet';
import type { LibraryExercise } from '@/features/exercises/library';
import type { SessionResult } from '@/features/runsheet/progression';
import { FORMAT_LABEL, parseWorkoutCsv, planImport, type ImportPlan } from '../csv';
import { setsOf } from '../logbook';

const when = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export interface ImportPreviewProps {
  plan: ImportPlan;
  exerciseName: (key: string) => string;
}

/**
 * What an import would add, before it does: the count, the sessions newest first with their
 * exercise and set counts, the exercises it will create, and what it is skipping as already there.
 */
export const ImportPreview = ({ plan, exerciseName }: ImportPreviewProps) => (
  <div className="space-y-4">
    <div>
      <div className="text-[11px] font-bold tracking-widest text-muted uppercase">{FORMAT_LABEL[plan.format]} export</div>
      <div className="mt-1 text-[18px] font-extrabold">{plan.sessions.length ? `${plural(plan.sessions.length, 'session')} to add` : 'Nothing new to add'}</div>
      {plan.duplicates.length > 0 && <div className="text-[13px] text-muted">{plural(plan.duplicates.length, 'session')} already in History, skipped</div>}
    </div>
    {plan.newExercises.length > 0 && (
      <div className="rounded-card border border-line bg-canvas px-3 py-2.5">
        <div className="text-[13px] font-semibold">New exercises ({plan.newExercises.length})</div>
        <div className="mt-0.5 text-[12px] text-muted">Not in the catalogue, so they become your own: {plan.newExercises.map(e => e.name).join(', ')}</div>
      </div>
    )}
    {plan.sessions.length > 0 && (
      <ul className="flex flex-col gap-1.5">
        {plan.sessions.map(s => {
          const sets = s.steps.reduce((n, x) => n + setsOf(x).length, 0);
          return (
            <li key={s.id} className="rounded-card bg-canvas px-3 py-2">
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate text-[14px] font-semibold">{s.title}</span>
                <span className="shrink-0 text-[12px] text-muted">{when(s.startedAt)}</span>
              </div>
              <div className="truncate text-[12px] text-muted">
                {plural(sets, 'set')} · {s.steps.map(x => exerciseName(x.exerciseKey)).join(', ')}
              </div>
            </li>
          );
        })}
      </ul>
    )}
  </div>
);

export interface ImportCsvSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** What is in History now, to skip what is already there. */
  results: SessionResult[];
  library: Record<string, LibraryExercise>;
  onImport: (plan: ImportPlan) => void;
  /** Shows a preview straight away; for stories. */
  initialPlan?: ImportPlan;
}

/**
 * Pick a Hevy or Strong CSV, see what it would add, then add it. Nothing is written until the
 * button at the bottom; sessions already in History (same day, same name) are skipped.
 */
export const ImportCsvSheet = ({ open, onOpenChange, results, library, onImport, initialPlan }: ImportCsvSheetProps) => {
  const file = useRef<HTMLInputElement>(null);
  const [plan, setPlan] = useState<ImportPlan | null>(initialPlan ?? null);
  const [error, setError] = useState<string | null>(null);
  const reset = () => (setPlan(null), setError(null));
  const read = async (f: File) => {
    const parsed = parseWorkoutCsv(await f.text());
    if ('error' in parsed) return (setPlan(null), setError(parsed.error));
    setError(null);
    setPlan(planImport(parsed, results, library));
  };
  return (
    <Sheet open={open} onOpenChange={o => (onOpenChange(o), o || reset())} title="Import history" height="88dvh">
      <div className="flex h-full min-h-0 flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto pb-3">
          {plan ? (
            <ImportPreview plan={plan} exerciseName={k => library[k]?.name ?? plan.newExercises.find(e => e.key === k)?.name ?? k} />
          ) : (
            <div className="space-y-3 text-[14px] text-body">
              <p>Bring in the workouts you logged in Hevy or Strong. Export them as CSV from that app first:</p>
              <ul className="list-disc space-y-1 pl-5 text-[13px] text-muted">
                <li>Hevy: Settings › Export &amp; Import Data › Export Workouts</li>
                <li>Strong: Settings › Export Strong Data</li>
              </ul>
              <p className="text-[13px] text-muted">Exercises are matched to the catalogue by name; anything else becomes your own exercise. A session already in History on the same day under the same name is skipped, so importing twice is safe.</p>
            </div>
          )}
          {error && <p className="mt-3 rounded-card bg-canvas px-3 py-2 text-[13px] text-danger">{error}</p>}
        </div>
        <input ref={file} type="file" accept=".csv,text/csv" hidden onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void read(f); }} />
        <div className="sticky bottom-0 flex gap-2 border-t border-line bg-surface pt-3">
          {plan && plan.sessions.length > 0 ? (
            <>
              <Button block onClick={() => (onImport(plan), onOpenChange(false), reset())}>
                Add {plural(plan.sessions.length, 'session')}
              </Button>
              <Button variant="ghost" onClick={() => file.current?.click()}>
                Other file
              </Button>
            </>
          ) : (
            <Button block onClick={() => file.current?.click()}>
              <FileUp /> Choose CSV file
            </Button>
          )}
        </div>
      </div>
    </Sheet>
  );
};
