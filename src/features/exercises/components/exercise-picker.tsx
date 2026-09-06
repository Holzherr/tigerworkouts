import { Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '@/shared/components/ui/button';
import { ClipThumb } from '@/shared/components/ui/clip-thumb';
import { Dropdown } from '@/shared/components/ui/dropdown';
import { Sheet } from '@/shared/components/ui/sheet';
import { GROUP_LABEL, type ExerciseGroup, type LibraryExercise } from '../library';

export interface ExercisePickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  library: Record<string, LibraryExercise>;
  onPick: (ex: LibraryExercise) => void;
  /** Called when the user adds a custom exercise; the host stores it and it is picked immediately. */
  onCreate?: (ex: LibraryExercise) => void;
  /** Keys with usage counts, shown as "used in N workouts" and used for ordering. */
  usage?: Record<string, number>;
  title?: string;
}

const UNITS = [
  { value: 'kg', label: 'kg' },
  { value: 'kg per arm', label: 'kg per arm' },
  { value: 'kph', label: 'kph' },
  { value: '', label: 'bodyweight' },
] as const;
const GROUPS = (Object.keys(GROUP_LABEL) as ExerciseGroup[]).map(g => ({ value: g, label: GROUP_LABEL[g] }));

/**
 * Bottom sheet with a search field on top and the library grouped by equipment beneath, each row
 * a 36px thumb, name and unit. Typing filters; a name with no match offers "Add “X” as a new
 * exercise", which opens a small inline form (unit, group) and creates it.
 */
export const ExercisePicker = ({ open, onOpenChange, library, onPick, onCreate, usage = {}, title = 'Pick an exercise' }: ExercisePickerProps) => {
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState<{ name: string; unit: string; group: ExerciseGroup } | null>(null);
  const groups = useMemo(() => {
    const ql = q.trim().toLowerCase();
    const out = new Map<string, LibraryExercise[]>();
    for (const e of Object.values(library)) {
      if (ql && !e.name.toLowerCase().includes(ql) && !e.key.includes(ql.replace(/\s+/g, '_'))) continue;
      const g = GROUP_LABEL[e.group] ?? 'Other';
      (out.get(g) ?? out.set(g, []).get(g)!).push(e);
    }
    for (const list of out.values()) list.sort((a, b) => (usage[b.key] ?? 0) - (usage[a.key] ?? 0) || a.name.localeCompare(b.name));
    return [...out.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [library, q, usage]);
  const total = groups.reduce((t, [, l]) => t + l.length, 0);
  const pick = (e: LibraryExercise) => {
    onPick(e);
    onOpenChange(false);
    setQ('');
  };
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={title} height="88dvh">
      <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search 300+ exercises…" autoFocus autoComplete="off" className="h-11 w-full rounded-control border border-line bg-canvas px-3 text-[16px] outline-none focus:border-hint" />
      {creating ? (
        <form
          className="mt-3 space-y-2 rounded-card border border-line bg-canvas p-3"
          onSubmit={e => {
            e.preventDefault();
            const key = `u_${creating.name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')}`;
            const ex: LibraryExercise = { key, name: creating.name.trim(), unit: creating.unit, step: creating.unit === 'kph' ? 0.5 : creating.unit ? 2.5 : 1, group: creating.group, cue: '' };
            onCreate?.(ex);
            setCreating(null);
            pick(ex);
          }}
        >
          <div className="text-[14px] font-bold">New exercise</div>
          <input value={creating.name} onChange={e => setCreating({ ...creating, name: e.target.value })} required className="h-11 w-full rounded-control border border-line bg-surface px-3 text-[16px] outline-none" placeholder="Name" />
          <div className="flex gap-2">
            <Dropdown aria-label="Unit" value={creating.unit} options={UNITS} onValueChange={unit => setCreating({ ...creating, unit })} />
            <Dropdown aria-label="Group" value={creating.group} options={GROUPS} onValueChange={group => setCreating({ ...creating, group })} />
          </div>
          <div className="flex gap-2">
            <Button type="submit" block>
              Add and use
            </Button>
            <Button type="button" variant="ghost" onClick={() => setCreating(null)}>
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <>
          {groups.map(([g, list]) => (
            <section key={g}>
              <div className="px-1 pt-3 pb-1 text-[11px] font-bold tracking-widest text-muted uppercase">{g}</div>
              {list.map(e => (
                <button key={e.key} type="button" onClick={() => pick(e)} className="flex w-full items-center gap-3 rounded-control px-2 py-1.5 text-left active:bg-line-soft">
                  <ClipThumb size="sm" clip={e.clip} poster={e.poster} icon={e.icon ?? '🏋️'} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[15px]">{e.name}</div>
                    <div className="text-[11px] text-muted">
                      {e.unit || 'bodyweight'}
                      {usage[e.key] ? ` · in ${usage[e.key]} workouts` : ''}
                    </div>
                  </div>
                </button>
              ))}
            </section>
          ))}
          {q.trim() && onCreate && (
            <button type="button" onClick={() => setCreating({ name: q.trim(), unit: 'kg', group: 'body' })} className="mt-3 flex w-full items-center gap-3 rounded-card border border-dashed border-hint px-3 py-3 text-left text-[15px] text-body">
              <Plus className="size-5 text-brand" /> Add “{q.trim()}” as a new exercise
            </button>
          )}
          {total === 0 && !q.trim() && <div className="py-6 text-center text-[13px] text-muted">No exercises.</div>}
        </>
      )}
    </Sheet>
  );
};
