import { useEffect, useState, type ReactNode } from 'react';
import { fetchWorkout } from '@/features/cloud/sync';
import type { Runsheet } from '@/features/runsheet/model';
import { Button } from '@/shared/components/ui/button';

type Props = { id: string; signedIn: boolean; signIn: ReactNode; onFound: (r: Runsheet) => void; onBack: () => void };

/** A `#/w/<u-id>` link to a workout not loaded yet: asks the server once, never says "not found".
 * The row → onFound (the app shows its page). Hidden → private, or, signed out, the sign-in card. */
export const SharedWorkoutRoute = ({ id, signedIn, signIn, onFound, onBack }: Props) => {
  const [state, setState] = useState<'loading' | 'private' | 'offline'>('loading');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    setState('loading');
    // No signal is not "private": with no answer from the server it may well be your own.
    fetchWorkout(id).then(
      r => live && (r ? onFound(r) : setState('private')),
      () => live && setState('offline')
    );
    return () => void (live = false);
    // onFound is a fresh arrow each render; the fetch is per id and per retry.
  }, [id, attempt]);
  if (state === 'private' && !signedIn) return <div className="p-4">{signIn}</div>;
  return <SharedWorkoutView state={state} onBack={onBack} onRetry={() => setAttempt(n => n + 1)} />;
};

export const SharedWorkoutView = ({ state, onBack, onRetry }: { state: 'loading' | 'private' | 'offline'; onBack: () => void; onRetry?: () => void }) =>
  state === 'loading' ? (
    <div role="status" className="p-6 text-center text-[15px] text-muted">
      Opening workout…
    </div>
  ) : state === 'offline' ? (
    <div className="flex flex-col items-center p-6 text-center">
      <h1 className="text-[18px] font-bold">Could not load this workout. Check your connection.</h1>
      <Button className="mt-4" onClick={onRetry}>
        Try again
      </Button>
      <Button variant="ghost" className="mt-2" onClick={onBack}>
        Back to Discover
      </Button>
    </div>
  ) : (
    <div className="flex flex-col items-center p-6 text-center">
      <h1 className="text-[18px] font-bold">This workout is private. Only its owner can open it.</h1>
      <Button className="mt-4" onClick={onBack}>
        Back to Discover
      </Button>
    </div>
  );
