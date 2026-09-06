import { ChevronRight, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Chip } from '@/shared/components/ui/chip';
import { cn } from '@/shared/utils/ui-utils';
import type { Runsheet } from '@/features/runsheet/model';
import { WorkoutCard } from './workout-card';

export type DiscoverFilter = 'all' | 'mine' | 'benchmark' | 'program' | 'video' | 'article' | 'protocol';

const FILTERS: { id: DiscoverFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'mine', label: 'Mine' },
  { id: 'benchmark', label: 'Benchmarks' },
  { id: 'program', label: 'Programs' },
  { id: 'video', label: 'Videos' },
  { id: 'article', label: 'NHS' },
  { id: 'protocol', label: 'Protocols' },
];

export interface DiscoverScreenProps {
  workouts: Runsheet[];
  onOpen: (r: Runsheet) => void;
  /** Open a program's page (list of days). */
  onOpenProgram?: (name: string, days: Runsheet[]) => void;
  /** Ids of the user's own workouts, shown under "Mine". */
  mineIds?: Set<string>;
  initialFilter?: DiscoverFilter;
  header?: React.ReactNode;
}

/**
 * Discover: search field, a row of filter chips by source kind, then results. Programs collapse
 * into one row per program (name, day count, chevron) that opens the program page; everything
 * else is a WorkoutCard. Shows the first 60 matches with a "more" hint.
 */
export const DiscoverScreen = ({ workouts, onOpen, onOpenProgram, mineIds, initialFilter = 'all', header }: DiscoverScreenProps) => {
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<DiscoverFilter>(initialFilter);
  const [limit, setLimit] = useState(60);

  const { programs, singles } = useMemo(() => {
    const ql = q.trim().toLowerCase();
    const match = (r: Runsheet) => {
      if (filter === 'mine' && !mineIds?.has(r.id ?? '')) return false;
      if (filter !== 'all' && filter !== 'mine' && (r.source?.kind ?? 'user') !== filter) return false;
      if (!ql) return true;
      const hay = `${r.title} ${r.creator ?? ''} ${r.source?.author ?? ''} ${r.program?.name ?? ''} ${(r.tags ?? []).join(' ')} ${r.description ?? ''}`.toLowerCase();
      return hay.includes(ql);
    };
    const programs = new Map<string, Runsheet[]>();
    const singles: Runsheet[] = [];
    for (const r of workouts) {
      if (!match(r)) continue;
      if (r.program) (programs.get(r.program.name) ?? programs.set(r.program.name, []).get(r.program.name)!).push(r);
      else singles.push(r);
    }
    for (const list of programs.values()) list.sort((a, b) => (a.program?.order ?? 0) - (b.program?.order ?? 0));
    return { programs, singles };
  }, [workouts, q, filter, mineIds]);

  const shown = singles.slice(0, limit);
  return (
    <div className="flex h-full min-h-0 flex-col bg-canvas">
      <header className="safe-top shrink-0 bg-surface px-4 pt-3 pb-2">
        {header ?? <h1 className="text-[22px] font-extrabold">Discover</h1>}
        <label className="mt-2 flex h-11 items-center gap-2 rounded-tile border border-line bg-canvas px-3">
          <Search className="size-4 shrink-0 text-faint" />
          <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search workouts, programs, creators" className="min-w-0 flex-1 bg-transparent text-[16px] outline-none placeholder:text-faint" />
        </label>
        <div className="-mx-4 mt-2 flex gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
          {FILTERS.map(f => (
            <Chip key={f.id} variant={filter === f.id ? 'on' : 'outline'} onClick={() => setFilter(f.id)} className="shrink-0">
              {f.label}
            </Chip>
          ))}
        </div>
      </header>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-3">
        {[...programs.entries()].map(([name, days]) => (
          <button key={name} type="button" onClick={() => onOpenProgram?.(name, days)} className="flex w-full items-center gap-3 rounded-card border border-brand-line bg-brand-soft px-3 py-2.5 text-left active:bg-brand-line/40">
            <div className="min-w-0 flex-1">
              <div className="truncate text-[15px] font-bold">{name}</div>
              <div className="text-[12px] text-muted">
                Program · {days.length} {days.length === 1 ? 'session' : 'sessions'} · {days[0].source?.author ?? days[0].creator}
              </div>
            </div>
            <ChevronRight className="size-5 text-brand" />
          </button>
        ))}
        {shown.map(r => (
          <WorkoutCard key={r.id ?? r.title} runsheet={r} onOpen={onOpen} />
        ))}
        {singles.length > shown.length && (
          <button type="button" onClick={() => setLimit(l => l + 60)} className={cn('w-full py-3 text-center text-[13px] font-bold text-brand')}>
            Show more ({singles.length - shown.length} left)
          </button>
        )}
        {programs.size === 0 && singles.length === 0 && <div className="py-10 text-center text-[13px] text-muted">Nothing matches.</div>}
      </div>
    </div>
  );
};
