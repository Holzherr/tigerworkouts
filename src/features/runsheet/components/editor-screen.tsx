import { ChevronLeft, ClipboardPaste, PenLine, Play, Save } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import { useState } from 'react';
import { Dropdown } from '@/shared/components/ui/dropdown';
import { Sheet } from '@/shared/components/ui/sheet';
import { Stepper } from '@/shared/components/ui/stepper';
import { WorkoutIcon } from '@/shared/components/ui/workout-icon';
import { useUndo } from '@/shared/components/ui/undo-toast';
import { fileToSquareDataUrl } from '@/shared/utils/image';
import { shuffleIcon } from '@/features/workouts/icon';
import { runsheetMinutes, scoreType, type ExerciseStep, type Item, type Runsheet, type ScoreType } from '../model';
import type { Equipment } from '../plates';

const SCORE_OPTIONS = [
  { value: 'auto', label: 'Auto' },
  { value: 'time', label: 'Time' },
  { value: 'rounds', label: 'Rounds + reps' },
  { value: 'reps', label: 'Total reps' },
  { value: 'load', label: 'Load' },
  { value: 'distance', label: 'Distance' },
  { value: 'none', label: 'Not scored' },
] as const;
const SCORE_LABEL: Record<ScoreType, string> = { time: 'for time', rounds: 'rounds + reps', reps: 'total reps', load: 'for load', distance: 'for distance', none: '' };
import { RunsheetList } from './runsheet-list';

export interface EditorScreenProps {
  runsheet: Runsheet;
  onChange: (runsheet: Runsheet) => void;
  onPickExercise: () => Promise<ExerciseStep | null>;
  onSwapExercise?: (step: ExerciseStep) => Promise<ExerciseStep | null>;
  onBack?: () => void;
  onReset?: () => void;
  /** Discard on the way out: throws the draft away and leaves. Defaults to `onBack`. */
  onDiscard?: () => void;
  /** Save on the way out: keeps it and leaves. Defaults to `onSaveAsMine`. */
  onSaveAndLeave?: () => void;
  onStart?: () => void;
  onSaveAsMine?: () => void;
  /** Opens the "Describe the workout" sheet. */
  onPastePlan?: () => void;
  /** Free-text change line ("press 20, half rests"); the host parses it. */
  onTextChange?: (text: string) => void;
  mode?: 'tonight' | 'author';
  resolveTarget?: (step: ExerciseStep) => number | undefined;
  /** Grey line under a collapsed exercise, e.g. "last time 57.5 × 8". */
  hintFor?: (step: ExerciseStep) => string | undefined;
  setHintFor?: (step: ExerciseStep, round: number) => string | undefined;
  /** Settings → My equipment, for the plate calculator in a set grid. */
  equipment?: Equipment;
  refTitle?: (runsheetId: string) => string | undefined;
  /** Seconds a new rest gets (Settings → Default rest). */
  autoRest?: number;
  /** Changes not saved yet: Back and Reset ask before throwing them away. */
  dirty?: boolean;
  /** The workout is already yours: Save as mine would save it in place, so it reads Save. */
  own?: boolean;
}

/**
 * Edit-before-start screen: white header with the workout title, "Tonight's version · 23 min ·
 * 4 blocks", Reset on the right and the free-text change line under it; the runsheet fills the
 * body; Start and Save as mine are pinned above the tab bar. In `author` mode (a new workout)
 * the title is an input and the pinned bar is Save workout + Start.
 */
