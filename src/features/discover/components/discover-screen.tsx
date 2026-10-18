import { Bookmark, ChevronRight, Play, Plus, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Chip } from '@/shared/components/ui/chip';
import { EmptyState } from '@/shared/components/ui/empty-state';
import { cn } from '@/shared/utils/ui-utils';
import { runsheetMinutes, type Runsheet } from '@/features/runsheet/model';
import type { SessionResult } from '@/features/runsheet/progression';
import { recommend } from '../recommend';
import { contentsLine, lastDoneById, lastDoneOf, mineLine, mineList, newBadge, upNextOf, whyLine } from '../mine';

export type DiscoverTab = 'mine' | 'discover';
/** The list a workout was tapped in, recorded on the session it starts. */
export type DiscoverOrigin = 'saved' | 'recommended' | 'search' | 'coach';
export type DiscoverFilter = 'all' | 'coach' | 'benchmark' | 'program' | 'video' | 'article' | 'protocol';

const TABS: { id: DiscoverTab; label: string }[] = [
  { id: 'mine', label: 'Mine' },
  { id: 'discover', label: 'Discover' },
];
const FILTERS: { id: DiscoverFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'coach', label: 'Coaches' },
  { id: 'benchmark', label: 'Benchmarks' },
  { id: 'program', label: 'Programs' },
  { id: 'video', label: 'Videos' },
  { id: 'article', label: 'NHS' },
  { id: 'protocol', label: 'Protocols' },
];

/** A workout a coach sent, as Mine lists it. */
export interface FromCoachRow {
  id: string;
  runsheet: Runsheet;
  coachName: string;
  done: boolean;
}

export interface DiscoverScreenProps {
  workouts: Runsheet[];
  /** The user's logged sessions, newest first; drives Mine's order and the For you picks. */
  results?: SessionResult[];
  /** Ids the user saved, for Mine. */
  savedIds?: string[];
  /** Ids of the user's own workouts, for Mine. */
  ownIds?: string[];
  /** What a coach sent, listed first on Mine. */
  fromCoach?: FromCoachRow[];
  /** `from` is the list the row was in, so the session can record where it was started. */
  onOpen: (r: Runsheet, from: DiscoverOrigin) => void;
  /** Runs a Mine row now, skipping the workout page. */
  onStart?: (r: Runsheet, from: DiscoverOrigin) => void;
  onOpenProgram?: (name: string, days: Runsheet[]) => void;
  /** Start a new workout from scratch: the round + top right. */
  onCreate?: () => void;
  initialTab?: DiscoverTab;
  initialFilter?: DiscoverFilter;
  title?: string;
  /** Rendered at the top of the list: the Resume banner for a session left running. */
  above?: React.ReactNode;
}

const wid = (r: Runsheet) => r.id ?? r.title;
/** Consecutive picks with the same reason share one header. */
const groupRecs = (recs: ReturnType<typeof recommend>) => {
  const out: [string, ReturnType<typeof recommend>][] = [];
  for (const r of recs) {
    const last = out[out.length - 1];
    if (last && last[0] === r.reason) last[1].push(r);
    else out.push([r.reason, [r]]);
  }
  return out;
};
/** "20 min · CrossFit", "45 min · StrongLifts 5×5 · Workout A". */
const about = (r: Runsheet) => [`${runsheetMinutes(r)} min`, r.program ? `${r.program.name} · ${r.program.day}` : (r.source?.author ?? r.creator)].filter(Boolean).join(' · ');

/**
 * One workout as a card: name and one meta line open its page; with `onStart`, a round coral play
 * starts it. On Mine a card says more, a line each (Nick, 18 Oct 2026): a New badge until it is
 * first done, with the description's first sentence under the title; what is in it; then the
 * meta. `upNext` gives the one card to do next a light coral edge and an "Up next" label.
 */
