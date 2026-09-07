import { ChevronLeft, ClipboardPaste, PenLine, Play, Save } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import { useState } from 'react';
import { Dropdown } from '@/shared/components/ui/dropdown';
import { Stepper } from '@/shared/components/ui/stepper';
import { WorkoutIcon } from '@/shared/components/ui/workout-icon';
import { fileToSquareDataUrl } from '@/shared/utils/image';
import { shuffleIcon } from '@/features/workouts/icon';
import { runsheetMinutes, scoreType, type ExerciseStep, type Item, type Runsheet, type ScoreType } from '../model';

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
  onStart?: () => void;
  onSaveAsMine?: () => void;
  /** Opens the "Describe the workout" sheet. */
  onPastePlan?: () => void;
  /** Free-text change line ("press 20, half rests"); the host parses it. */
  onTextChange?: (text: string) => void;
  mode?: 'tonight' | 'author';
  resolveTarget?: (step: ExerciseStep) => number | undefined;
  refTitle?: (runsheetId: string) => string | undefined;
}

/**
 * Edit-before-start screen: white header with the workout title, "Tonight's version · 23 min ·
 * 4 blocks", Reset on the right and the free-text change line under it; the runsheet fills the
 * body; Start and Save as mine are pinned above the tab bar. In `author` mode (a new workout)
 * the title is an input and the pinned bar is Save workout + Start.
 */
export const EditorScreen = ({ runsheet, onChange, onPickExercise, onSwapExercise, onBack, onReset, onStart, onSaveAsMine, onPastePlan, onTextChange, mode = 'tonight', resolveTarget, refTitle }: EditorScreenProps) => {
  const setItems = (items: Item[]) => onChange({ ...runsheet, items });
  const minutes = runsheetMinutes(runsheet);
  const blocks = runsheet.items.filter(i => i.kind === 'block').length;
  const score = scoreType(runsheet);
  const [settings, setSettings] = useState(false);
  return (
    <div className="flex h-full min-h-0 flex-col bg-canvas">
      <header className="safe-top shrink-0 border-b border-line bg-surface px-4 pb-2.5">
        <div className="flex items-center justify-between pt-2">
          <Button variant="quiet" size="inline" onClick={onBack} className="-ml-1 text-muted">
            <ChevronLeft /> Back
          </Button>
          {onReset && (
            <Button variant="text" size="inline" onClick={onReset}>
              Reset
            </Button>
          )}
        </div>
        {mode === 'author' ? (
          <input value={runsheet.title} onChange={e => onChange({ ...runsheet, title: e.target.value })} placeholder="Workout name" aria-label="Workout name" autoFocus={!runsheet.title} className="mt-1 w-full bg-transparent text-[19px] leading-tight font-extrabold text-ink outline-none placeholder:text-faint" />
        ) : (
          <h1 className="mt-1 text-[19px] leading-tight font-extrabold text-ink">{runsheet.title}</h1>
        )}
        <button type="button" onClick={() => setSettings(x => !x)} className="mt-0.5 block text-left text-[12px] text-muted">
          {mode === 'tonight' ? "Tonight's version" : `By ${runsheet.creator ?? 'you'}`} · <b className="text-ink">{minutes} min</b> · {blocks} {blocks === 1 ? 'block' : 'blocks'}
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
              <ClipboardPaste /> Paste plan
            </Button>
          )}
        </label>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pt-3 pb-28">
        <RunsheetList items={runsheet.items} onChange={setItems} onPickExercise={onPickExercise} onSwapExercise={onSwapExercise} resolveTarget={resolveTarget} refTitle={refTitle} />
      </div>
      <div className="safe-bottom shrink-0 border-t border-line bg-surface p-3">
        <div className="flex gap-2">
          {mode === 'tonight' ? (
            <Button block onClick={onStart}>
              <Play /> Start · {minutes} min
            </Button>
          ) : (
            <Button block onClick={onSaveAsMine} disabled={!runsheet.items.length}>
              <Save /> Save workout
            </Button>
          )}
          {mode === 'tonight' ? (
            <Button variant="ghost" onClick={onSaveAsMine}>
              Save as mine
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
    </div>
  );
};
