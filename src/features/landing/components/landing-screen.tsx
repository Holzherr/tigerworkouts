import { ArrowRight, Film, Gift, GitFork, Search, TrendingUp, Users } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import { ClipThumb } from '@/shared/components/ui/clip-thumb';
import { StatTiles } from '@/shared/components/ui/stat-tiles';
import { Logo, TigerMark } from '@/shared/brand';
import { cn } from '@/shared/utils/ui-utils';
import { PhoneFrame } from './phone-frame';

export interface LandingScreenProps {
  onGetStarted: () => void;
  onBrowse: () => void;
  onSignIn?: () => void;
  workoutCount?: number;
  exerciseCount?: number;
  /** A few clip thumbnails for the mobile strip. */
  clips?: { clip?: string; poster?: string; name: string }[];
  /** Poster paths for the desktop marquee. */
  stills?: string[];
  /** Live app screen for the hero phone (e.g. <TimerDemo />). Falls back to a static card. */
  demo?: React.ReactNode;
  className?: string;
}

const POINTS: { icon: React.ReactNode; title: string; body: string }[] = [
  { icon: <GitFork />, title: 'Any workout, made yours in seconds', body: 'Swap a move, halve the rests, drag two exercises together into a block. Tonight’s version is saved; the original stays as its creator made it.' },
  { icon: <Users />, title: 'Made by people, not a subscription', body: 'Follow a trainer, a friend or your partner. Anyone can create and share a workout; you see who made it and where it came from.' },
  { icon: <Search />, title: 'The classics, already in', body: 'CrossFit benchmarks and Open workouts, Couch to 5K, StrongLifts, 5/3/1, the 7-minute workout, NHS routines, YouTube follow-alongs, each linked to its original.' },
  { icon: <Film />, title: 'A demo for every step', body: 'Every exercise has a clip of the same model on white, in the timer and the editor. Follow-along videos run with the video as the clock.' },
  { icon: <TrendingUp />, title: 'It remembers, and it progresses', body: 'Log a score in one tap. Programs tell you next session’s weights; benchmarks keep your best. Fitbit and Google Health bring in your heart rate.' },
  { icon: <Gift />, title: 'Free and open', body: 'No paywall, no locked programs. Your logs are yours to export. Workouts you make can be shared with a link.' },
];

const STEPS = [
  ['Pick', 'a workout, or paste one from a message.'],
  ['Edit', 'it for tonight: weights, rests, order.'],
  ['Start.', 'Every step shows a demo and a timer.'],
  ['Log', 'the score. Next time is worked out for you.'],
];

const SOURCES = ['CrossFit benchmarks', 'The Open', 'Hero WODs', 'Couch to 5K', 'NHS workouts', 'StrongLifts 5×5', 'Starting Strength', '5/3/1', 'GZCLP', 'Hyrox', 'The 7-minute workout', 'Tabata', 'YouTube follow-alongs'];

/**
 * Signed-out home. On a phone: a single column with the wordmark, headline, clip strip, numbers,
 * six proposition cards and a dark How it works panel. From 1024px: a top bar, a split hero with
 * the headline left and a live phone (the real timer) on a coral glow right, a scrolling marquee
 * of exercise stills, a three-column feature grid, a four-step dark band, a sources row and a
 * closing call to action.
 */
