import { useEffect, useState, type ReactNode } from 'react';
import { fetchWorkout } from '@/features/cloud/sync';
import type { Runsheet } from '@/features/runsheet/model';
import { Button } from '@/shared/components/ui/button';

type Props = { id: string; signedIn: boolean; signIn: ReactNode; onFound: (r: Runsheet) => void; onBack: () => void };

/** A `#/w/<u-id>` link to a workout not loaded yet: asks the server once, never says "not found".
 * The row → onFound (the app shows its page). Hidden → private, or, signed out, the sign-in card. */
export const SharedWorkoutRoute = ({ id, signedIn, signIn, onFound, onBack }: Props) => {
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    let live = true;
    fetchWorkout(id).catch(() => null).then(r => live && (r ? onFound(r) : setHidden(true)));
    return () => void (live = false);
    // onFound is a fresh arrow each render; the fetch is per id.
  }, [id]);
  if (hidden && !signedIn) return <div className="p-4">{signIn}</div>;
  return <SharedWorkoutView state={hidden ? 'private' : 'loading'} onBack={onBack} />;
};

export const SharedWorkoutView = ({ state, onBack }: { state: 'loading' | 'private'; onBack: () => void }) =>
  state === 'loading' ? (
    <div role="status" className="p-6 text-center text-[15px] text-muted">
      Opening workout…
    </div>
  ) : (
    <div className="flex flex-col items-center p-6 text-center">
      <h1 className="text-[18px] font-bold">This workout is private. Only its owner can open it.</h1>
      <Button className="mt-4" onClick={onBack}>
        Back to Discover
      </Button>
    </div>
  );
