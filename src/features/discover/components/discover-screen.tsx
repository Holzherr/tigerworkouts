import { Bookmark, ChevronRight, Search, Sparkles } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Chip } from '@/shared/components/ui/chip';
import { EmptyState } from '@/shared/components/ui/empty-state';
import { SegmentedControl } from '@/shared/components/ui/segmented-control';
import type { Runsheet } from '@/features/runsheet/model';
import type { SessionResult } from '@/features/runsheet/progression';
import { recommend } from '../recommend';
import { WorkoutCard } from './workout-card';

export type DiscoverTab = 'saved' | 'recommended' | 'search';
export type DiscoverFilter = 'all' | 'benchmark' | 'program' | 'video' | 'article' | 'protocol';

const TABS = [
  { id: 'saved', label: 'Saved', icon: <Bookmark /> },
  { id: 'recommended', label: 'For you', icon: <Sparkles /> },
  { id: 'search', label: 'Search', icon: <Search /> },
] as const satisfies readonly { id: DiscoverTab; label: string; icon: React.ReactNode }[];
const FILTERS: { id: DiscoverFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'benchmark', label: 'Benchmarks' },
  { id: 'program', label: 'Programs' },
  { id: 'video', label: 'Videos' },
  { id: 'article', label: 'NHS' },
  { id: 'protocol', label: 'Protocols' },
];

export interface DiscoverScreenProps {
  workouts: Runsheet[];
  /** The user's logged sessions, newest first; drives "For you". */
  results?: SessionResult[];
  /** Ids the user saved, plus their own workouts, for the Saved tab. */
  savedIds?: string[];
  onOpen: (r: Runsheet) => void;
  onOpenProgram?: (name: string, days: Runsheet[]) => void;
  initialTab?: DiscoverTab;
  initialFilter?: DiscoverFilter;
  title?: string;
  /** Rendered at the top of For you (Resume banner, quick log). */
  above?: React.ReactNode;
}

const wid = (r: Runsheet) => r.id ?? r.title;
/** Consecutive cards with the same reason share one header. */
const groupRecs = (recs: ReturnType<typeof recommend>) => {
  const out: [string, ReturnType<typeof recommend>][] = [];
  for (const r of recs) {
    const last = out[out.length - 1];
    if (last && last[0] === r.reason) last[1].push(r);
    else out.push([r.reason, [r]]);
  }
  return out;
};

/**
 * Home feed with three tabs in a segmented control under the title. Saved: the user's own and
 * bookmarked workouts. For you: ranked recommendations from history, each card with a one-line
 * reason ("Next in StrongLifts 5×5", "Because you did Fran"). Search: the search field first;
 * with no query it shows filter chips and the full catalogue (programs collapsed to one row each),
 * with a query it shows matches only.
 */
export const DiscoverScreen = ({ workouts, results = [], savedIds = [], onOpen, onOpenProgram, initialTab = 'recommended', initialFilter = 'all', title = 'Discover', above }: DiscoverScreenProps) => {
  const [tab, setTab] = useState<DiscoverTab>(initialTab);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<DiscoverFilter>(initialFilter);
  const [limit, setLimit] = useState(60);

  const recs = useMemo(() => recommend(workouts, results, savedIds), [workouts, results, savedIds]);
  const saved = useMemo(() => {
    const set = new Set(savedIds);
    return workouts.filter(r => set.has(wid(r)) || (r.source?.kind ?? 'user') === 'user');
  }, [workouts, savedIds]);

  const { programs, singles } = useMemo(() => {
    const ql = q.trim().toLowerCase();
    const match = (r: Runsheet) => {
      if (!ql && filter !== 'all' && (r.source?.kind ?? 'user') !== filter) return false;
      if (!ql) return true;
      const hay = `${r.title} ${r.creator ?? ''} ${r.source?.author ?? ''} ${r.program?.name ?? ''} ${(r.tags ?? []).join(' ')} ${r.description ?? ''}`.toLowerCase();
      return hay.includes(ql);
    };
    const programs = new Map<string, Runsheet[]>();
    const singles: Runsheet[] = [];
    for (const r of workouts) {
      if (!match(r)) continue;
      if (r.program && !ql) (programs.get(r.program.name) ?? programs.set(r.program.name, []).get(r.program.name)!).push(r);
      else singles.push(r);
    }
    for (const list of programs.values()) list.sort((a, b) => (a.program?.order ?? 0) - (b.program?.order ?? 0));
    return { programs, singles };
  }, [workouts, q, filter]);

  const shown = singles.slice(0, limit);
  return (
    <div className="flex h-full min-h-0 flex-col bg-canvas">
      <header className="safe-top shrink-0 bg-surface px-4 pt-3 pb-2">
        <h1 className="text-[22px] font-extrabold">{title}</h1>
        <SegmentedControl aria-label="Feed" className="mt-2" options={TABS} value={tab} onChange={setTab} />
        {tab === 'search' && (
          <>
            <label className="mt-2 flex h-11 items-center gap-2 rounded-tile border border-line bg-canvas px-3">
              <Search className="size-4 shrink-0 text-faint" />
              <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search workouts, programs, creators" autoFocus className="min-w-0 flex-1 bg-transparent text-[16px] outline-none placeholder:text-faint" />
            </label>
            {!q.trim() && (
              <div className="-mx-4 mt-2 flex gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
                {FILTERS.map(f => (
                  <Chip key={f.id} variant={filter === f.id ? 'on' : 'outline'} onClick={() => setFilter(f.id)} className="shrink-0">
                    {f.label}
                  </Chip>
                ))}
              </div>
            )}
          </>
        )}
      </header>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-3">
        {tab === 'saved' && (
          <>
            {saved.map(r => (
              <WorkoutCard key={wid(r)} runsheet={r} onOpen={onOpen} />
            ))}
            {saved.length === 0 && <EmptyState icon={<Bookmark />} title="Nothing saved yet" body="Tap Save on any workout, or Save as mine after editing one." action={{ label: 'Browse workouts', onClick: () => setTab('search') }} />}
          </>
        )}

        {tab === 'recommended' && (
          <>
            {above}
            {results.length === 0 && <div className="px-1 pb-1 text-[12px] text-muted">Log a workout and this list learns what you like. Until then, some good first ones.</div>}
            {groupRecs(recs).map(([reason, list]) => (
              <section key={reason} className="space-y-2">
                <div className="flex items-center gap-1.5 px-1 pt-1 text-[12px] font-bold text-brand-ink">
                  <Sparkles className="size-3.5" /> {reason}
                </div>
                {list.map(rec => (
                  <WorkoutCard key={wid(rec.runsheet)} runsheet={rec.runsheet} onOpen={onOpen} />
                ))}
              </section>
            ))}
          </>
        )}

        {tab === 'search' && (
          <>
            {!q.trim() && (
              <div className="px-1 pb-1 text-[11px] font-bold tracking-widest text-muted uppercase">
                {filter === 'all' ? 'Everything' : FILTERS.find(f => f.id === filter)?.label} · {programs.size + singles.length}
              </div>
            )}
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
              <WorkoutCard key={wid(r)} runsheet={r} onOpen={onOpen} />
            ))}
            {singles.length > shown.length && (
              <button type="button" onClick={() => setLimit(l => l + 60)} className="w-full py-3 text-center text-[13px] font-bold text-brand">
                Show more ({singles.length - shown.length} left)
              </button>
            )}
            {programs.size === 0 && singles.length === 0 && <EmptyState title={`Nothing matches “${q}”`} body="Try a creator, a program name or an exercise." />}
          </>
        )}
      </div>
    </div>
  );
};
