import { Smartphone } from 'lucide-react';
import { useState } from 'react';
import type { InviteInfo } from '@/features/cloud/coaching';
import { Logo } from '@/shared/brand';
import { Button } from '@/shared/components/ui/button';

export interface JoinScreenProps {
  /** Undefined while loading, null when the code is unknown. */
  info: InviteInfo | null | undefined;
  /** A line in place of the invite: not switched on, load error. */
  notice?: string;
  signedIn: boolean;
  /** The sign-in card, shown when signed out. */
  signIn?: React.ReactNode;
  /** Resolves to an error line, or null once linked. */
  onAccept: () => Promise<string | null>;
  /** After accepting: on to the workouts. */
  onContinue: () => void;
  /** Opens the invite in the iPhone app (tigerworkouts://join/<code>). */
  appHref?: string;
}

/**
 * Where an invite link lands: who invited you, what accepting means, sign-in when needed (a coach
 * link needs an account; guests can still run shared workouts), then Accept.
 */
export const JoinScreen = ({ info, notice, signedIn, signIn, onAccept, onContinue, appHref }: JoinScreenProps) => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const accept = async () => {
    setBusy(true);
    const err = await onAccept();
    setBusy(false);
    setError(err);
    if (!err) setDone(true);
  };
  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto bg-canvas">
      <div className="safe-top bg-surface px-5 py-3">
        <Logo size="sm" />
      </div>
      <div className="space-y-3 px-4 py-5">
        {notice ? (
          <div className="rounded-card border border-line bg-surface px-3 py-3 text-[14px] text-muted">{notice}</div>
        ) : info === undefined ? (
          <div className="text-[14px] text-muted">Loading…</div>
        ) : info === null ? (
          <div className="rounded-card border border-line bg-surface px-3 py-3 text-[14px] text-muted">That invite link does not work. Ask your coach for a new one.</div>
        ) : done ? (
          <div className="space-y-3 rounded-card border border-line bg-surface p-4">
            <h1 className="text-[20px] leading-tight font-extrabold">You’re training with {info.name}</h1>
            <p className="text-[14px] text-body">Workouts they send you show at the top of Discover, under From your coach.</p>
            <Button block onClick={onContinue}>
              See my workouts
            </Button>
          </div>
        ) : (
          <>
            <div className="space-y-2 rounded-card border border-line bg-surface p-4">
              <div className="grid size-14 place-items-center rounded-full bg-brand-soft text-[20px] font-extrabold text-brand">{info.name.split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase()}</div>
              <h1 className="text-[20px] leading-tight font-extrabold">{info.name} invited you to train with them on TigerWorkouts</h1>
              <ul className="space-y-0.5 text-[13px] text-muted">
                <li>· They send you workouts; you run them with the timer</li>
                <li>· They see the sessions you log, and you can swap notes</li>
                <li>· You can stop coaching any time in Me</li>
              </ul>
              {info.accepted && <p className="text-[13px] text-warn">This invite has been used. If it was you, accept again to rejoin.</p>}
              {signedIn && (
                <Button block onClick={accept} disabled={busy}>
                  {busy ? 'Accepting…' : 'Accept'}
                </Button>
              )}
              {error && <div className="text-[13px] text-danger">{error}</div>}
            </div>
            {!signedIn && (
              <>
                <p className="px-1 text-[13px] text-muted">Linking to a coach needs a free account. Without one you can still run workouts people share with you.</p>
                {signIn}
              </>
            )}
          </>
        )}
        {appHref && (
          <a href={appHref} className="inline-flex items-center gap-1.5 px-1 text-[13px] font-bold text-brand">
            <Smartphone className="size-4" /> Open in the iPhone app
          </a>
        )}
      </div>
    </div>
  );
};
