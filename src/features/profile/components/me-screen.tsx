import { ChevronRight, Dumbbell, Settings } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import { StatTiles } from '@/shared/components/ui/stat-tiles';
import { Stepper } from '@/shared/components/ui/stepper';
import type { Avatar } from '@/features/cloud/sync';
import type { SessionResult } from '@/features/runsheet/progression';
import { streak } from '@/features/results/effort';
import type { Muscle } from '@/features/results/muscles';
import { BodyMap } from '@/features/results/components/body-map';
import { StreakLine } from '@/features/results/components/session-stats';
import { fmtMinutes, totalMinutes } from '@/features/discover/next-up';
import { AvatarView } from './settings-sheet';

export interface MeScreenProps {
  name: string;
  avatar?: Avatar;
  /** "Signed in as …" or where the logs are kept when signed out. */
  status: string;
  results: SessionResult[];
  /** Share of the last four weeks' work per muscle, 0–1. Empty hides the body map. */
  load: Partial<Record<Muscle, number>>;
  bodyweightKg?: number;
  onBodyweight: (kg: number) => void;
  onSettings: () => void;
  onOpenHistory: () => void;
  onOpenWeek: () => void;
  /**
   * The Exercises logbook entry. Its screen is built on another branch; until it lands this slot
   * shows a disabled row so the place is visible.
   */
  exercises?: React.ReactNode;
  /** Account and app settings, rendered under a "Settings" heading at the bottom. */
  children?: React.ReactNode;
}

const heading = 'px-1 pt-2 text-[11px] font-bold tracking-widest text-muted uppercase';

/**
 * The Me tab as a profile. White header: avatar, name, sign-in state, gear for the settings sheet.
 * Then four tiles two by two (sessions, this week, weeks running, time trained), the streak row, the body map
 * for the last four weeks, the Exercises row, bodyweight, and the settings passed as children last.
 */
export const MeScreen = ({ name, avatar, status, results, load, bodyweightKg, onBodyweight, onSettings, onOpenHistory, onOpenWeek, exercises, children }: MeScreenProps) => {
  const s = streak(results);
  return (
    <div className="flex h-full flex-col bg-canvas">
      <header className="safe-top bg-surface px-4 pt-3 pb-3">
        <div className="flex items-center gap-3">
          <AvatarView name={name} avatar={avatar} size={56} />
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[22px] font-extrabold">{name}</h1>
            <div className="text-[12px] text-muted">{status}</div>
          </div>
          <Button variant="quiet" size="icon" aria-label="Settings" onClick={onSettings}>
            <Settings />
          </Button>
        </div>
      </header>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-3">
        <StatTiles
          columns={2}
          stats={[
            { value: results.length, label: 'sessions', onClick: onOpenHistory },
            { value: s.thisWeek, label: 'this week', onClick: onOpenWeek },
            { value: s.weeks, label: s.weeks === 1 ? 'week running' : 'weeks running' },
            { value: fmtMinutes(totalMinutes(results)), label: 'trained' },
          ]}
        />
        {results.length > 0 && <StreakLine streak={s} />}
        {Object.keys(load).length > 0 && (
          <>
            <div className={heading}>Last 4 weeks</div>
            <BodyMap load={load} />
          </>
        )}
        {results.length === 0 && <div className="px-1 py-2 text-[13px] text-muted">Finish a workout and your weeks, streak and what you worked show up here.</div>}

        <div className={heading}>You</div>
        {exercises ?? (
          <div aria-disabled className="flex items-center gap-3 rounded-card border border-line bg-surface px-3 py-2.5 opacity-60">
            <Dumbbell className="size-5 text-muted" />
            <span className="min-w-0 flex-1">
              <span className="block text-[14px] font-semibold">Exercises</span>
              <span className="block text-[12px] text-muted">Every exercise you have logged, coming soon</span>
            </span>
            <ChevronRight className="size-4 text-faint" />
          </div>
        )}
        <div className="flex items-center justify-between gap-3 rounded-card border border-line bg-surface px-3 py-2">
          <div className="min-w-0">
            <div className="text-[14px] font-semibold">Bodyweight (kg)</div>
            <div className="text-[12px] text-muted">{bodyweightKg === undefined ? 'Not set · calories assume 80 kg' : 'For the calorie estimate'}</div>
          </div>
          <Stepper size="sm" aria-label="Bodyweight" value={bodyweightKg ?? 80} min={30} max={250} step={0.5} onChange={onBodyweight} />
        </div>

        {children && (
          <>
            <div className={heading}>Settings</div>
            {children}
          </>
        )}
      </div>
    </div>
  );
};
