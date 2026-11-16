import { Check } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/shared/components/ui/button';
import { Sheet } from '@/shared/components/ui/sheet';
import { cn } from '@/shared/utils/ui-utils';
import type { ProgressMode } from '@/features/runsheet/targets';
import { answered, PROGRESS_MODES, suggestEnabled, type SuggestPrefs } from '../suggestions';

const Option = ({ label, note, on, onClick }: { label: string; note: string; on?: boolean; onClick: () => void }) => (
  <button type="button" role={on === undefined ? undefined : 'radio'} aria-checked={on} onClick={onClick} className={cn('flex min-h-11 w-full items-center gap-3 rounded-control border bg-surface px-3 py-2.5 text-left active:bg-line-soft', on ? 'border-ink' : 'border-line')}>
    <span className="min-w-0 flex-1">
      <span className="block text-[15px] font-bold">{label}</span>
      <span className="block text-[13px] text-muted">{note}</span>
    </span>
    {on && <Check className="size-5 shrink-0" />}
  </button>
);

export interface SuggestSheetProps {
  open: boolean;
  /** Closed without an answer: nothing is stored, and the question comes again. */
  onOpenChange: (open: boolean) => void;
  prefs?: SuggestPrefs;
  onChange: (prefs: SuggestPrefs) => void;
  /** `ask`: the one-time setup question, Yes / No then reps, weight or effort. `change`: the same
   * choice as one list (Off, Reps, Weight, Effort), from the timer's ⋯ menu. */
  mode: 'ask' | 'change';
}

/**
 * How to progress, asked once per account before a workout with a loaded lift starts ("Want
 * suggestions on how to progress?"), and changeable from the timer's ⋯ menu (Nick, review D1).
 * No turns suggestions off; Yes asks reps, weight or effort.
 */
export const SuggestSheet = ({ open, onOpenChange, prefs, onChange, mode }: SuggestSheetProps) => {
  const [choosing, setChoosing] = useState(false);
  const pick = (m: ProgressMode) => (setChoosing(false), onChange(answered(prefs, true, m)));
  const current = suggestEnabled(prefs) ? (prefs?.mode ?? 'reps') : undefined;
  return (
    <Sheet open={open} onOpenChange={o => (!o && setChoosing(false), onOpenChange(o))} title={mode === 'change' ? 'Suggestions' : choosing ? 'Progress by reps, weight or effort?' : 'Want suggestions on how to progress?'} height="auto">
      {mode === 'change' ? (
        <div className="space-y-2 pt-1 pb-2" role="radiogroup" aria-label="Suggestions">
          {PROGRESS_MODES.map(m => (
            <Option key={m.id} label={`By ${m.label.toLowerCase()}`} note={m.note} on={current === m.id} onClick={() => pick(m.id)} />
          ))}
          <Option label="Off" note="No Today targets, no target on the timer, no Next time and no stall cards." on={current === undefined} onClick={() => onChange(answered(prefs, false))} />
        </div>
      ) : choosing ? (
        <div className="space-y-2 pt-1 pb-2">
          {PROGRESS_MODES.map(m => (
            <Option key={m.id} label={m.label} note={m.note} onClick={() => pick(m.id)} />
          ))}
        </div>
      ) : (
        <div className="space-y-3 pt-1 pb-2">
          <p className="text-[14px] text-body">A target for each lift, from what you did last time. Change it any time in Me, Settings.</p>
          <div className="flex gap-2">
            <Button block variant="dark" onClick={() => setChoosing(true)}>
              Yes
            </Button>
            <Button block variant="ghost" onClick={() => onChange(answered(prefs, false))}>
              No
            </Button>
          </div>
        </div>
      )}
    </Sheet>
  );
};
