import { ChevronRight, Target } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import { cn } from '@/shared/utils/ui-utils';
import type { Stall } from '../stall';

/**
 * One line of what to aim for today: a coral "Today" eyebrow with a target icon, the target in
 * bold ("Aim for 8+ rounds") and what it was read from underneath, muted ("Last 3 times: 7, 7, 8
 * rounds"). No border of its own; the host card frames it.
 */
export const TodayLine = ({ text, detail, className }: { text: string; detail?: string; className?: string }) => (
  <div className={cn('flex items-start gap-2', className)} aria-label="Today's target">
    <Target className="mt-0.5 size-4 shrink-0 text-brand" />
    <div className="min-w-0 flex-1">
      <div className="text-[13px] leading-snug">
        <span className="mr-1.5 text-[11px] font-bold tracking-widest text-brand-ink uppercase">Today</span>
        <span className="font-bold">{text}</span>
      </div>
      {detail && <div className="text-[12px] text-muted">{detail}</div>}
    </div>
  </div>
);

/**
 * The Up next card's one stall line: "Goblet squat · At 24 kg × 8 for 5 weeks · two options" in
 * muted text with a chevron, a button that opens where the options are.
 */
export const StallLine = ({ name, stall, onOpen }: { name?: string; stall: Stall; onOpen: () => void }) => (
  <button type="button" onClick={onOpen} className="flex w-full items-center gap-2 text-left text-[12px] text-muted" aria-label="Stall">
    <span className="min-w-0 flex-1 truncate">
      {name && <span className="font-semibold text-body">{name} · </span>}
      {stall.line} · <span className="font-semibold text-brand">two options</span>
    </span>
    <ChevronRight className="size-4 shrink-0 text-faint" />
  </button>
);

/**
 * A stall, in place: a soft card with "Stuck" in bold and the standing best ("At 24 kg × 8 for 5
 * weeks"), how many sessions have not beaten it, then the two options numbered, each a bold title
 * and a muted line — an option that is another exercise links to it. "Not now" bottom right
 * dismisses it for good.
 */
export const StallCard = ({ stall, onDismiss, onExercise }: { stall: Stall; onDismiss: () => void; onExercise?: (key: string) => void }) => (
  <section aria-label="Stall" className="rounded-card border border-line bg-surface px-3 py-2.5">
    <div className="text-[14px]">
      <span className="font-extrabold">Stuck.</span> {stall.line}
    </div>
    <div className="text-[12px] text-muted">{stall.sessions - 1} sessions since without a new best. Two ways out:</div>
    <ol className="mt-2 space-y-1.5">
      {stall.options.map((o, i) => (
        <li key={o.title} className="flex gap-2 text-[13px]">
          <span className="grid size-5 shrink-0 place-items-center rounded-full bg-brand-soft text-[11px] font-black text-brand-ink">{i + 1}</span>
          <div className="min-w-0 flex-1">
            {o.exerciseKey && onExercise ? (
              <button type="button" className="text-left font-bold text-brand" onClick={() => onExercise(o.exerciseKey!)}>
                {o.title}
              </button>
            ) : (
              <div className="font-bold">{o.title}</div>
            )}
            <div className="text-[12px] text-muted">{o.detail}</div>
          </div>
        </li>
      ))}
    </ol>
    <div className="mt-1 flex justify-end">
      <Button variant="quiet" size="inline" onClick={onDismiss}>
        Not now
      </Button>
    </div>
  </section>
);