const Row = ({ runsheet: r, meta, coach, badge, why, contents, upNext, onOpen, onStart }: { runsheet: Runsheet; meta: string; coach?: boolean; badge?: string; why?: string; contents?: string; upNext?: boolean; onOpen: () => void; onStart?: () => void }) => (
  <div className={cn('flex items-center gap-2 rounded-card border bg-surface pr-2', upNext ? 'border-brand-line' : 'border-line')} data-up-next={upNext || undefined}>
    <button type="button" onClick={onOpen} className="flex min-h-14 min-w-0 flex-1 items-center gap-2 py-2.5 pl-4 text-left">
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="block truncate text-[15px] font-bold">{r.title}</span>
        {/* Drawn above the title, read after it: the card is named by its title. */}
        {(badge || upNext) && (
          <span className="order-first mb-0.5 flex items-center gap-1.5 text-[11px] font-bold">
            {upNext && <span className="text-brand-ink">Up next</span>}
            {badge && <span className="rounded-full bg-brand-soft px-2 py-px text-brand-ink">{badge}</span>}
          </span>
        )}
        {why && <span className="block truncate text-[12px] text-body">{why}</span>}
        {contents && <span className="block truncate text-[12px] text-body">{contents}</span>}
        {meta && <span className={cn('block truncate text-[12px]', coach ? 'font-semibold text-brand-ink' : 'text-muted')}>{meta}</span>}
      </span>
      {!onStart && <ChevronRight className="size-4 shrink-0 text-faint" />}
    </button>
    {onStart && (
      <button type="button" onClick={onStart} aria-label={`Start ${r.title}`} className="grid size-11 shrink-0 place-items-center rounded-full bg-brand text-white active:bg-brand-hover">
        <Play className="size-5 translate-x-px fill-current" />
      </button>
    )}
  </div>
);

/**
 * Home, plain (Nick, 17 Oct 2026, after Priyanka found it too busy): large "Workouts" title with a
 * round + for New workout, a search field, then two pill tabs. Mine (default): what a coach sent,
 * then your own and saved workouts, last done or made first, each a card with a coral play.
 * Discover: kind chips, the For you picks under their reasons while no chip is on, then the
 * catalogue (programs collapsed to one row each). A search lists matches from everything.
 */