export const LandingScreen = ({ onGetStarted, onBrowse, onSignIn, workoutCount = 470, exerciseCount = 340, clips = [], stills = [], demo, className }: LandingScreenProps) => (
  <div className={cn('flex h-full min-h-0 flex-col bg-canvas', className)}>
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="safe-top sticky top-0 z-20 border-b border-line/60 bg-surface/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3 lg:px-8">
          <Logo size="sm" />
          <div className="flex items-center gap-2">
            <Button variant="quiet" size="sm" onClick={onBrowse} className="hidden sm:inline-flex">
              Browse workouts
            </Button>
            {onSignIn && (
              <Button variant="ghost" size="sm" onClick={onSignIn}>
                Sign in
              </Button>
            )}
            <Button size="sm" onClick={onGetStarted}>
              Get started
            </Button>
          </div>
        </div>
      </div>

      <section className="relative overflow-hidden bg-surface">
        <div className="pointer-events-none absolute -top-40 right-[-10%] hidden size-[720px] rounded-full bg-[radial-gradient(closest-side,rgba(255,77,46,.22),transparent)] lg:block" aria-hidden />
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-5 pt-10 pb-8 lg:grid-cols-[1.1fr_1fr] lg:px-8 lg:pt-20 lg:pb-16">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-brand-line bg-brand-soft px-3 py-1 text-[12px] font-bold text-brand-ink">
              <TigerMark size={14} /> Free · open · yours
            </div>
            <h1 className="mt-5 text-[34px] leading-[1.02] font-black tracking-[-0.02em] text-ink sm:text-[46px] lg:text-[64px]">
              Every workout you’ve heard of.
              <br />
              <span className="text-brand">Edited for tonight in seconds.</span>
            </h1>
            <p className="mt-5 max-w-[46ch] text-[16px] leading-relaxed text-body lg:text-[18px]">One app for the workouts trainers share, the benchmarks everyone knows and the plan you actually have time for, with a demo on every step and a log that does the maths.</p>
            <div className="mt-7 flex flex-wrap gap-2">
              <Button size="lg" onClick={onGetStarted}>
                Get started <ArrowRight />
              </Button>
              <Button size="lg" variant="ghost" onClick={onBrowse}>
                Browse {workoutCount}+ workouts
              </Button>
            </div>
            <div className="mt-6 hidden flex-wrap gap-x-6 gap-y-1 text-[13px] text-muted lg:flex">
              <span>
                <b className="text-ink">{workoutCount}+</b> workouts
              </span>
              <span>
                <b className="text-ink">{exerciseCount}+</b> exercises with demos
              </span>
              <span>
                <b className="text-ink">£0</b>, forever
              </span>
            </div>
          </div>
          <div className="relative hidden justify-center lg:flex">
            <PhoneFrame width={300} className="rotate-[-2deg]">
              {demo ?? <StaticDemo />}
            </PhoneFrame>
            <div className="absolute -bottom-6 -left-6 hidden w-[240px] rounded-card border border-line bg-surface p-3 shadow-lift xl:block">
              <div className="text-[11px] font-bold tracking-widest text-muted uppercase">Next time</div>
              <div className="mt-1 flex items-center justify-between text-[13px]">
                <span className="font-semibold">Barbell back squat</span>
                <span className="font-bold tabular-nums">
                  60 <span className="text-faint">→</span> 62.5 kg
                </span>
              </div>
              <div className="text-[11px] text-muted">all sets done: +2.5 kg</div>
            </div>
          </div>
        </div>
        {clips.length > 0 && (
          <div className="flex gap-2 overflow-x-auto px-5 pb-6 [scrollbar-width:none] lg:hidden">
            {clips.map(c => (
              <div key={c.name} className="shrink-0 text-center">
                <ClipThumb size="lg" clip={c.clip} poster={c.poster} icon="🏋️" />
                <div className="mt-1 w-[72px] truncate text-[10px] text-muted">{c.name}</div>
              </div>
            ))}
          </div>
        )}
      </section>

      {stills.length > 0 && (
        <div className="hidden overflow-hidden border-y border-line bg-surface py-4 lg:block" aria-hidden>
          <div className="flex w-max gap-3 motion-safe:animate-[marquee_60s_linear_infinite]">
            {[...stills, ...stills].map((p, i) => (
              <img key={i} src={p} alt="" loading="lazy" className="h-[120px] w-[90px] rounded-control object-cover object-top" />
            ))}
          </div>
        </div>
      )}

      <div className="px-5 pt-4 lg:hidden">
        <StatTiles stats={[{ value: `${workoutCount}+`, label: 'workouts' }, { value: `${exerciseCount}+`, label: 'exercises' }, { value: '£0', label: 'forever' }]} />
      </div>

      <section className="mx-auto max-w-6xl px-5 py-8 lg:px-8 lg:py-16">
        <h2 className="hidden text-[13px] font-bold tracking-widest text-muted uppercase lg:block">Why it’s different</h2>
        <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:mt-6 lg:grid-cols-3 lg:gap-5">
          {POINTS.map(p => (
            <div key={p.title} className="flex gap-3 rounded-card border border-line bg-surface p-4 lg:flex-col lg:gap-4 lg:p-6">
              <div className="grid size-10 shrink-0 place-items-center rounded-control bg-brand-soft text-brand [&_svg]:size-5 lg:size-12 lg:[&_svg]:size-6">{p.icon}</div>
              <div className="min-w-0">
                <div className="text-[15px] font-bold lg:text-[18px]">{p.title}</div>
                <div className="mt-1 text-[13px] leading-relaxed text-body lg:text-[15px]">{p.body}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-ink text-white">
        <div className="mx-auto max-w-6xl px-5 py-8 lg:px-8 lg:py-16">
          <div className="text-[11px] font-bold tracking-widest text-white/60 uppercase lg:text-[13px]">How it works</div>
          <ol className="mt-3 grid gap-3 lg:mt-8 lg:grid-cols-4 lg:gap-8">
            {STEPS.map(([verb, rest], i) => (
              <li key={verb} className="flex gap-3 lg:block">
                <span className="text-[14px] font-black text-brand lg:text-[40px] lg:leading-none">{i + 1}.</span>
                <span className="text-[14px] lg:mt-3 lg:block lg:text-[18px]">
                  <b>{verb}</b> {rest}
                </span>
              </li>
            ))}
          </ol>
          <div className="mt-6 flex flex-wrap items-center gap-3 lg:mt-12">
            <Button size="lg" className="bg-white text-ink active:bg-line" onClick={onGetStarted}>
              Get started, it’s free
            </Button>
            <span className="text-[12px] text-white/60">No password. We email you a 6-digit code.</span>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-8 lg:px-8 lg:py-14">
        <div className="text-[11px] font-bold tracking-widest text-muted uppercase lg:text-[13px]">Already in the library</div>
        <div className="mt-3 flex flex-wrap gap-2">
          {SOURCES.map(s => (
            <span key={s} className="rounded-full border border-line bg-surface px-3 py-1.5 text-[13px] font-semibold text-body">
              {s}
            </span>
          ))}
        </div>
        <p className="mt-4 max-w-[70ch] text-[13px] text-muted">Public benchmarks, government-licensed routines and freely published programs, each linked to its source. Paywalled programs are not copied.</p>
      </section>

      <footer className="border-t border-line bg-surface">
        <div className="mx-auto flex max-w-6xl flex-col items-start gap-2 px-5 py-6 text-[12px] text-muted sm:flex-row sm:items-center sm:justify-between lg:px-8">
          <Logo size="sm" />
          <span>Made in London. Free, open, and yours to export.</span>
        </div>
      </footer>
    </div>
  </div>
);

/** Fallback hero screen when no live demo is passed (Storybook, tests). */
const StaticDemo = () => (
  <div className="flex h-full flex-col bg-ink p-4 text-white">
    <div className="text-[12px] text-white/60">Swings + incline press · Round 3 of 8</div>
    <div className="py-8 text-center text-[64px] leading-none font-black tabular-nums">0:21</div>
    <div className="rounded-card bg-white p-3 text-ink">
      <div className="text-[16px] font-extrabold">Kettlebell swings</div>
      <div className="text-[12px] text-muted">30s · 28 kg</div>
    </div>
  </div>
);
