import { ArrowRight, Dumbbell, Film, Gift, GitFork, Search, TrendingUp, Users } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import { ClipThumb } from '@/shared/components/ui/clip-thumb';
import { StatTiles } from '@/shared/components/ui/stat-tiles';
import { Logo } from '@/shared/brand';
import { cn } from '@/shared/utils/ui-utils';

export interface LandingScreenProps {
  onGetStarted: () => void;
  onBrowse: () => void;
  /** Catalogue size for the numbers line. */
  workoutCount?: number;
  exerciseCount?: number;
  /** A few clip thumbnails for the hero strip. */
  clips?: { clip?: string; poster?: string; name: string }[];
  className?: string;
}

const POINTS: { icon: React.ReactNode; title: string; body: string }[] = [
  { icon: <GitFork />, title: 'Any workout, made yours in seconds', body: 'Swap a move, halve the rests, drag two exercises together into a block. Tonight’s version is saved; the original stays as its creator made it.' },
  { icon: <Users />, title: 'Made by people, not a subscription', body: 'Follow a trainer, a friend or your partner. Anyone can create and share a workout; you see who made it and where it came from.' },
  { icon: <Search />, title: 'The classics, already in', body: 'CrossFit benchmarks and Open workouts, Couch to 5K, StrongLifts, 5/3/1, the 7-minute workout, NHS routines, YouTube follow-alongs, with a link to every original.' },
  { icon: <Film />, title: 'A demo for every step', body: 'Every exercise has a clip of the same model on white, in the timer and the editor. Follow-along videos run with the video as the clock.' },
  { icon: <TrendingUp />, title: 'It remembers, and it progresses', body: 'Log a score in one tap. Programs tell you next session’s weights; benchmarks keep your best. Fitbit and Google Health pull in your heart rate.' },
  { icon: <Gift />, title: 'Free and open', body: 'No paywall, no locked programs. Your logs are yours to export. Workouts you make can be shared with a link.' },
];

/**
 * Signed-out home. Wordmark, a one-line promise, a strip of demo clips, the numbers, six
 * proposition points with icons, then Get started (email code) and a Browse link that opens
 * search without an account.
 */
export const LandingScreen = ({ onGetStarted, onBrowse, workoutCount = 470, exerciseCount = 340, clips = [], className }: LandingScreenProps) => (
  <div className={cn('flex h-full min-h-0 flex-col bg-canvas', className)}>
    <div className="min-h-0 flex-1 overflow-y-auto">
      <header className="safe-top bg-surface px-5 pt-5 pb-6">
        <Logo size="md" />
        <h1 className="mt-5 text-[30px] leading-[1.08] font-black tracking-tight text-ink">
          Every workout you’ve heard of.
          <br />
          <span className="text-brand">Edited for tonight in seconds.</span>
        </h1>
        <p className="mt-3 max-w-[34ch] text-[15px] leading-relaxed text-body">One app for the workouts trainers share, the benchmarks everyone knows and the plan you actually have time for, with a demo on every step and a log that does the maths.</p>
        <div className="mt-4 flex gap-2">
          <Button block onClick={onGetStarted}>
            Get started <ArrowRight />
          </Button>
          <Button variant="ghost" onClick={onBrowse}>
            Browse
          </Button>
        </div>
      </header>

      {clips.length > 0 && (
        <div className="-mb-2 flex gap-2 overflow-x-auto px-5 py-4 [scrollbar-width:none]">
          {clips.map(c => (
            <div key={c.name} className="shrink-0 text-center">
              <ClipThumb size="lg" clip={c.clip} poster={c.poster} icon={<Dumbbell />} />
              <div className="mt-1 w-[72px] truncate text-[10px] text-muted">{c.name}</div>
            </div>
          ))}
        </div>
      )}

      <StatTiles className="px-5 pt-4 pb-2" stats={[{ value: `${workoutCount}+`, label: 'workouts' }, { value: `${exerciseCount}+`, label: 'exercises' }, { value: '£0', label: 'forever' }]} />

      <section className="space-y-2 px-5 py-4">
        {POINTS.map(p => (
          <div key={p.title} className="flex gap-3 rounded-card border border-line bg-surface p-3">
            <div className="grid size-10 shrink-0 place-items-center rounded-control bg-brand-soft text-brand [&_svg]:size-5">{p.icon}</div>
            <div className="min-w-0">
              <div className="text-[15px] font-bold">{p.title}</div>
              <div className="mt-0.5 text-[13px] leading-relaxed text-body">{p.body}</div>
            </div>
          </div>
        ))}
      </section>

      <section className="px-5 pb-6">
        <div className="rounded-card bg-ink p-4 text-white">
          <div className="text-[11px] font-bold tracking-widest text-white/60 uppercase">How it works</div>
          <ol className="mt-2 space-y-1.5 text-[14px]">
            <li>
              <b>1.</b> Pick a workout, or paste one from a message.
            </li>
            <li>
              <b>2.</b> Tap Edit and make it tonight’s: weights, rests, order.
            </li>
            <li>
              <b>3.</b> Start. Every step shows a demo and a timer.
            </li>
            <li>
              <b>4.</b> Log the score. Next time is worked out for you.
            </li>
          </ol>
          <Button block className="mt-4 bg-white text-ink active:bg-line" onClick={onGetStarted}>
            Get started, it’s free
          </Button>
          <div className="mt-2 text-center text-[11px] text-white/60">No password. We email you a 6-digit code.</div>
        </div>
      </section>
    </div>
  </div>
);