export const EditorScreen = ({ runsheet, onChange, onPickExercise, onSwapExercise, onBack, onReset, onDiscard, onSaveAndLeave, onStart, onSaveAsMine, onPastePlan, onTextChange, mode = 'tonight', resolveTarget, hintFor, setHintFor, equipment, refTitle, autoRest, dirty, own }: EditorScreenProps) => {
  const setItems = (items: Item[]) => onChange({ ...runsheet, items });
  const minutes = runsheetMinutes(runsheet);
  const blocks = runsheet.items.filter(i => i.kind === 'block').length;
  const score = scoreType(runsheet);
  const [settings, setSettings] = useState(false);
  const undo = useUndo();
  // Back or Reset with something to lose asks in a sheet, as iOS does (review D9): Save, Discard or
  // Keep editing on the way out; Discard or Keep editing on Reset.
  const [leaving, setLeaving] = useState<'back' | 'reset' | null>(null);
  const discarding = (fn: (() => void) | undefined, why: 'back' | 'reset') => () => (dirty ? setLeaving(why) : fn?.());
  const saveLeaving = onSaveAndLeave ?? onSaveAsMine;
  return (
    <div className="flex h-full min-h-0 flex-col bg-canvas">
      <header className="safe-top shrink-0 border-b border-line bg-surface px-4 pb-2.5">
        <div className="flex items-center justify-between pt-2">
          <Button variant="quiet" size="inline" onClick={discarding(onBack, 'back')} className="-ml-1 text-muted">
            <ChevronLeft /> Back
          </Button>
          {onReset && (
            <Button variant="text" size="inline" onClick={discarding(onReset, 'reset')}>
              Reset
            </Button>
          )}
        </div>
        <input value={runsheet.title} onChange={e => onChange({ ...runsheet, title: e.target.value })} placeholder="Workout name" aria-label="Workout name" autoFocus={mode === 'author' && !runsheet.title} className="mt-1 w-full rounded-control bg-transparent text-[19px] leading-tight font-extrabold text-ink outline-none placeholder:text-faint focus:bg-canvas" />
        <button type="button" onClick={() => setSettings(x => !x)} className="mt-0.5 block text-left text-[12px] text-muted">
          {mode === 'tonight' ? "Tonight's version" : `By ${runsheet.creator || 'you'}`}
          {runsheet.items.length > 0 && (
            <>
              {' '}· <b className="text-ink">{minutes} min</b> · {blocks} {blocks === 1 ? 'block' : 'blocks'}
            </>
          )}
          {runsheet.timeCapSec ? ` · cap ${Math.round(runsheet.timeCapSec / 60)}:00` : ''}
          {score !== 'none' ? ` · ${SCORE_LABEL[score]}` : ''}
          <span className="text-faint"> {settings ? '▴' : '▾'}</span>
        </button>
        {settings && (
          <div className="mt-2 space-y-2 rounded-control bg-canvas p-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[14px]">Time cap <span className="text-muted">(min, whole workout)</span></span>
              <Stepper aria-label="Time cap" value={Math.round((runsheet.timeCapSec ?? 0) / 60)} min={0} max={120} onChange={m => onChange({ ...runsheet, timeCapSec: m ? m * 60 : undefined })} />
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-[14px]">Icon</span>
              <div className="flex items-center gap-2">
                <WorkoutIcon runsheet={runsheet} size={40} />
                <Button variant="ghost" size="sm" onClick={() => onChange({ ...runsheet, icon: shuffleIcon(runsheet.icon) })}>
                  Shuffle
                </Button>
                <label className="inline-flex h-9 cursor-pointer items-center rounded-control border border-line bg-surface px-3 text-[14px] font-semibold">
                  Photo
                  <input type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) fileToSquareDataUrl(f).then(url => onChange({ ...runsheet, icon: { kind: 'image', url } })); e.target.value = ''; }} />
                </label>
                {runsheet.icon && (
                  <Button variant="quiet" size="sm" onClick={() => onChange({ ...runsheet, icon: undefined })}>
                    Reset
                  </Button>
                )}
              </div>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-[14px]">Scored on</span>
              <Dropdown aria-label="Score" value={runsheet.score ?? 'auto'} options={SCORE_OPTIONS} onValueChange={v => onChange({ ...runsheet, score: v === 'auto' ? undefined : (v as ScoreType) })} />
            </div>
          </div>
        )}
        <label className="mt-2.5 flex h-11 items-center gap-2 rounded-tile border border-line bg-surface px-3 text-faint">
          <PenLine className="size-4 shrink-0" />
          <input
            type="text"
            placeholder="Type a change… “press 20, half rests, skip walk”"
            className="min-w-0 flex-1 bg-transparent text-[16px] text-ink outline-none placeholder:text-faint"
            onKeyDown={e => {
              if (e.key === 'Enter' && onTextChange) {
                onTextChange(e.currentTarget.value);
                e.currentTarget.value = '';
              }
            }}
          />
          {onPastePlan && (
            <Button variant="text" size="inline" onClick={onPastePlan} className="shrink-0">
              <ClipboardPaste /> Import
            </Button>
          )}
        </label>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pt-3 pb-28">
        <RunsheetList items={runsheet.items} onChange={setItems} onPickExercise={onPickExercise} onSwapExercise={onSwapExercise} resolveTarget={resolveTarget} hintFor={hintFor} setHintFor={setHintFor} equipment={equipment} refTitle={refTitle} autoRest={autoRest} onRemoved={(before, what) => undo.offer(what, () => onChange({ ...runsheet, items: before }))} />
        {undo.toast}
      </div>
      <div className="safe-bottom shrink-0 border-t border-line bg-surface p-3">
        <div className="flex gap-2">
          {mode === 'tonight' ? (
            <Button block onClick={onStart}>
              <Play /> Start · {minutes} min
            </Button>
          ) : (
            // A name is enough to keep it (Nick, 15 Nov 2026); Start still needs something to run.
            <Button block onClick={onSaveAsMine} disabled={!runsheet.items.length && !runsheet.title.trim()}>
              <Save /> Save workout
            </Button>
          )}
          {mode === 'tonight' ? (
            <Button variant="ghost" onClick={onSaveAsMine}>
              {own ? 'Save' : 'Save as mine'}
            </Button>
          ) : (
            onStart && (
              <Button variant="ghost" onClick={onStart} disabled={!runsheet.items.length}>
                <Play /> Start
              </Button>
            )
          )}
        </div>
      </div>
      <Sheet open={leaving !== null} onOpenChange={o => !o && setLeaving(null)} title={leaving === 'back' && saveLeaving ? 'Save this workout?' : 'Throw away your changes?'} height="auto" hideClose>
        <div className="space-y-2 pb-2">
          {leaving === 'back' && saveLeaving ? (
            <>
              <p className="pb-1.5 text-[14px] text-muted">Save keeps it in Mine. Discard deletes it.</p>
              <Button block size="lg" onClick={() => (setLeaving(null), saveLeaving())}>
                Save
              </Button>
            </>
          ) : null}
          <Button block size="lg" variant="ghost" className="border-danger text-danger" onClick={() => { const why = leaving; setLeaving(null); (why === 'reset' ? onReset : (onDiscard ?? onBack))?.(); }}>
            Discard
          </Button>
          <Button block size="lg" variant="quiet" className="text-ink" onClick={() => setLeaving(null)}>
            Keep editing
          </Button>
        </div>
      </Sheet>
    </div>
  );
};
