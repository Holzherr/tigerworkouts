import { ChevronLeft, ExternalLink, Share2 } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import { WorkoutCard } from '@/features/discover/components/workout-card';
import type { Runsheet } from '@/features/runsheet/model';
import { PLATFORM_LABEL, type CreditedCreator } from '../credited';

export interface CreditedCreatorScreenProps {
  creator: CreditedCreator | null;
  loading?: boolean;
  onBack?: () => void;
  onOpen: (r: Runsheet) => void;
  onShare?: () => void;
}

/** The line every credited page carries (Nick, 7 Nov 2026). */
export const NOT_AFFILIATED = 'Workouts adapted from their posts. Not affiliated with TigerWorkouts.';

/**
 * A credited creator's page (`#/by/<key>`): no account behind it. Initials on coral-soft, the name,
 * "@handle on Instagram ↗" linking out when known, the muted line "Workouts adapted from their
 * posts. Not affiliated with TigerWorkouts.", then a count and their workout cards.
 */
export const CreditedCreatorScreen = ({ creator, loading, onBack, onOpen, onShare }: CreditedCreatorScreenProps) => {
  const initials = (creator?.name ?? '?').replace(/[^\p{L}\p{N}\s]/gu, '').split(/\s+/).filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase() || '?';
  return (
    <div className="flex h-full min-h-0 flex-col bg-canvas">
      <header className="safe-top shrink-0 bg-surface px-4 pt-2 pb-4">
        <div className="flex items-center justify-between">
          <Button variant="quiet" size="inline" onClick={onBack} className="-ml-1 text-muted">
            <ChevronLeft /> Back
          </Button>
          {onShare && creator && (
            <Button variant="ghost" size="icon" aria-label="Share this page" onClick={onShare}>
              <Share2 />
            </Button>
          )}
        </div>
        {loading ? (
          <div className="mt-4 text-[14px] text-muted">Loading…</div>
        ) : !creator ? (
          <div className="mt-4 text-[14px] text-muted">No creator by that name.</div>
        ) : (
          <>
            <div className="mt-2 flex items-center gap-3">
              <div className="grid size-16 shrink-0 place-items-center rounded-full bg-brand-soft text-[22px] font-extrabold text-brand">{initials}</div>
              <div className="min-w-0">
                <h1 className="truncate text-[22px] leading-tight font-extrabold">{creator.name}</h1>
                {creator.handle &&
                  (creator.profileUrl ? (
                    <a href={creator.profileUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[13px] font-semibold text-brand">
                      @{creator.handle} on {PLATFORM_LABEL[creator.platform ?? 'other'] ?? 'their profile'} <ExternalLink className="size-3" />
                    </a>
                  ) : (
                    <div className="text-[13px] text-muted">@{creator.handle}</div>
                  ))}
              </div>
            </div>
            <p className="mt-3 text-[13px] text-muted">{NOT_AFFILIATED}</p>
          </>
        )}
      </header>
      {creator && (
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 pt-3 pb-10">
          <div className="px-1 text-[11px] font-bold tracking-widest text-muted uppercase">
            {creator.workouts.length} {creator.workouts.length === 1 ? 'workout' : 'workouts'}
          </div>
          {creator.workouts.map(w => (
            <WorkoutCard key={w.id ?? w.title} runsheet={w} onOpen={onOpen} />
          ))}
        </div>
      )}
    </div>
  );
};