export const DiscoverScreen = ({ workouts, results = [], savedIds = [], ownIds = [], fromCoach = [], onOpen, onStart, onOpenProgram, onCreate, initialTab = 'mine', initialFilter = 'all', title = 'Workouts', above }: DiscoverScreenProps) => {
  const [tab, setTab] = useState<DiscoverTab>(initialTab);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<DiscoverFilter>(initialFilter);
  const [limit, setLimit] = useState(60);
  const searching = !!q.trim();

  const recs = useMemo(() => recommend(workouts, results, savedIds), [workouts, results, savedIds]);
  const last = useMemo(() => lastDoneById(results), [results]);
  // Not yet done first, as the From your coach section had them.
  const coachRows = useMemo(() => [...fromCoach].sort((a, b) => Number(a.done) - Number(b.done)), [fromCoach]);
  const mine = useMemo(() => mineList(workouts, ownIds, savedIds, results, coachRows.map(c => wid(c.runsheet))), [workouts, ownIds, savedIds, results, coachRows]);
  const own = useMemo(() => new Set(ownIds), [ownIds]);
  // One card to do next: what a coach sent and is not done, else Mine's own pick.
  const upNext = coachRows.find(c => !c.done)?.id ?? upNextOf(mine, ownIds, last);

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
      // A copy is a version of something in the catalogue, not new content: the catalogue lists the original.
      if (r.copyOf || !match(r)) continue;
      if (r.program && !ql) (programs.get(r.program.name) ?? programs.set(r.program.name, []).get(r.program.name)!).push(r);
      else singles.push(r);
    }
    for (const list of programs.values()) list.sort((a, b) => (a.program?.order ?? 0) - (b.program?.order ?? 0));
    return { programs, singles };
  }, [workouts, q, filter]);

  const shown = singles.slice(0, limit);
  const catalogue = (
    <>
      {!searching && (
        <div className="px-1 pt-1 text-[11px] font-bold tracking-widest text-muted uppercase">
          {filter === 'all' ? 'Everything' : FILTERS.find(f => f.id === filter)?.label} · {programs.size + singles.length}
        </div>
      )}
      {[...programs.entries()].map(([name, days]) => (
        <button key={name} type="button" onClick={() => onOpenProgram?.(name, days)} className="flex min-h-14 w-full items-center gap-2 rounded-card border border-line bg-surface py-2.5 pr-3 pl-4 text-left active:bg-line-soft">
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[15px] font-bold">{name}</span>
            <span className="block truncate text-[12px] text-muted">
              Program · {days.length} {days.length === 1 ? 'session' : 'sessions'} · {days[0].source?.author ?? days[0].creator}
            </span>
          </span>
          <ChevronRight className="size-4 shrink-0 text-faint" />
        </button>
      ))}
      {shown.map(r => (
        <Row key={wid(r)} runsheet={r} meta={about(r)} onOpen={() => onOpen(r, 'search')} />
      ))}
      {singles.length > shown.length && (
        <button type="button" onClick={() => setLimit(l => l + 60)} className="w-full py-3 text-center text-[13px] font-bold text-brand">
          Show more ({singles.length - shown.length} left)
        </button>
      )}
      {programs.size === 0 && singles.length === 0 && <EmptyState title={searching ? `Nothing matches “${q}”` : 'Nothing here yet'} body="Try a creator, a program name or an exercise." />}
    </>
  );

  return (
    <div className="flex h-full min-h-0 flex-col bg-canvas">
      <header className="safe-top shrink-0 bg-surface px-4 pt-3 pb-3">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-[30px] leading-tight font-extrabold">{title}</h1>
          {onCreate && (
            <button type="button" onClick={onCreate} aria-label="New workout" className="grid size-11 shrink-0 place-items-center rounded-full bg-brand-soft text-brand-ink active:bg-brand-line/40">
              <Plus className="size-5" strokeWidth={2.5} />
            </button>
          )}
        </div>
        <label className="mt-2 flex h-11 items-center gap-2 rounded-tile border border-line bg-canvas px-3">
          <Search className="size-4 shrink-0 text-faint" />
          <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search" aria-label="Search" className="min-w-0 flex-1 bg-transparent text-[16px] outline-none placeholder:text-faint" />
        </label>
        {!searching && (
          <div role="tablist" aria-label="Lists" className="mt-3 flex gap-2">
            {TABS.map(t => (
              <Chip key={t.id} role="tab" aria-selected={tab === t.id} variant={tab === t.id ? 'on' : 'outline'} onClick={() => setTab(t.id)} className="h-11 px-5 text-[15px]">
                {t.label}
              </Chip>
            ))}
          </div>
        )}
      </header>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-3">
        {above}
        {searching && catalogue}

        {!searching && tab === 'mine' && (
          <>
            {coachRows.map(c => (
              <Row key={c.id} runsheet={c.runsheet} coach badge={c.done ? undefined : 'New · made for you'} why={c.done ? undefined : whyLine(c.runsheet)} contents={contentsLine(c.runsheet)} upNext={c.id === upNext} meta={`${runsheetMinutes(c.runsheet)} min · from ${c.coachName}${c.done ? ' · done' : ''}`} onOpen={() => onOpen(c.runsheet, 'coach')} onStart={onStart && (() => onStart(c.runsheet, 'coach'))} />
            ))}
            {mine.map(r => {
              const done = lastDoneOf(r, last);
              const fresh = !done && own.has(wid(r));
              return <Row key={wid(r)} runsheet={r} badge={fresh ? newBadge(r) : undefined} why={fresh ? whyLine(r) : undefined} contents={contentsLine(r)} upNext={wid(r) === upNext} meta={mineLine(r, done)} onOpen={() => onOpen(r, 'saved')} onStart={onStart && (() => onStart(r, 'saved'))} />;
            })}
            {coachRows.length === 0 && mine.length === 0 && <EmptyState icon={<Bookmark />} title="No workouts yet" body="Write your own with +, or save one from Discover." action={{ label: 'Discover workouts', onClick: () => setTab('discover') }} />}
          </>
        )}

        {!searching && tab === 'discover' && (
          <>
            <div className="-mx-3 flex gap-1.5 overflow-x-auto px-3 pb-1 [scrollbar-width:none]">
              {FILTERS.map(f => (
                <Chip key={f.id} variant={filter === f.id ? 'on' : 'outline'} onClick={() => setFilter(f.id)} className="h-11 shrink-0 px-4">
                  {f.label}
                </Chip>
              ))}
            </div>
            {filter === 'all' &&
              groupRecs(recs).map(([reason, list]) => (
                <section key={reason} aria-label={reason} className="space-y-2">
                  <div className="px-1 pt-1 text-[12px] font-bold text-brand-ink">{reason}</div>
                  {list.map(rec => (
                    <Row key={wid(rec.runsheet)} runsheet={rec.runsheet} meta={about(rec.runsheet)} onOpen={() => onOpen(rec.runsheet, 'recommended')} />
                  ))}
                </section>
              ))}
            {catalogue}
          </>
        )}
      </div>
    </div>
  );
};
