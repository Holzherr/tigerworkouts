import { ChevronDown, ChevronRight, ChevronUp } from 'lucide-react';
import { useState } from 'react';
import type { Today } from '@/features/runsheet/targets';
import { Button } from '@/shared/components/ui/button';
import type { Stall } from '../stall';

/** The reason without the "· 1 more on the workout page" tail: the others are listed under it. */
export const whyOf = (detail: string) => {
  const at = detail.lastIndexOf(' · ');
  return at >= 0 && detail.slice(at + 3).endsWith('on the workout page') ? detail.slice(0, at) : detail;
};

/**
 * Today's target in one line, "Today: Shoulder press 27.5 kg × 8 (+2.5 kg)", with the reasoning
 * and any other exercise's target behind a tap (Priyanka, 14 Nov 2026: the two-line version was
 * heavy and repeated the rows below). A program day that follows its own rule reads a line per
 * lift with the rule under them (review D16). No border of its own; the host card frames it.
 */
export const TodayLine = ({ today, className }: { today: Pick<Today, 'text' | 'detail' | 'delta' | 'sets' | 'rule'>; className?: string }) => {
  const [open, setOpen] = useState(false);
  const rest = today.sets.slice(1);
  // A program day that follows its own rule reads a line per lift, with the rule under them.
  const lines = !!today.rule;
  return (
    <div className={className} aria-label="Today's target">
      <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open} className="flex min-h-11 w-full items-center gap-2 py-1.5 text-left">
        <span className="min-w-0 flex-1 text-[14px] leading-snug font-bold">
          <span className="text-brand-ink">Today: </span>
          {today.text}
          {today.delta && <span className="text-brand-ink"> ({today.delta})</span>}
          {lines &&
            rest.map(t => (
              <span key={t.stepId} className="block">
                {t.name} {t.text}
                {t.delta && <span className="text-brand-ink"> ({t.delta})</span>}
              </span>
            ))}
          {lines && <span className="block text-[13px] font-normal text-muted">The program's rule: {today.rule}.</span>}
        </span>
        {open ? <ChevronUp className="size-4 shrink-0 text-faint" /> : <ChevronDown className="size-4 shrink-0 text-faint" />}
      </button>
      {open && (
        <div className="space-y-1 pb-2 text-[13px] text-muted" aria-label="Why">
          {lines ? (
            today.sets.map(t => (
              <div key={t.stepId}>
                {t.name}: {t.reason}
              </div>
            ))
          ) : (
            <>
              <div>{whyOf(today.detail)}</div>
              {rest.map(t => (
                <div key={t.stepId}>
                  {t.name} {t.text}
                  {t.delta ? ` (${t.delta})` : ''}: {t.reason}
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
};

/**
 * The Up next card's one stall line: "Goblet squat · At 24 kg × 8 for 5 weeks · two options" in
 * muted text with a chevron, a button that opens where the options are.
 */
export const StallLine = ({ name, stall, onOpen }: { name?: string; stall: Stall; onOpen: () => void }) => (
  <button type="button" onClick={onOpen} className="flex w-full items-center gap-2 text-left text-[12px] text-muted" aria-label="Stall">
    <span className="min-w-0 flex-1 truncate">
      {name && <span className="font-semibold text-body">{name} · </span>}
      {stall.line} · <span className="font-semibold text-brand-ink">two options</span>
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
              <button type="button" className="text-left font-bold text-brand-ink" onClick={() => onExercise(o.exerciseKey!)}>
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
