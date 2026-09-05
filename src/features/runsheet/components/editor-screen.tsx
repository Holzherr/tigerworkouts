import { ChevronLeft, ClipboardPaste, PenLine, Play } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import { runsheetMinutes, type ExerciseStep, type Item, type Runsheet } from '../model';
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
}

/**
 * Edit-before-start screen: white header with the workout title, "Tonight's version · 23 min ·
 * 4 blocks", Reset on the right and the free-text change line under it; the runsheet fills the
 * body; Start and Save as mine are pinned above the tab bar.
 */
export const EditorScreen = ({ runsheet, onChange, onPickExercise, onSwapExercise, onBack, onReset, onStart, onSaveAsMine, onPastePlan, onTextChange, mode = 'tonight' }: EditorScreenProps) => {
  const setItems = (items: Item[]) => onChange({ ...runsheet, items });
  const minutes = runsheetMinutes(runsheet);
  const blocks = runsheet.items.filter(i => i.kind === 'block').length;
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
        <h1 className="mt-1 text-[19px] leading-tight font-extrabold text-ink">{runsheet.title}</h1>
        <div className="mt-0.5 text-[12px] text-muted">
          {mode === 'tonight' ? "Tonight's version" : `By ${runsheet.creator ?? 'you'}`} · <b className="text-ink">{minutes} min</b> · {blocks} {blocks === 1 ? 'block' : 'blocks'}
        </div>
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
        <RunsheetList items={runsheet.items} onChange={setItems} onPickExercise={onPickExercise} onSwapExercise={onSwapExercise} />
      </div>
      <div className="safe-bottom shrink-0 border-t border-line bg-surface p-3">
        <div className="flex gap-2">
          <Button block onClick={onStart}>
            <Play /> {mode === 'tonight' ? `Start · ${minutes} min` : 'Save workout'}
          </Button>
          {mode === 'tonight' && (
            <Button variant="ghost" onClick={onSaveAsMine}>
              Save as mine
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};
