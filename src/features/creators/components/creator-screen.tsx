import { ChevronLeft, Share2, Smartphone } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import type { CreatorProfile } from '@/features/cloud/sync';
import { WorkoutCard } from '@/features/discover/components/workout-card';
import type { Runsheet } from '@/features/runsheet/model';

export interface CreatorScreenProps {
  profile: CreatorProfile | null;
  workouts: Runsheet[];
  loading?: boolean;
  onBack?: () => void;
  onOpen: (r: Runsheet) => void;
  onShare?: () => void;
}

/** Opens the iOS app on this creator when it is installed; the app shows their workouts. */
export const appLink = (path: string) => `tigerworkouts://${path}`;

/**
 * A creator's public page: who they are and the workouts they chose to share. Anyone with the link
 * can open a workout and do it here in the browser — an account is only needed to keep history.
 */
export const CreatorScreen = ({ profile, workouts, loading, onBack, onOpen, onShare }: CreatorScreenProps) => {
  const initials = (profile?.name ?? '?').split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
  return (
    <div className="flex h-full min-h-0 flex-col bg-canvas">
      <header className="safe-top shrink-0 bg-surface px-4 pt-2 pb-4">
        <div className="flex items-center justify-between">
          <Button variant="quiet" size="inline" onClick={onBack} className="-ml-1 text-muted">
            <ChevronLeft /> Back
          </Button>
          {onShare && profile && (
            <Button variant="ghost" size="icon" aria-label="Share this page" onClick={onShare}>
              <Share2 />
            </Button>
          )}
        </div>
        {loading ? (
          <div className="mt-4 text-[14px] text-muted">Loading…</div>
        ) : !profile ? (
          <div className="mt-4 text-[14px] text-muted">No creator by that name.</div>
        ) : (
          <div className="mt-2 flex items-center gap-3">
            <div className="grid size-16 shrink-0 place-items-center rounded-full bg-brand-soft text-[22px] font-extrabold text-brand">{initials}</div>
            <div className="min-w-0">
              <h1 className="truncate text-[22px] leading-tight font-extrabold">{profile.name}</h1>
              {profile.handle && <div className="text-[13px] text-muted">@{profile.handle}</div>}
            </div>
          </div>
        )}
        {profile?.bio && <p className="mt-3 text-[14px] leading-relaxed whitespace-pre-line text-body">{profile.bio}</p>}
        {profile && (
          <a href={appLink(`c/${profile.handle ?? profile.id}`)} className="mt-3 inline-flex items-center gap-1.5 text-[13px] font-bold text-brand">
            <Smartphone className="size-4" /> Open in the TigerWorkouts app
          </a>
        )}
      </header>
      {profile && (
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 pt-3 pb-10">
          <div className="px-1 text-[11px] font-bold tracking-widest text-muted uppercase">
            {workouts.length} {workouts.length === 1 ? 'workout' : 'workouts'}
          </div>
          {workouts.map(w => (
            <WorkoutCard key={w.id} runsheet={w} onOpen={onOpen} />
          ))}
          {!workouts.length && <div className="px-1 text-[14px] text-muted">Nothing public yet.</div>}
        </div>
      )}
    </div>
  );
};
