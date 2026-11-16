import { ChevronLeft, ChevronRight, Table2 } from 'lucide-react';
import { Fragment, useEffect, useRef } from 'react';
import { Button } from '@/shared/components/ui/button';
import { Switch } from '@/shared/components/ui/switch';
import { cn } from '@/shared/utils/ui-utils';
import type { WeekCell, WeekTable } from '../week-table';

const LABEL_W = 112;
const CELL_W = 92;

/** "9 Nov", a column's date. */
const dayMonth = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

/** The workout page's one line for the table: "Week by week", "4 sessions · last 9 Nov". Shown once
 * the workout has history. */
export const WeekByWeekRow = ({ table, onOpen }: { table: WeekTable; onOpen: () => void }) => {
  const n = table.columns.length;
  const last = table.columns.at(-1);
  return (
    <button type="button" data-testid="week-by-week" onClick={onOpen} className="flex min-h-11 w-full items-center gap-3 rounded-card border border-line bg-surface px-3 py-2.5 text-left active:bg-line-soft">
      <Table2 className="size-5 shrink-0 text-brand-ink" />
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-semibold">Week by week</span>
        <span className="block text-[12px] text-muted">
          {n} {n === 1 ? 'session' : 'sessions'}
          {last ? ` · last ${dayMonth(last.startedAt)}` : ''}
        </span>
      </span>
      <ChevronRight className="size-4 shrink-0 text-faint" />
    </button>
  );
};

const Cell = ({ cell, latest }: { cell: WeekCell | null; latest: boolean }) => (
  <td className={cn('h-[50px] border-t border-line-soft px-1 py-1 text-center align-middle', latest && 'bg-brand-soft')}>
    {cell ? (
      <>
        <div className={cn('truncate text-[13px] tabular-nums', latest ? 'font-bold' : 'font-semibold')}>{cell.text}</div>
        {cell.delta && <span className={cn('mt-0.5 inline-block rounded-md px-1.5 text-[11px] leading-tight font-bold tabular-nums', cell.better ? 'bg-brand text-white' : 'text-muted')}>
            {/* A load and a rep change go one under the other rather than breaking mid-change. */}
            {cell.delta.split(' · ').map(part => (
              <span key={part} className="block whitespace-nowrap">
                {part}
              </span>
            ))}
          </span>}
      </>
    ) : (
      <span className="text-[13px] text-faint">–</span>
    )}
  </td>
);

export interface WeekTableScreenProps {
  title: string;
  table: WeekTable;
  onBack: () => void;
  /** Opens an exercise across every workout, with its chart. */
  onExercise: (key: string) => void;
  /** Suggestions for this workout; `enabled` false when they are off for the whole account. */
  suggestions?: { on: boolean; enabled: boolean; onChange: (on: boolean) => void };
}

/**
 * The workout week by week (Priyanka via Nick, 15 Nov 2026): a row per exercise and set, a column
 * per session (Wk 1, Wk 2…), what was logged in each cell with the change since the column before,
 * the newest column highlighted. The labels stay put while the weeks scroll, and it opens on the
 * newest. A tap on an exercise opens it across every workout, with its chart. ProgressTableView on iOS.
 */
export const WeekTableScreen = ({ title, table, onBack, onExercise, suggestions }: WeekTableScreenProps) => {
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [table.columns.length]);
  const cols = table.columns;
  return (
    <div className="flex h-full min-h-0 flex-col bg-canvas">
      <header className="safe-top shrink-0 bg-surface px-4 pt-2 pb-3">
        <Button variant="quiet" onClick={onBack} className="-ml-3 gap-1 px-2 text-[13px] text-muted [&_svg]:size-4">
          <ChevronLeft /> Back
        </Button>
        <h1 className="mt-1 text-[22px] leading-tight font-extrabold">Week by week</h1>
        <div className="truncate text-[13px] text-muted">{title}</div>
      </header>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3">
        {table.rows.length === 0 ? (
          <p className="px-1 pt-6 text-[14px] text-muted">Nothing logged yet. Finish this workout once and every set shows up here, week by week.</p>
        ) : (
          <>
            <div ref={scroller} data-testid="week-table" className="overflow-x-auto rounded-card border border-line bg-surface">
              {/* Fixed columns, as on the phone. */}
              <table className="table-fixed border-separate border-spacing-0" style={{ width: LABEL_W + CELL_W * cols.length }}>
                <colgroup>
                  <col style={{ width: LABEL_W }} />
                  {cols.map(c => (
                    <col key={c.id} style={{ width: CELL_W }} />
                  ))}
                </colgroup>
                <thead>
                  <tr>
                    <th className="sticky left-0 z-10 bg-surface" />
                    {cols.map(c => (
                      <th key={c.id} scope="col" aria-current={c.latest ? 'true' : undefined} className={cn('h-11 px-1 text-center align-middle', c.latest && 'rounded-t-[10px] bg-brand-soft')}>
                        <div className={cn('text-[12px] font-extrabold', c.latest ? 'text-brand-ink' : 'text-ink')}>{c.label}</div>
                        <div className="text-[11px] font-normal text-muted">{dayMonth(c.startedAt)}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {table.rows.map(r => (
                    <Fragment key={r.id}>
                      {r.set === 0 && (
                        <tr>
                          {/* The name runs on over the weeks' empty cells rather than truncating. */}
                          <th scope="rowgroup" className="sticky left-0 z-10 h-11 bg-surface p-0 text-left">
                            <button type="button" onClick={() => onExercise(r.exerciseKey)} className="absolute inset-y-0 left-0 flex items-center gap-1 pr-2 pl-3 text-[14px] font-bold whitespace-nowrap">
                              {r.name} <ChevronRight className="size-3.5 text-faint" />
                            </button>
                          </th>
                          {cols.map(c => (
                            <td key={c.id} className={cn(c.latest && 'bg-brand-soft')} />
                          ))}
                        </tr>
                      )}
                      <tr>
                        <th scope="row" className="sticky left-0 z-10 border-t border-line-soft bg-surface pl-3 text-left text-[12px] font-normal text-muted">
                          Set {r.set + 1}
                        </th>
                        {r.cells.map((cell, i) => (
                          <Cell key={cols[i].id} cell={cell} latest={cols[i].latest} />
                        ))}
                      </tr>
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="px-1 text-[12px] text-muted">Change since the week before: coral is heavier or more reps. Tap an exercise for it across every workout.</p>
          </>
        )}
        {suggestions && (
          <div className="rounded-card border border-line bg-surface px-3 py-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[15px] font-semibold">Suggestions for this workout</span>
              <Switch aria-label="Suggestions for this workout" checked={suggestions.on} disabled={!suggestions.enabled} onChange={suggestions.onChange} />
            </div>
            <p className="mt-1 text-[12px] text-muted">{suggestions.enabled ? 'Off hides Today, the target on the timer, Next time and stall cards for this workout.' : 'Suggestions are off for your account. Turn them on in Me, Settings.'}</p>
          </div>
        )}
      </div>
    </div>
  );
};
