import { Button } from '@/shared/components/ui/button';
import { runsheetMinutes, type Runsheet } from '@/features/runsheet/model';

export interface ImportScreenProps {
  runsheet: Runsheet | null;
  onSave: (r: Runsheet) => void;
  onDiscard: () => void;
}

/** Landing for a shared link: who made it, how long, and Save to my workouts or Not now. */
export const ImportScreen = ({ runsheet, onSave, onDiscard }: ImportScreenProps) => (
  <div className="flex h-full flex-col items-center justify-center bg-canvas p-6 text-center">
    {runsheet ? (
      <>
        <div className="text-[11px] font-bold tracking-widest text-muted uppercase">Shared workout</div>
        <h1 className="mt-2 text-[22px] font-extrabold">{runsheet.title}</h1>
        <div className="mt-1 text-[13px] text-muted">
          by {runsheet.creator ?? 'a friend'} · {runsheetMinutes(runsheet)} min · {runsheet.items.length} {runsheet.items.length === 1 ? 'item' : 'items'}
        </div>
        <div className="mt-6 flex w-full max-w-[320px] gap-2">
          <Button block onClick={() => onSave(runsheet)}>
            Save to my workouts
          </Button>
          <Button variant="ghost" onClick={onDiscard}>
            Not now
          </Button>
        </div>
      </>
    ) : (
      <>
        <h1 className="text-[18px] font-bold">This link didn't work</h1>
        <p className="mt-1 text-[13px] text-muted">Ask for it to be shared again from the workout page.</p>
        <Button className="mt-4" variant="ghost" onClick={onDiscard}>
          Back
        </Button>
      </>
    )}
  </div>
);
