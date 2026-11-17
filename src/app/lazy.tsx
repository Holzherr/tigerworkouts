/**
 * The screens the first paint does not need, each fetched when first shown (review D12,
 * 2026-11-15): the landing page, coaching, the workout page and editor (with the drag and drop
 * only they use), the exercise picker and CSV import. Same names and props as the
 * components themselves, so App.tsx imports them from here and reads as before.
 *
 * Mine, the timer, the result sheet and History stay in the first file: a saved workout starts
 * with no network. These chunks are in the service worker's precache after the first visit.
 */
import { useEffect, useState, type ComponentType, type ReactNode } from 'react';

/** Holds a page while its screen, or a workout that may be in the catalogue, is on its way. */
export const Holding = ({ label = 'Loading' }: { label?: string }) => (
  <div className="space-y-2 p-3" role="status" aria-label={label}>
    <div className="h-7 w-2/3 rounded-control bg-line-soft" />
    <div className="h-24 rounded-card bg-line-soft" />
    <div className="h-24 rounded-card bg-line-soft" />
  </div>
);

/** The chunk did not arrive (no signal before the service worker had it, or a deploy replaced it): say so in place, with a way to try again, rather than taking the whole app down. */
const Unloaded = ({ onRetry, floating }: { onRetry: () => void; floating?: boolean }) => (
  <div role="alert" className={floating ? 'fixed inset-x-0 bottom-20 z-50 flex justify-center px-4' : 'p-6 text-center'}>
    <div className={floating ? 'flex items-center gap-3 rounded-full bg-night py-1.5 pr-1.5 pl-4 text-[13px] font-semibold text-white shadow-lift' : 'text-[13px] text-muted'}>
      Could not load this. Check your connection.{' '}
      <button type="button" onClick={onRetry} className={floating ? 'h-9 rounded-full bg-white/10 px-3 font-bold' : 'min-h-11 font-bold text-brand-ink'}>
        Try again
      </button>
    </div>
  </div>
);

const preloads: (() => Promise<unknown>)[] = [];
/** Fetches every screen here, so each draws at once. Tests await it (src/test/setup.ts) and query the page as if nothing were lazy. */
export const preloadScreens = () => Promise.all(preloads.map(p => p()));
if (import.meta.env.MODE === 'test') (globalThis as { __preloadScreens?: typeof preloadScreens }).__preloadScreens = preloadScreens;

/** Fetches a component when first rendered; every instance after that draws at once. */
const later = <P extends object>(load: () => Promise<ComponentType<P>>, fallback: ReactNode, floating = false) => {
  let Loaded: ComponentType<P> | null = null;
  preloads.push(() => load().then(c => (Loaded = c)));
  return (p: P) => {
    const [tries, setTries] = useState(0);
    const [state, setState] = useState<'loading' | 'failed' | 'ready'>(Loaded ? 'ready' : 'loading');
    useEffect(() => {
      if (Loaded) return;
      let live = true;
      load().then(
        c => ((Loaded = c), live && setState('ready')),
        () => live && setState('failed')
      );
      return () => {
        live = false;
      };
    }, [tries]);
    if (Loaded) return <Loaded {...p} />;
    if (state === 'failed') return <Unloaded floating={floating} onRetry={() => (setState('loading'), setTries(t => t + 1))} />;
    return fallback;
  };
};

const screen = <P extends object>(load: () => Promise<ComponentType<P>>, fallback: ReactNode = <Holding />) => later(load, fallback);

/** A sheet is fetched the first time it opens, then stays mounted so it can close with its animation. */
const sheet = <P extends { open: boolean }>(load: () => Promise<ComponentType<P>>) => {
  const C = later(load, null, true);
  return (p: P) => {
    const [shown, setShown] = useState(p.open);
    if (p.open && !shown) setShown(true);
    return shown ? <C {...p} /> : null;
  };
};

const workoutPage = () => import('@/features/discover/components/workout-preview-screen');
const coaching = () => import('@/features/coaching/components/coaching-routes');
const picker = () => import('@/features/exercises/components/exercise-picker');

export const LandingScreen = screen(() => import('@/features/landing/components/landing-screen').then(m => m.LandingScreen), <div className="h-dvh bg-canvas" />);
export const TimerDemo = screen(() => import('@/features/landing/components/timer-demo').then(m => m.TimerDemo), null);
export const CoachesPage = screen(() => import('@/features/coaching/components/coaches-page').then(m => m.CoachesPage));
export const CoachRoute = screen(() => coaching().then(m => m.CoachRoute));
export const ClientRoute = screen(() => coaching().then(m => m.ClientRoute));
export const JoinRoute = screen(() => coaching().then(m => m.JoinRoute));
export const MyCoaches = screen(() => coaching().then(m => m.MyCoaches), null);
export const MyAiCoach = screen(() => coaching().then(m => m.MyAiCoach), null);
export const WorkoutPreviewScreen = screen(() => workoutPage().then(m => m.WorkoutPreviewScreen));
export const WeekTableScreen = screen(() => import('@/features/results/components/week-table-screen').then(m => m.WeekTableScreen));
export const EditorScreen = screen(() => import('@/features/runsheet/components/editor-screen').then(m => m.EditorScreen));
export const ExercisePicker = sheet(() => picker().then(m => m.ExercisePicker));
export const ImportCsvSheet = sheet(() => import('@/features/results/components/import-csv-sheet').then(m => m.ImportCsvSheet));

/**
 * After first paint: the workout page is the likeliest next tap, so it is fetched before it is
 * asked for. The exercise picker comes with it: it opens from the timer and the new-workout page,
 * where the app holds off reloading onto a new build, so it must not be fetched from there for
 * the first time after a deploy has replaced it.
 */
export const warmWorkoutPage = () => {
  void workoutPage().catch(() => {});
  void picker().catch(() => {});
};
